import { Preferences } from '@capacitor/preferences';
import { Network } from '@capacitor/network';
import { Device } from '@capacitor/device';
import { db } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  Timestamp 
} from 'firebase/firestore';

const STORAGE_KEYS = {
  UNLOCKED_LOGS: 'screen_unlock_logs',
  IS_INITIALIZED: 'device_handshake',
};

export interface ScreenLocaleLog {
  timestamp: string;
  eventType: 'SCREEN_UNLOCK';
}

/**
 * 1. LogManager: Stores screen unlock events locally.
 */
export const logScreenUnlock = async () => {
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEYS.UNLOCKED_LOGS });
    const logs: ScreenLocaleLog[] = value ? JSON.parse(value) : [];
    
    logs.push({
      timestamp: new Date().toISOString(),
      eventType: 'SCREEN_UNLOCK',
    });

    await Preferences.set({
      key: STORAGE_KEYS.UNLOCKED_LOGS,
      value: JSON.stringify(logs),
    });
    console.log('[Monitoring] Event logged locally');
  } catch (error) {
    console.error('[Monitoring] Failed to log event locally:', error);
  }
};

/**
 * 2. SyncService: Batch uploads local logs to Firestore.
 */
export const syncDataToAdmin = async (uid: string) => {
  try {
    const status = await Network.getStatus();
    if (!status.connected) {
      console.log('[Monitoring] Offline. Skipping sync.');
      return;
    }

    const { value } = await Preferences.get({ key: STORAGE_KEYS.UNLOCKED_LOGS });
    const logs: ScreenLocaleLog[] = value ? JSON.parse(value) : [];

    if (logs.length === 0) return;

    // Batching: Bundle all logs into a single document write to save costs.
    const dateStr = new Date().toISOString().split('T')[0];
    const docPath = `activity/${uid}/daily_logs/${dateStr}`;
    
    await setDoc(doc(db, docPath), {
      logs: logs,
      lastSync: Timestamp.now(),
      uid: uid
    }, { merge: true });

    // Safety: Clear local logs only after confirmed success.
    await Preferences.remove({ key: STORAGE_KEYS.UNLOCKED_LOGS });
    console.log('[Monitoring] Batch sync successful. Local storage cleared.');
  } catch (error) {
    console.error('[Monitoring] Sync failed:', error);
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
 * Orchestrator: Initializes monitoring logic.
 */
export const initializeMonitoring = async (uid: string, email: string) => {
  console.log('[Monitoring] Initializing...');
  await checkTampering(uid, email);
  await syncDataToAdmin(uid);
  
  // Setup network listener for automatic sync
  Network.addListener('networkStatusChange', async (status) => {
    if (status.connected) {
      console.log('[Monitoring] Back online. Triggering sync...');
      await syncDataToAdmin(uid);
    }
  });
};
