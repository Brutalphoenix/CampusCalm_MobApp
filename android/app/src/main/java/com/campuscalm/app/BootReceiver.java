package com.campuscalm.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "CampusCalm_Boot";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.d(TAG, "Device rebooted. Relaunching monitoring engine...");
            
            // Start the main activity to re-initialize the Capacitor JS environment
            // We use FLAG_ACTIVITY_NEW_TASK because we are calling from outside an Activity
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            
            // On modern Android, starting an activity from background can be restricted.
            // However, since we have the BOOT_COMPLETED permission, it often works.
            try {
                context.startActivity(launchIntent);
                Log.d(TAG, "MainActivity launched successfully from boot.");
            } catch (Exception e) {
                Log.e(TAG, "Failed to launch app on boot: " + e.getMessage());
            }
        }
    }
}
