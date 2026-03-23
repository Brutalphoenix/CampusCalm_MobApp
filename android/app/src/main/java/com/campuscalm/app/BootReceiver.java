package com.campuscalm.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
 
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "CampusCalm_Boot";
 
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) || 
            "android.intent.action.QUICKBOOT_POWERON".equals(intent.getAction())) {
            
            Log.i(TAG, "Device rebooted. Triggering delayed re-initialization...");
            
            // Phase Hardening: Use a 5-second delay to ensure system services (Package Manager, etc) are fully ready.
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try {
                    Log.d(TAG, "Launching MainActivity to restore monitoring state...");
                    Intent launchIntent = new Intent(context, MainActivity.class);
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    context.startActivity(launchIntent);
                    Log.i(TAG, "Capacitor boot bridge initialized.");
                } catch (Exception e) {
                    Log.e(TAG, "BOOT_ERROR: Critical system restriction. Please open app manually. Error: " + e.getMessage());
                }
            }, 5000); // 5s system-safe delay
        }
    }
}
