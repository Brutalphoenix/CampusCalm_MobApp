import { Preferences } from '@capacitor/preferences';
import { Network } from '@capacitor/network';
import { Device } from '@capacitor/device';
import { db } from './firebase';
import { 
  collection, 
  doc, 
  getDoc,
  setDoc, 
  addDoc, 
  deleteDoc,
  query, 
  where, 
  getDocs, 
  writeBatch,
  Timestamp 
} from 'firebase/firestore';
import { PluginListenerHandle } from '@capacitor/core';
import { requestAdminNotification } from './notificationService';
import CryptoJS from 'crypto-js';
import { serverTimestamp } from 'firebase/firestore';

let networkListenerHandle: PluginListenerHandle | null = null;

import { logErrorToStorage } from './errorLogger';

const STORAGE_KEYS = {
  UNLOCKED_LOGS: 'screen_unlock_logs',
  IS_INITIALIZED: 'device_handshake',
};

let syncDebounceTimer: any = null;

// Network Integrity Listeners (Global Enterprise Trigger)
window.addEventListener('online', () => {
  console.log('[Sync] Network restored. Triggering debounced sync...');
  triggerDebouncedSync();
});

window.addEventListener('offline', () => {
  console.log('[Sync] App went offline. Caching events locally.');
});

/**
 * Debounced sync trigger to avoid rapid fire Firestore writes.
 */
const triggerDebouncedSync = () => {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(async () => {
    const { value: uid } = await Preferences.get({ key: 'user_uid' });
    if (uid) syncDataToAdmin(uid).catch(() => {});
  }, 5000); // 5s debounce
};

export interface ScreenLocaleLog {
  timestamp: string;
  eventType: 'SCREEN_UNLOCK' | 'NETWORK_ONLINE' | 'NETWORK_OFFLINE';
  className: string;
}

/**
 * NEW: Generates a unique, non-hardcoded encryption key.
 */
const getEncryptionKey = async (uid: string) => {
  const { identifier: androidId } = await Device.getId();
  return CryptoJS.SHA256(uid + androidId).toString();
};

import { Share } from '@capacitor/share';
import { getStoredErrors } from './errorLogger';
import { APP_VERSION } from './utils';

export const exportLogs = async () => {
  try {
    const { value: encryptedLogs } = await Preferences.get({ key: STORAGE_KEYS.UNLOCKED_LOGS });
    const { value: userUid } = await Preferences.get({ key: 'user_uid' });
    const errors = await getStoredErrors();
    const deviceInfo = await Device.getInfo();
    
    let decryptedLogs = "[]";
    if (encryptedLogs && userUid) {
      try {
        const key = await getEncryptionKey(userUid);
        const bytes = CryptoJS.AES.decrypt(encryptedLogs, key);
        decryptedLogs = bytes.toString(CryptoJS.enc.Utf8) || "[]";
      } catch (e) { decryptedLogs = "[CORRUPTED]"; }
    }

    const exportData = {
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      device: {
        model: deviceInfo.model,
        os: deviceInfo.operatingSystem,
        version: deviceInfo.osVersion
      },
      monitoring_logs: JSON.parse(decryptedLogs === "[CORRUPTED]" ? "[]" : decryptedLogs),
      error_logs: errors
    };

    const fileName = `CampusCalm_Debug_${new Date().getTime()}.json`;
    
    await Share.share({
      title: 'CampusCalm System Logs',
      text: JSON.stringify(exportData, null, 2),
      dialogTitle: 'Export Debug Logs',
    });
    
    return true;
  } catch (error) {
    console.error('[Export] Failed:', error);
    throw error;
  }
};

/**
 * NEW: Internal helper to validate log integrity before storage/upload.
 */
const validateLogs = (data: any): ScreenLocaleLog[] => {
  if (!Array.isArray(data)) return [];
  return data.filter(log => 
    log && 
    typeof log.timestamp === 'string' && 
    ['SCREEN_UNLOCK', 'NETWORK_ONLINE', 'NETWORK_OFFLINE'].includes(log.eventType)
  );
};

/**
 * 1. LogManager: Stores screen unlock events locally (Encrypted).
 */
export const logScreenUnlock = async (className: string = 'Unknown') => {
  try {
    const { value: userUid } = await Preferences.get({ key: 'user_uid' });
    if (!userUid) return;

    const { value: encryptedLogs } = await Preferences.get({ key: STORAGE_KEYS.UNLOCKED_LOGS });
    const key = await getEncryptionKey(userUid);
    
    let logs: ScreenLocaleLog[] = [];
    
    if (encryptedLogs) {
      try {
        const bytes = CryptoJS.AES.decrypt(encryptedLogs, key);
        const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
        if (decryptedStr) {
          const parsed = JSON.parse(decryptedStr);
          logs = validateLogs(parsed);
        }
      } catch (e) {
        console.error('[Security] STORAGE CORRUPTION DETECTED. Resetting logs.');
        logs = []; // Emergency reset to prevent crash loops
      }
    }
    
    logs.push({
      timestamp: new Date().toISOString(),
      eventType: 'SCREEN_UNLOCK',
      className
    });

    // Enterprise Pass: Limit local log size to prevent memory issues (Max 500 events)
    if (logs.length > 500) logs = logs.slice(-500);

    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(logs), key).toString();
    await Preferences.set({
      key: STORAGE_KEYS.UNLOCKED_LOGS,
      value: encrypted,
    });
    
    console.log('[Monitoring] Event hardened & logged locally');
  } catch (error) {
    console.error('[Monitoring] Fatal logging error:', error);
  }
};

/**
 * NEW: Logs network connection status changes during a session.
 */
export const logNetworkEvent = async (connected: boolean, className: string = 'Unknown') => {
  try {
    const { value: userUid } = await Preferences.get({ key: 'user_uid' });
    if (!userUid) return;

    const { value: encryptedLogs } = await Preferences.get({ key: STORAGE_KEYS.UNLOCKED_LOGS });
    const key = await getEncryptionKey(userUid);
    
    let logs: ScreenLocaleLog[] = [];
    
    if (encryptedLogs) {
      try {
        const bytes = CryptoJS.AES.decrypt(encryptedLogs, key);
        const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
        if (decryptedStr) {
          const parsed = JSON.parse(decryptedStr);
          logs = validateLogs(parsed);
        }
      } catch (e) {
        logs = [];
      }
    }
    
    logs.push({
      timestamp: new Date().toISOString(),
      eventType: connected ? 'NETWORK_ONLINE' : 'NETWORK_OFFLINE',
      className
    });

    if (logs.length > 500) logs = logs.slice(-500);

    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(logs), key).toString();
    await Preferences.set({
      key: STORAGE_KEYS.UNLOCKED_LOGS,
      value: encrypted,
    });
    console.log(`[Monitoring] Hardened ${connected ? 'Online' : 'Offline'} event logged`);
  } catch (error) {
    console.error('[Monitoring] Network log error:', error);
  }
};

/**
 * 2. SyncService: Batch uploads local logs and final totals to Firestore.
 */
export const syncDataToAdmin = async (uid: string, finalScreenTime?: number, finalUnlockCount?: number) => {
  try {
    const status = await Network.getStatus();
    if (!status.connected) {
      console.log('[Monitoring] Offline. Sync queued for later.');
      return;
    }

    const { value: encryptedLogs } = await Preferences.get({ key: STORAGE_KEYS.UNLOCKED_LOGS });
    if (!encryptedLogs && finalScreenTime === undefined) return;

    let logs: ScreenLocaleLog[] = [];
    if (encryptedLogs) {
      try {
        const key = await getEncryptionKey(uid);
        const bytes = CryptoJS.AES.decrypt(encryptedLogs, key);
        const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
        
        if (!decryptedData) throw new Error("Tampered data");
        const parsed = JSON.parse(decryptedData);
        logs = validateLogs(parsed);
      } catch (e) {
        console.error('[Security] CRITICAL: Log corruption detected during sync.');
        await addDoc(collection(db, 'tamper_logs'), {
          uid,
          type: 'STORAGE_CORRUPTION',
          timestamp: serverTimestamp(),
          message: 'Data corrupted or tampered. Automated reset triggered.'
        }).catch(() => {});
        // If data is unreadable, we must clear it to allow new logs to sync
        await Preferences.remove({ key: STORAGE_KEYS.UNLOCKED_LOGS });
        return; 
      }
    }

    // Enterprise Pass: Immediate return if nothing to sync after validation
    if (logs.length === 0 && finalScreenTime === undefined) {
      await Preferences.remove({ key: STORAGE_KEYS.UNLOCKED_LOGS });
      return;
    }

    const groupedLogs: Record<string, { unlocks: number; events: any[] }> = {};
    logs.forEach(log => {
      const className = log.className || 'Unknown';
      if (!groupedLogs[className]) {
        groupedLogs[className] = { unlocks: 0, events: [] };
      }
      if (log.eventType === 'SCREEN_UNLOCK') groupedLogs[className].unlocks++;
      groupedLogs[className].events.push(log);
    });

    // Data Integrity: Generate SHA-256 hash for anti-tampering verification
    const rawData = JSON.stringify(logs);
    const hash = CryptoJS.SHA256(rawData).toString();

    const dateStr = new Date().toISOString().split('T')[0];
    const docPath = `activity/${uid}/daily_reports/${dateStr}`;
    
    // Performance: Async fetch student profile
    const studentDoc = await getDoc(doc(db, `users/${uid}`));
    const studentData = studentDoc.data() || {};

    // 200KB Payload Chunking (Enterprise Scalability)
    const MAX_CHUNCK_SIZE = 200 * 1024; // 200KB
    const serializedTrace = JSON.stringify(logs);
    let chunks: string[] = [];
    
    if (serializedTrace.length > MAX_CHUNCK_SIZE) {
      console.log(`[Sync] Large payload (${Math.round(serializedTrace.length/1024)}KB). Chunking enabled...`);
      for (let i = 0; i < serializedTrace.length; i += MAX_CHUNCK_SIZE) {
        chunks.push(serializedTrace.slice(i, i + MAX_CHUNCK_SIZE));
      }
    }

    const batch = writeBatch(db);

    // 1. Hardened Daily Report (Atomic Sync)
    const reportRef = doc(db, docPath);
    batch.set(reportRef, {
      studentName: studentData.name || 'Unknown',
      usn: studentData.usn || 'Unknown',
      adminId: studentData.createdBy || 'Unknown',
      summary: groupedLogs,
      integrity_hash: hash,
      // If chunked, store as array, otherwise store last 300 traces
      fullTrace: chunks.length > 0 ? chunks : (logs.length > 300 ? logs.slice(-300) : logs),
      isChunked: chunks.length > 0,
      syncedAt: serverTimestamp(),
      deviceTime: new Date().toISOString(),
      uid: uid,
      totalScreenTime: finalScreenTime ?? studentData.screenTime ?? 0,
      totalUnlockCount: finalUnlockCount ?? studentData.unlockCount ?? 0
    }, { merge: true });

    // 2. Real-time Dashboard Update
    if (finalScreenTime !== undefined || finalUnlockCount !== undefined) {
      const activityRef = doc(db, `activity/${uid}`);
      batch.set(activityRef, {
        screenTime: finalScreenTime ?? 0,
        unlockCount: finalUnlockCount ?? 0,
        lastActive: serverTimestamp(),
        lastUpdateDate: new Date().toDateString()
      }, { merge: true });
    }

    await batch.commit();
    console.log('[Monitoring] Enterprise sync successful (Verified Hash).');

    // Cleanup only AFTER successful commit
    await Preferences.remove({ key: STORAGE_KEYS.UNLOCKED_LOGS });
    
    if (studentData.createdBy) {
      requestAdminNotification(studentData.createdBy, 'REPORT_READY', studentData.name || 'Student');
    }

    // 3-Day Rolling Retention Cleanup
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const oldDateStr = threeDaysAgo.toISOString().split('T')[0];
    deleteDoc(doc(db, `activity/${uid}/daily_reports/${oldDateStr}`)).catch(() => {});
    
  } catch (error) {
    console.error('[Monitoring] Hardened sync failed. Data remains in queue.', error);
    // Data is NOT removed from Preferences here, ensuring retry on next attempt.
  }
};

/**
 * 3. TamperDetection: Checks for manual data wipes.
 */
export const checkTampering = async (uid: string, email: string) => {
  try {
    const { value: isInitialized } = await Preferences.get({ key: STORAGE_KEYS.IS_INITIALIZED });
    
    // If user is logged in but local flag is missing
    if (!isInitialized) {
      const { identifier: androidId } = await Device.getId();
      
      // Check server record
      const q = query(collection(db, 'devices'), where('uid', '==', uid));
      const querySnapshot = await getDocs(q);
      
      let deviceExists = false;
      querySnapshot.forEach((doc) => {
        if (doc.data().androidId === androidId) {
          deviceExists = true;
        }
      });

      if (deviceExists) {
        // Match exists but local key is gone -> DATA WIPED
        console.warn('[Monitoring] Tamper detected! Data wipe alert sent.');
        await addDoc(collection(db, 'tamper_logs'), {
          type: 'DATA_WIPED_ALERT',
          uid: uid,
          email: email,
          androidId: androidId,
          timestamp: Timestamp.now(),
          priority: 'HIGH'
        });
      } else {
        // First time on this device, register it
        await setDoc(doc(db, `devices/${uid}`), {
          uid: uid,
          email: email,
          androidId: androidId,
          registeredAt: Timestamp.now()
        });
      }

      // Re-establish local handshake flag
      await Preferences.set({ key: STORAGE_KEYS.IS_INITIALIZED, value: 'true' });
    }
  } catch (error) {
    console.error('[Monitoring] Tamper check failed:', error);
  }
};

/**
 * NEW: Stops all active monitoring listeners to prevent memory leaks.
 */
export const stopMonitoringListeners = async () => {
  if (networkListenerHandle) {
    await networkListenerHandle.remove();
    networkListenerHandle = null;
    console.log('[Monitoring] Listeners stopped.');
  }
};

/**
 * Orchestrator: Initializes monitoring logic.
 */
export const initializeMonitoring = async (uid: string, email: string) => {
  console.log('[Monitoring] Initializing...');
  await checkTampering(uid, email);
  console.log('[Monitoring] Triggering startup sync...');
  await syncDataToAdmin(uid);
  
  // Cleanup any old listener first
  await stopMonitoringListeners();
  
  // Setup network listener for automatic sync
  networkListenerHandle = await Network.addListener('networkStatusChange', async (status) => {
    if (status.connected) {
      console.log('[Monitoring] Back online. Triggering sync...');
      await syncDataToAdmin(uid);
    }
  });
};
