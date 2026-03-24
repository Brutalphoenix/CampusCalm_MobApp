import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

/**
 * 1. Permissions & Setup
 * Multi-version safe permission handler for Android 11 through 16+.
 */
export const initializeNotifications = async (uid?: string, role?: string): Promise<boolean> => {
  try {
    console.log('[NOTIF] Requesting system permissions...');
    
    // Request Local Notification Permissions (Standard for Android 13+)
    // On Android 11/12, this will usually resolve to 'granted' immediately.
    const localPerms = await LocalNotifications.requestPermissions();
    const isGranted = localPerms.display === 'granted';
    
    if (isGranted) {
      console.log('[NOTIF] Local Notification permission confirmed.');
    } else {
      console.warn('[NOTIF] Notification permission denied by user.');
    }

    // Role-specific setup (Admin only for FCM)
    if (role === 'admin' && uid) {
      await setupPushNotifications(uid);
    }
    
    return isGranted;
  } catch (error) {
    console.error('[NOTIF] System permission initialization failed:', error);
    // Future-Proofing: On some future OS versions, this might throw if called too early.
    // We return false to prevent downstream crashes.
    return false;
  }
};

/**
 * 2. Student: Local Notifications
 */
export const notifyMonitoringStatus = async (active: boolean) => {
  try {
    const title = active ? 'Monitoring Active 🔒' : 'Monitoring Stopped ✅';
    const body = active 
      ? 'Stay focused! Your school activity is being monitored by your administrator.' 
      : 'Class has ended. Monitoring is now disabled.';

    await LocalNotifications.schedule({
      notifications: [
        {
          id: active ? 101 : 102,
          title,
          body,
          schedule: { at: new Date(Date.now() + 1000) }, // Trigger almost immediately
          sound: 'default',
        }
      ]
    });
  } catch (error) {
    console.error('[NOTIF] Local notify failed:', error);
  }
};

/**
 * 3. Admin: Push Notifications Setup
 */
const setupPushNotifications = async (uid: string) => {
  try {
    const pushPerms = await PushNotifications.requestPermissions();
    if (pushPerms.receive === 'granted') {
      await PushNotifications.register();
    }

    // On registration success, save the FCM token to Firestore
    PushNotifications.addListener('registration', async (token) => {
      console.log('[NOTIF] Push Token registered');
      await setDoc(doc(db, `admins/${uid}/messaging`, 'fcm_token'), {
        token: token.value,
        updatedAt: new Date(),
      }, { merge: true });
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('[NOTIF] Registration error:', error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[NOTIF] Push received:', notification);
    });

  } catch (error) {
    console.error('[NOTIF] Push setup failed:', error);
  }
};

/**
 * 4. Trigger for Cloud Functions
 * Logs a request to send a notification to the admin.
 */
export const requestAdminNotification = async (adminUid: string, type: 'SESSION_START' | 'REPORT_READY' | 'ABSENT_ALERT', studentName: string) => {
  try {
    const alertId = `${type}_${Date.now()}`;
    await setDoc(doc(db, `admin_notifications_queue/${alertId}`), {
      adminUid,
      type,
      studentName,
      message: type === 'SESSION_START' 
        ? `${studentName} has started a monitoring session.` 
        : type === 'ABSENT_ALERT'
          ? `${studentName} marked themselves as Absent.`
          : `A new Batch Report from ${studentName} is ready for review.`,
      status: 'pending',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('[NOTIF] Request failed:', error);
  }
};
