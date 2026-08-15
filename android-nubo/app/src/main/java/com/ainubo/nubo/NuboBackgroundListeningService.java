package com.ainubo.nubo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

public final class NuboBackgroundListeningService extends Service {
    public static final String ACTION_START = "com.ainubo.nubo.action.COMPANION_START";
    public static final String ACTION_TOUCH = "com.ainubo.nubo.action.COMPANION_TOUCH";
    public static final String ACTION_STOP = "com.ainubo.nubo.action.COMPANION_STOP";
    public static final String ACTION_TIMEOUT = "com.ainubo.nubo.action.COMPANION_TIMEOUT";

    private static final String CHANNEL_ID = "nubo_background_listening_v52";
    private static final int NOTIFICATION_ID = 5201;
    private static final long ACTIVE_WINDOW_MS = 30_000L;

    private static volatile boolean running = false;
    private static volatile boolean cloudWindowActive = false;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeoutRunnable = this::enterWakeMode;

    public static boolean isRunning() {
        return running;
    }

    public static boolean isCloudWindowActive() {
        return running && cloudWindowActive;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopCompanion();
            return START_NOT_STICKY;
        }

        if (ACTION_START.equals(action)) {
            cloudWindowActive = true;
            startForegroundCompat(buildNotification("NUBO 背景聆聽中 · 30 秒"));
            resetTimeout();
            return START_NOT_STICKY;
        }

        if (ACTION_TOUCH.equals(action)) {
            if (!running) return START_NOT_STICKY;
            cloudWindowActive = true;
            startForegroundCompat(buildNotification("NUBO 背景聆聽中 · 已延長 30 秒"));
            resetTimeout();
            return START_NOT_STICKY;
        }

        return START_NOT_STICKY;
    }

    private void startForegroundCompat(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void resetTimeout() {
        handler.removeCallbacks(timeoutRunnable);
        handler.postDelayed(timeoutRunnable, ACTIVE_WINDOW_MS);
    }

    private void enterWakeMode() {
        if (!running || !cloudWindowActive) return;
        cloudWindowActive = false;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification("NUBO 待命喚醒中"));
        }
        Intent timeout = new Intent(ACTION_TIMEOUT);
        timeout.setPackage(getPackageName());
        sendBroadcast(timeout);
    }

    private void stopCompanion() {
        cloudWindowActive = false;
        handler.removeCallbacksAndMessages(null);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "NUBO 背景聆聽",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("播放 YouTube 時維持 NUBO 語音 30 秒，之後轉待命喚醒。");
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String text) {
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        return builder
            .setSmallIcon(R.drawable.ainubox1_launcher_uploaded)
            .setContentTitle("AINUBO X1")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build();
    }

    @Override
    public void onDestroy() {
        running = false;
        cloudWindowActive = false;
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
