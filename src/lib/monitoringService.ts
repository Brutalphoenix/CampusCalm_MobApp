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
  Timestamp 
} from 'firebase/firestore';
import { PluginListenerHandle } from '@capacitor/core';
import { requestAdminNotification } from './notificationService';
import CryptoJS from 'crypto-js';
import { serverTimestamp } from 'firebase/firestore';

let networkListenerHandle: PluginListenerHandle | null = null;

const STORAGE_KEYS = {
  UNLOCKED_LOGS: 'screen_unlock_logs',
  IS_INITIALIZED: 'device_handshake',
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

/**
 * 1. LogManager: Stores screen unlock events locally (Encrypted).
 */
export const logScreenUnlock = async (className: string = 'Unknown') => {
  try {
    const { value: encryptedLogs } = await Preferences.get({ key: STORAGE_KEYS.UNLOCKED_LOGS });
    const { value: userUid } = await Preferences.get({ key: 'user_uid' }); // Assume saved on login
    
    let logs: ScreenLocaleLog[] = [];
    if (encryptedLogs && userUid) {
      const key = await getEncryptionKey(userUid);
      try {
        const bytes = CryptoJS.AES.decrypt(encryptedLogs, key);
        logs = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
      } catch (e) {
        console.error('[Security] Decryption failed during log append.');
        // If append fails due to corruption, we start a new array to preserve future logs
        logs = []; 
      }
    }
    
    logs.push({
      timestamp: new Date().toISOString(),
      eventType: 'SCREEN_UNLOCK',
      className
    });

    if (userUid) {
      const key = await getEncryptionKey(userUid);
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(logs), key).toString();
      await Preferences.set({
        key: STORAGE_KEYS.UNLOCKED_LOGS,
        value: encrypted,
      });
    }
    console.log('[Monitoring] Encrypted event logged locally');
  } catch (error) {
    console.error('[Monitoring] Failed to log event locally:', error);
  }
};

/**
 * NEW: Logs network connection status changes during a session.
 */
export const logNetworkEvent = async (connected: boolean, className: string = 'Unknown') => {
  try {
    const { value: encryptedLogs } = await Preferences.get({ key: STORAGE_KEYS.UNLOCKED_LOGS });
    const { value: userUid } = await Preferences.get({ key: 'user_uid' });
    
    let logs: ScreenLocaleLog[] = [];
    if (encryptedLogs && userUid) {
      const key = await getEncryptionKey(userUid);
      try {
        const bytes = CryptoJS.AES.decrypt(encryptedLogs, key);
        logs = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
      } catch (e) {
        logs = [];
      }
    }
    
    logs.push({
      timestamp: new Date().toISOString(),
      eventType: connected ? 'NETWORK_ONLINE' : 'NETWORK_OFFLINE',
      className
    });

    if (userUid) {
      const key = await getEncryptionKey(userUid);
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(logs), key).toString();
      await Preferences.set({
        key: STORAGE_KEYS.UNLOCKED_LOGS,
        value: encrypted,
      });
    }
    console.log(`[Monitoring] Encrypted ${connected ? 'Online' : 'Offline'} event logged`);
  } catch (error) {
    console.error('[Monitoring] Failed to log network event:', error);
  }
};

/**
 * 2. SyncService: Batch uploads local logs to Firestore.
 */
export const syncDataToAdmin = async (uid: string) => {
  try {
    const status = await Network.getStatus();
    if (!status.connected) return;

    const { value: encryptedLogs } = await Preferences.get({ key: STORAGE_KEYS.UNLOCKED_LOGS });
    if (!encryptedLogs) return;

    let logs: ScreenLocaleLog[] = [];
    try {
      const key = await getEncryptionKey(uid);
      const bytes = CryptoJS.AES.decrypt(encryptedLogs, key);
      const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
      
      if (encryptedLogs && !decryptedData) throw new Error("Tampered data");
      logs = JSON.parse(decryptedData);
    } catch (e) {
      console.error('[Security] SECURITY VIOLATION: LOCAL TAMPER DETECTED.');
      await addDoc(collection(db, 'tamper_logs'), {
        uid,
        type: 'SECURITY_VIOLATION',
        alertLevel: 'CRITICAL',
        timestamp: serverTimestamp(),
        message: 'Local encrypted log was manually modified or corrupted. Potential bypass attempt.'
      });
      return; 
    }

    if (logs.length === 0) return;

    // Grouping by className for detailed reporting
    const groupedLogs: Record<string, { unlocks: number; onlineSeconds: number; events: any[] }> = {};
    logs.forEach(log => {
      if (!groupedLogs[log.className]) {
        groupedLogs[log.className] = { unlocks: 0, onlineSeconds: 0, events: [] };
      }
      if (log.eventType === 'SCREEN_UNLOCK') groupedLogs[log.className].unlocks++;
      groupedLogs[log.className].events.push(log);
    });

    // Path: activity/{uid}/daily_reports/{date}
    const dateStr = new Date().toISOString().split('T')[0];
    const docPath = `activity/${uid}/daily_reports/${dateStr}`;
    
    const studentDoc = await getDoc(doc(db, `users/${uid}`));
    const studentData = studentDoc.data() || {};

    await setDoc(doc(db, docPath), {
      studentName: studentData.name || 'Unknown',
      adminId: studentData.createdBy || 'Unknown',
      summary: groupedLogs,
      fullTrace: logs,
      syncedAt: serverTimestamp(), // Authoritative Server Time
      deviceTime: new Date().toISOString(), // For reference only
      uid: uid
    });

    // 3-Day Rolling Retention
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const oldDateStr = threeDaysAgo.toISOString().split('T')[0];
    await deleteDoc(doc(db, `activity/${uid}/daily_reports/${oldDateStr}`)).catch(() => {});

    if (studentData.createdBy) {
      await requestAdminNotification(studentData.createdBy, 'REPORT_READY', studentData.name || 'Student');
    }

    await Preferences.remove({ key: STORAGE_KEYS.UNLOCKED_LOGS });
    console.log('[Monitoring] Secure report sync successful.');
  } catch (error) {
    console.error('[Monitoring] Sync aborted:', error);
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
