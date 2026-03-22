import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

/**
 * 1. Permissions & Setup
 */
export const initializeNotifications = async (uid: string, role: string) => {
  try {
    // Request Local Notification Permissions
    const localPerms = await LocalNotifications.requestPermissions();
    if (localPerms.display === 'granted') {
      console.log('[NOTIF] Local Notification permission granted');
    }

    // Role-specific setup
    if (role === 'admin') {
      await setupPushNotifications(uid);
    }
  } catch (error) {
    console.error('[NOTIF] Initialization failed:', error);
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
export const requestAdminNotification = async (adminUid: string, type: 'SESSION_START' | 'REPORT_READY', studentName: string) => {
  try {
    const alertId = `${type}_${Date.now()}`;
    await setDoc(doc(db, `admin_notifications_queue/${alertId}`), {
      adminUid,
      type,
      studentName,
      message: type === 'SESSION_START' 
        ? `${studentName} has started a monitoring session.` 
        : `A new Batch Report from ${studentName} is ready for review.`,
      status: 'pending',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('[NOTIF] Request failed:', error);
  }
};
