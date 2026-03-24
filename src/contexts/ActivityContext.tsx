import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useAuth } from "./AuthContext";
import { onDocSnapshot, setDocData, type TimetableEntry } from "@/lib/realFirebase";
import { logScreenUnlock, syncDataToAdmin, logNetworkEvent, initializeMonitoring } from "@/lib/monitoringService";
import { notifyMonitoringStatus, requestAdminNotification, initializeNotifications } from "@/lib/notificationService";
import { serverTimestamp, increment } from "firebase/firestore";
import { App } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { Preferences } from "@capacitor/preferences";
import { BackgroundTask } from "@capawesome/capacitor-background-task";
import { ForegroundService } from "@capawesome-team/capacitor-android-foreground-service";
import { toast } from "sonner";
import { logErrorToStorage } from "@/lib/errorLogger";

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
  const prevClassIdRef = useRef<string | null>(null);
  const currentClassNameRef = useRef<string>("Unknown");
  const lastDateRef = useRef<string>(new Date().toDateString());

  const isFGSRunningRef = useRef(false);
  const lastBatteryAlertRef = useRef(0);
  const restartsCounterRef = useRef({ count: 0, lastReset: Date.now() });

  useEffect(() => {
    if (!profile || profile.role !== "student" || profile.blocked) {
      setMonitoring(false);
      if (isFGSRunningRef.current) {
        ForegroundService.stopForegroundService().catch(() => {});
        isFGSRunningRef.current = false;
        Preferences.set({ key: 'fgs_active', value: 'false' }).catch(() => {});
      }
      setActivity({ screenTime: 0, unlockCount: 0 });
      return;
    }

    // Enterprise Pass: Force-Stop Detection & Recovery
    const checkForceStop = async () => {
      const { value: lastUpdate } = await Preferences.get({ key: 'last_update_ts' });
      const now = Date.now();
      if (lastUpdate) {
        const gap = now - parseInt(lastUpdate);
        if (gap > 600000) { // 10 minutes gap = likely force stop or kill
          console.warn(`[RECOVERY] Force-stop detected. Gap: ${Math.round(gap/60000)}m`);
          logErrorToStorage(`System Force-Stop Detected (Gap: ${Math.round(gap/1000)}s)`, 'CUSTOM');
          toast.warning("Monitoring Interrupted", {
            description: "CampusCalm was stopped by the system. Resuming monitoring now...",
            duration: 5000
          });
          syncDataToAdmin(profile.uid).catch(() => {});
        }
      }
    };
    checkForceStop();

    let settings: { active?: boolean; startTime?: string; endTime?: string; timetable?: TimetableEntry[] } | null = null;
    let baseActivity = { screenTime: 0, unlockCount: 0 };
    let sessionActivity = { screenTime: 0, unlockCount: 0 };

    const startFGS = async (className: string) => {
      // Cooldown check (Max 3 restarts per hour)
      const now = Date.now();
      if (now - restartsCounterRef.current.lastReset > 3600000) {
        restartsCounterRef.current = { count: 0, lastReset: now };
      }

      if (restartsCounterRef.current.count >= 3) {
        console.error("[WATCHDOG] Max restart attempts reached. Cooldown active.");
        return;
      }

      const granted = await initializeNotifications(profile.uid, profile.role);
      if (granted) {
        try {
          await ForegroundService.startForegroundService({
            id: 112,
            title: 'CampusCalm Monitoring',
            body: `Monitoring: ${className}`,
            smallIcon: 'ic_launcher'
          });
          isFGSRunningRef.current = true;
          restartsCounterRef.current.count++;
          await Preferences.set({ key: 'fgs_active', value: 'true' });
          return true;
        } catch (err) {
          console.error("[ACTIVITY] FGS start failed:", err);
          isFGSRunningRef.current = false;
          await Preferences.set({ key: 'fgs_active', value: 'false' });
          return false;
        }
      }
      return false;
    };

    const checkMonitoring = () => {
      if (!settings) return;
      
      const now = new Date();
      if (settings.active === false) {
        setMonitoring(false);
        return;
      }

      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTimeInMinutes = currentHours * 60 + currentMinutes;
      const today = now.toLocaleDateString("en-US", { weekday: "long" });
      
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

      // Midnight Reset Logic (Check if day changed)
      const todayStr = now.toDateString();
      if (lastDateRef.current !== todayStr) {
        console.log(`[RESET] New day detected: ${todayStr}. Resetting status.`);
        setDocData(`users/${profile.uid}`, { 
          blocked: false,
          screenTime: 0,
          unlockCount: 0,
          lastUpdateDate: todayStr
        }).catch(() => {});
        
        // Reset local activity
        baseActivity = { screenTime: 0, unlockCount: 0 };
        sessionActivity = { screenTime: 0, unlockCount: 0 };
        setActivity({ screenTime: 0, unlockCount: 0 });
        lastDateRef.current = todayStr;
      }

      const isNowMonitoring = !!settings.active && inClass && !profile?.blocked;
      const classChanged = isNowMonitoring && wasMonitoringRef.current && prevClassIdRef.current !== currentClassIdRef.current;
      
      if ((wasMonitoringRef.current && !isNowMonitoring) || classChanged) {
        ForegroundService.stopForegroundService().catch(() => {});
        isFGSRunningRef.current = false;
        Preferences.set({ key: 'fgs_active', value: 'false' }).catch(() => {});
        
        if (!classChanged) {
          const finalScreenTime = baseActivity.screenTime + sessionActivity.screenTime;
          const finalUnlockCount = baseActivity.unlockCount + sessionActivity.unlockCount;
          syncDataToAdmin(profile.uid, finalScreenTime, finalUnlockCount).catch(() => {});
          notifyMonitoringStatus(false);
        }
      } 
      
      if ((!wasMonitoringRef.current && isNowMonitoring) || classChanged) {
        if (!isFGSRunningRef.current || classChanged) {
          startFGS(currentClassNameRef.current).then(success => {
            if (success && !classChanged) {
              notifyMonitoringStatus(true);
              if (Date.now() - lastBatteryAlertRef.current > 86400000) {
                 toast("Battery Optimization", {
                   description: "For 100% stable monitoring, please disable 'Battery Optimization' for CampusCalm in settings."
                 });
                 lastBatteryAlertRef.current = Date.now();
              }
            }
          });
        }
        
        if (!classChanged && profile?.createdBy) {
          requestAdminNotification(profile.createdBy, 'SESSION_START', profile.name);
          // NEW: Immediate sync on start to update Admin Dashboard
          syncDataToAdmin(profile.uid).catch(() => {});
        }
      }
      
      wasMonitoringRef.current = isNowMonitoring;
      prevClassIdRef.current = currentClassIdRef.current;
      setMonitoring(isNowMonitoring);
      Preferences.set({ key: 'last_update_ts', value: Date.now().toString() }).catch(() => {});
    };

    // NEW: Enterprise Watchdog (Every 3 minutes)
    const watchdogInterval = setInterval(async () => {
      if (wasMonitoringRef.current && !isFGSRunningRef.current) {
        console.warn("[WATCHDOG] FGS was killed. Attempting self-healing...");
        logErrorToStorage("FGS_KILLED_BY_OS", "CUSTOM");
        startFGS(currentClassNameRef.current);
      }
    }, 180000); 


    const updateLocalActivity = (isUnlock = false) => {
      const now = Date.now();
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
          sessionActivity.screenTime += screenTimeIncrement;
        }
        if (isUnlock && wasMonitoringRef.current) {
          sessionActivity.unlockCount += 1;
        }
        
        // Update local UI state immediately
        setActivity({
          screenTime: baseActivity.screenTime + sessionActivity.screenTime,
          unlockCount: baseActivity.unlockCount + sessionActivity.unlockCount
        });
      }
    };

    const handleAppPause = async () => {
      try {
        const taskId = await BackgroundTask.beforeExit(async () => {
          updateLocalActivity(false);
          lastVisibleStartTimeRef.current = null;
          BackgroundTask.finish({ taskId });
        });
      } catch (e) {
        updateLocalActivity(false);
        lastVisibleStartTimeRef.current = null;
      }
    };

    const handleAppResume = () => {
      if (lastVisibleStartTimeRef.current === null) {
        lastVisibleStartTimeRef.current = Date.now();
        updateLocalActivity(true);
        if (monitoring) logScreenUnlock(currentClassNameRef.current);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") handleAppResume();
      else handleAppPause();
    };

    const appStateListener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) handleAppResume();
      else handleAppPause();
    });

    const networkListener = Network.addListener('networkStatusChange', (status) => {
      if (wasMonitoringRef.current) logNetworkEvent(status.connected, currentClassNameRef.current);
    });

    const handleUnload = () => {
      updateLocalActivity(false);
      const finalScreenTime = baseActivity.screenTime + sessionActivity.screenTime;
      const finalUnlockCount = baseActivity.unlockCount + sessionActivity.unlockCount;
      // Best effort sync on close
      syncDataToAdmin(profile.uid, finalScreenTime, finalUnlockCount).catch(() => {});
    };

    const schedulePath = (profile as any)?.createdBy ? `users/${(profile as any).createdBy}/settings/monitoring` : "settings/monitoring";
    const schedUnsub = onDocSnapshot(schedulePath, (snap) => {
      if (snap.exists()) {
        settings = snap.data() as typeof settings;
        checkMonitoring();
      }
    });

    const actUnsub = onDocSnapshot(`activity/${profile.uid}`, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as { screenTime?: number; unlockCount?: number; lastUpdateDate?: string };
        const todayStr = new Date().toDateString();
        
        // Only update base if it's from today, otherwise keep as 0 (it will be reset on sync)
        if (data.lastUpdateDate === todayStr) {
          baseActivity = {
            screenTime: data.screenTime || 0,
            unlockCount: data.unlockCount || 0
          };
        } else {
          baseActivity = { screenTime: 0, unlockCount: 0 };
        }
        
        setActivity({
          screenTime: baseActivity.screenTime + sessionActivity.screenTime,
          unlockCount: baseActivity.unlockCount + sessionActivity.unlockCount
        });
      }
    });

    if (profile?.uid && profile.role === "student") {
      initializeMonitoring(profile.uid, profile.email);
    }

    const monitoringInterval = setInterval(checkMonitoring, 1000); // Check every 1s
    const activityInterval = setInterval(() => updateLocalActivity(false), 10000); // Internal heartbeat (no network)
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handleUnload);
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      schedUnsub();
      actUnsub();
      clearInterval(monitoringInterval);
      clearInterval(activityInterval);
      clearInterval(watchdogInterval);
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
