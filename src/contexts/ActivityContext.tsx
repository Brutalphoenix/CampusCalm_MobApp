import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useAuth } from "./AuthContext";
import { onDocSnapshot, setDocData, type TimetableEntry } from "@/lib/realFirebase";
import { logScreenUnlock, syncDataToAdmin, logNetworkEvent, initializeMonitoring } from "@/lib/monitoringService";
import { notifyMonitoringStatus, requestAdminNotification } from "@/lib/notificationService";
import { serverTimestamp, increment } from "firebase/firestore";
import { App } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { BackgroundTask } from "@capawesome/capacitor-background-task";
import { ForegroundService } from "@capawesome-team/capacitor-android-foreground-service";

interface ActivityContextType {
  monitoring: boolean;
  activity: { screenTime: number; unlockCount: number };
}

const ActivityContext = createContext<ActivityContextType>({
  monitoring: false,
  activity: { screenTime: 0, unlockCount: 0 },
});

export const useActivity = () => useContext(ActivityContext);

export const ActivityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const [monitoring, setMonitoring] = useState(false);
  const [activity, setActivity] = useState({ screenTime: 0, unlockCount: 0 });
  const lastVisibleStartTimeRef = useRef<number | null>(document.visibilityState === "visible" ? Date.now() : null);
  const accumulatedMsRef = useRef(0);
  const wasMonitoringRef = useRef(false);
  const currentClassIdRef = useRef<string | null>(null);
  const currentClassNameRef = useRef<string>("Unknown");

  useEffect(() => {
    if (!profile || profile.role !== "student" || profile.blocked) {
      setMonitoring(false);
      ForegroundService.stopForegroundService().catch(() => {});
      setActivity({ screenTime: 0, unlockCount: 0 });
      return;
    }

    let settings: { active?: boolean; startTime?: string; endTime?: string; timetable?: TimetableEntry[] } | null = null;

    const checkMonitoring = () => {
      if (!settings) return;
      
      const now = new Date();
      
      // Manual Deactivation Check
      if (settings.active === false) {
        setMonitoring(false);
        return;
      }

      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTimeInMinutes = currentHours * 60 + currentMinutes;
      const today = now.toLocaleDateString("en-US", { weekday: "long" });
      
      // Override Window Check
      const [osh, osm] = (settings.startTime || "00:00").split(":").map(Number);
      const [oeh, oem] = (settings.endTime || "23:59").split(":").map(Number);
      const startTimeInMinutes = osh * 60 + osm;
      const endTimeInMinutes = oeh * 60 + oem;
      const inOverrideWindow = currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
      
      // Timetable Check
      const timetable = settings.timetable || [];
      const currentClass = timetable.find((entry: TimetableEntry) => {
        if (entry.day !== today) return false;
        const [sh, sm] = entry.startTime.split(":").map(Number);
        const [eh, em] = entry.endTime.split(":").map(Number);
        return currentTimeInMinutes >= (sh * 60 + sm) && currentTimeInMinutes < (eh * 60 + em);
      });

      const isBreak = currentClass?.subject.toLowerCase().includes("break");
      const inClass = !!currentClass && !isBreak;
      
      currentClassIdRef.current = currentClass?.id || null;
      currentClassNameRef.current = currentClass?.subject || "Unknown";

      // NEW: Absent Status Reset Logic
      // If student is currently "Blocked" (from marking themselves absent)
      // and a new monitoring period (class) has started on a DIFFERENT day,
      // reset the blocked status so they are prompted again.
      if (profile?.blocked && inClass) {
        const absentDates = (profile.absentDates as string[]) || [];
        const lastAbsentDate = absentDates[absentDates.length - 1];
        const todayStr = new Date().toLocaleDateString();
        
        if (lastAbsentDate !== todayStr) {
          console.log("[ACTIVITY] New day class started. Resetting absent status...");
          // We use setDocData to clear the blocked flag in Firestore
          setDocData(`users/${profile.uid}`, { 
            blocked: false 
          }).catch(err => console.error("[ACTIVITY] Failed to reset absent status:", err));
        }
      }

      // Monitoring is active only if:
      // 1. Master toggle is ON
      // 2. Student is in a scheduled class
      // 3. AND student is NOT blocked (not marked as absent for today)
      const isNowMonitoring = !!settings.active && inClass && !profile?.blocked;
      
      // RESET LOGIC: Transition from Monitoring ON -> OFF
      if (wasMonitoringRef.current && !isNowMonitoring) {
        console.log("[ACTIVITY] Monitoring ended. Triggering batch sync...");
        ForegroundService.stopForegroundService().catch(() => {});
        
        if (profile?.uid) {
          // Check if it's the final class of the day before master sync
          const timetable = settings.timetable || [];
          const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
          const todayClasses = timetable.filter((t: any) => t.day === today)
            .sort((a: any, b: any) => a.endTime.localeCompare(b.endTime));
          
          const lastClass = todayClasses[todayClasses.length - 1];
          const isFinalClass = lastClass && lastClass.id === currentClassIdRef.current;

          if (isFinalClass) {
            console.log("[ACTIVITY] Final class ended. Triggering MASTER sync...");
            syncDataToAdmin(profile.uid).catch(err => 
              console.error("[ACTIVITY] Master sync failed:", err)
            );
          }
        }
        // NEW: Student Local Notification (Ended)
        notifyMonitoringStatus(false);
      } else if (!wasMonitoringRef.current && isNowMonitoring) {
        // Transition from OFF -> ON
        ForegroundService.startForegroundService({
          id: 112,
          title: 'CampusCalm Monitoring',
          body: 'Your screen activity is actively monitored by your administrator.',
          smallIcon: 'ic_launcher'
        }).catch(() => {});
        
        // NEW: Student Local Notification (Started)
        notifyMonitoringStatus(true);
        
        // NEW: Admin Cloud Alert (Session Started)
        if (profile?.createdBy) {
          requestAdminNotification(profile.createdBy, 'SESSION_START', profile.name);
        }
        
        if (lastVisibleStartTimeRef.current !== null) {
          lastVisibleStartTimeRef.current = Date.now();
        }
      }
      
      wasMonitoringRef.current = isNowMonitoring;
      setMonitoring(isNowMonitoring);
    };

    const resetActivityData = async () => {
      try {
        const todayStr = new Date().toDateString();
        await setDocData(`activity/${profile.uid}`, {
          screenTime: 0,
          unlockCount: 0,
          lastActive: serverTimestamp(),
          lastUpdateDate: todayStr
        });
        
        // Also reset history for today to 0
        const weekday = new Date().toLocaleDateString("en-US", { weekday: "short" });
        await setDocData(`users/${profile.uid}/dailyHistory/${weekday}`, {
          screenTime: 0
        });
        
        accumulatedMsRef.current = 0;
        setActivity({ screenTime: 0, unlockCount: 0 });
      } catch (err) {
        console.error("Reset error:", err);
      }
    };

    const updateActivity = async (isUnlock = false) => {
      try {
        const now = Date.now();
        const todayStr = new Date().toDateString();

        // 0. CHECK FOR MIDNIGHT RESET
        // @ts-ignore - access private activity state via capture or just use closure
        const currentActivitySnap = activity as any;
        if (currentActivitySnap.lastUpdateDate && currentActivitySnap.lastUpdateDate !== todayStr) {
          console.log("[ACTIVITY] Midnight detected! Resetting data...");
          await resetActivityData();
          return;
        }
        
        if (wasMonitoringRef.current && lastVisibleStartTimeRef.current !== null) {
          const elapsed = now - lastVisibleStartTimeRef.current;
          accumulatedMsRef.current += elapsed;
        }
        
        if (lastVisibleStartTimeRef.current !== null) {
          lastVisibleStartTimeRef.current = now;
        }

        const screenTimeIncrement = Math.floor(accumulatedMsRef.current / 60000);
        
        if (screenTimeIncrement > 0 || (isUnlock && wasMonitoringRef.current)) {
          if (screenTimeIncrement > 0) {
            accumulatedMsRef.current -= screenTimeIncrement * 60000;
          }
          
          await setDocData(`activity/${profile.uid}`, {
            screenTime: increment(screenTimeIncrement),
            unlockCount: increment(isUnlock ? 1 : 0),
            lastActive: serverTimestamp(),
            lastUpdateDate: todayStr
          });

          // Always save history if it's one of the 7 days
          const weekday = new Date().toLocaleDateString("en-US", { weekday: "short" });
          if (["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(weekday)) {
            await setDocData(`users/${profile.uid}/dailyHistory/${weekday}`, {
              screenTime: increment(screenTimeIncrement)
            });
          }
        } else {
          // Keep heartbeat alive even if not incrementing
          await setDocData(`activity/${profile.uid}`, {
            lastActive: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error("Update error:", err);
      }
    };

    const handleAppPause = async () => {
      try {
        const taskId = await BackgroundTask.beforeExit(async () => {
          await updateActivity(false);
          lastVisibleStartTimeRef.current = null;
          BackgroundTask.finish({ taskId });
        });
      } catch (e) {
        // Fallback for web where BackgroundTask might fail
        updateActivity(false);
        lastVisibleStartTimeRef.current = null;
      }
    };

    const handleAppResume = () => {
      if (lastVisibleStartTimeRef.current === null) {
        lastVisibleStartTimeRef.current = Date.now();
        updateActivity(true);
        
        // NEW: Offline-First Local Logging for Screen Unlock
        if (monitoring) {
          logScreenUnlock(currentClassNameRef.current);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleAppResume();
      } else {
        handleAppPause();
      }
    };

    const appStateListener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) handleAppResume();
      else handleAppPause();
    });

    // NEW: Network Status Listener for History Tracking
    const networkListener = Network.addListener('networkStatusChange', (status) => {
      // Access current state via ref or closure safely
      if (wasMonitoringRef.current) {
        logNetworkEvent(status.connected, currentClassNameRef.current);
      }
    });

    // Robust save-on-close logic
    const handleUnload = () => {
      // Final flush of any accumulated time
      updateActivity(false);
    };

    const schedulePath = (profile as any)?.createdBy ? `users/${(profile as any).createdBy}/settings/monitoring` : "settings/monitoring";
    const schedUnsub = onDocSnapshot(schedulePath, (snap) => {
      try {
        if (snap.exists()) {
          settings = snap.data() as typeof settings;
          checkMonitoring();
        }
      } catch (err) {
        console.error("ActivityContext snapshot error", err);
      }
    });

    const actUnsub = onDocSnapshot(`activity/${profile.uid}`, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as { screenTime?: number; unlockCount?: number };
        setActivity({
          screenTime: data.screenTime || 0,
          unlockCount: data.unlockCount || 0
        });
      }
    });

    // Send UID to Service Worker for background monitoring
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SET_UID',
        uid: profile.uid
      });
      
      // Request Periodic Sync if supported
      const registerPeriodicSync = async () => {
        const registration = await navigator.serviceWorker.ready;
        try {
          if ('periodicSync' in registration) {
            // @ts-expect-error - periodicSync is not yet in the official ServiceWorkerRegistration type
            await registration.periodicSync.register('monitoring-heartbeat', {
              minInterval: 15 * 60 * 1000, // Every 15 minutes
            });
            console.log('Periodic Sync registered');
          }
        } catch (e) {
          console.log('Periodic Sync could not be registered:', e);
        }
      };
      
      registerPeriodicSync();
    }

    // NEW: Ensure monitoring engine is initialized on refresh/restart
    if (profile?.uid && profile.role === "student") {
      initializeMonitoring(profile.uid, profile.email);
    }

    const monitoringInterval = setInterval(checkMonitoring, 1000); // Check every 1s
    const activityInterval = setInterval(() => updateActivity(false), 30000); // Heartbeat every 30s
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handleUnload); // Modern alternative for mobile
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      schedUnsub();
      actUnsub();
      clearInterval(monitoringInterval);
      clearInterval(activityInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handleUnload);
      window.removeEventListener("beforeunload", handleUnload);
      appStateListener.then(l => l.remove());
      networkListener.then(l => l.remove());
    };
  }, [profile]);

  return (
    <ActivityContext.Provider value={{ monitoring, activity }}>
      {children}
    </ActivityContext.Provider>
  );
};
