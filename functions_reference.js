const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

/**
 * Triggers when a new document is added to 'admin_notifications_queue'.
 * Sends a push notification to the specified admin.
 */
exports.sendAdminPushNotification = functions.firestore
    .document('admin_notifications_queue/{alertId}')
    .onCreate(async (snapshot, context) => {
        const data = snapshot.data();
        const { adminUid, message, type } = data;

        try {
            // 1. Fetch the Admin's FCM token
            const tokenSnap = await admin.firestore()
                .doc(`admins/${adminUid}/messaging/fcm_token`)
                .get();

            if (!tokenSnap.exists) {
                console.log('No FCM token for admin:', adminUid);
                return null;
            }

            const fcmToken = tokenSnap.data().token;

            // 2. Define the payload
            const payload = {
                notification: {
                    title: type === 'SESSION_START' ? 'Student Monitoring Started' : 'New Batch Report Ready',
                    body: message,
                    sound: 'default'
                },
                data: {
                    type: type,
                    click_action: 'FLUTTER_NOTIFICATION_CLICK' // For mobile handlers
                }
            };

            // 3. Send the notification
            await admin.messaging().sendToDevice(fcmToken, payload);
            
            // 4. Mark as processed
            return snapshot.ref.update({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp() });

        } catch (error) {
            console.error('Push failed:', error);
            return snapshot.ref.update({ status: 'error', error: error.message });
        }
    });
