package com.ainubo.foldglass;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.IBinder;
import android.os.PowerManager;

public class FoldGlassService extends Service implements SensorEventListener {
    public static final String ACTION_START_AUTO = "com.ainubo.foldglass.START_AUTO";
    public static final String ACTION_PREVIEW = "com.ainubo.foldglass.PREVIEW";
    public static final String ACTION_STOP = "com.ainubo.foldglass.STOP";
    public static final String EXTRA_LEVEL = "level";

    static final String PREFS = "nubo_fold_glass_state";
    static final String KEY_RUNNING = "running";
    static final String KEY_LAST_ANGLE = "last_angle";
    static final String KEY_LAST_LEVEL = "last_level";
    static final String KEY_MANUAL = "manual";
    static final String KEY_SENSOR = "sensor";
    static final String KEY_BLUR_AVAILABLE = "blur_available";
    static final String KEY_KEEP_SCREEN_ON = "keep_screen_on";

    private static final String CHANNEL_ID = "nubo_fold_glass";
    private static final int NOTIFICATION_ID = 6106;
    private static final float AWAKE_LEVEL_THRESHOLD = 0.015f;

    private SensorManager sensorManager;
    private Sensor hingeSensor;
    private GlassOverlayController overlay;
    private SharedPreferences prefs;
    private PowerManager.WakeLock screenWakeLock;
    private boolean manualMode = false;
    private boolean keepingScreenOn = false;

    @Override
    public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        overlay = new GlassOverlayController(this);
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        hingeSensor = sensorManager.getDefaultSensor(Sensor.TYPE_HINGE_ANGLE);
        createScreenWakeLock();

        prefs.edit()
                .putBoolean(KEY_RUNNING, true)
                .putBoolean(KEY_KEEP_SCREEN_ON, false)
                .putBoolean(KEY_BLUR_AVAILABLE, overlay.isBlurAvailable())
                .putString(KEY_SENSOR, hingeSensor == null
                        ? "未偵測到標準 TYPE_HINGE_ANGLE"
                        : hingeSensor.getName() + " / " + hingeSensor.getVendor())
                .apply();

        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
        registerHingeSensor();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START_AUTO : intent.getAction();

        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_PREVIEW.equals(action)) {
            manualMode = true;
            float level = Math.max(0f, Math.min(1f, intent.getFloatExtra(EXTRA_LEVEL, 0f)));
            updateScreenAwakeState(level);
            overlay.showLevel(level);
            prefs.edit()
                    .putBoolean(KEY_MANUAL, true)
                    .putFloat(KEY_LAST_LEVEL, level)
                    .apply();
            return START_STICKY;
        }

        manualMode = false;
        prefs.edit().putBoolean(KEY_MANUAL, false).apply();
        if (hingeSensor == null) {
            updateScreenAwakeState(0f);
            overlay.hide();
            prefs.edit().putFloat(KEY_LAST_LEVEL, 0f).apply();
        }
        return START_STICKY;
    }

    private void registerHingeSensor() {
        if (hingeSensor != null) {
            sensorManager.registerListener(this, hingeSensor, SensorManager.SENSOR_DELAY_GAME);
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_HINGE_ANGLE || event.values.length == 0) return;
        float angle = event.values[0];
        float level = AngleMapper.toGlassLevel(angle);
        prefs.edit().putFloat(KEY_LAST_ANGLE, angle).apply();
        if (!manualMode) {
            updateScreenAwakeState(level);
            overlay.showLevel(level);
            prefs.edit().putFloat(KEY_LAST_LEVEL, level).apply();
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @SuppressWarnings("deprecation")
    private void createScreenWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        int flags = PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP;
        screenWakeLock = pm.newWakeLock(flags, getPackageName() + ":HalfFoldCoverScreen");
        screenWakeLock.setReferenceCounted(false);
    }

    private void updateScreenAwakeState(float level) {
        boolean shouldKeepAwake = level >= AWAKE_LEVEL_THRESHOLD;
        overlay.setKeepScreenOn(shouldKeepAwake);

        if (shouldKeepAwake == keepingScreenOn) return;
        keepingScreenOn = shouldKeepAwake;

        if (screenWakeLock != null) {
            if (shouldKeepAwake) {
                if (!screenWakeLock.isHeld()) {
                    try {
                        screenWakeLock.acquire();
                    } catch (Exception ignored) {}
                }
            } else if (screenWakeLock.isHeld()) {
                try {
                    screenWakeLock.release();
                } catch (Exception ignored) {}
            }
        }

        prefs.edit().putBoolean(KEY_KEEP_SCREEN_ON, shouldKeepAwake).apply();
    }

    private void releaseScreenWakeLock() {
        keepingScreenOn = false;
        if (overlay != null) overlay.setKeepScreenOn(false);
        if (screenWakeLock != null && screenWakeLock.isHeld()) {
            try {
                screenWakeLock.release();
            } catch (Exception ignored) {}
        }
        if (prefs != null) prefs.edit().putBoolean(KEY_KEEP_SCREEN_ON, false).apply();
    }

    @Override
    public void onDestroy() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        releaseScreenWakeLock();
        if (overlay != null) overlay.hide();
        if (prefs != null) {
            prefs.edit()
                    .putBoolean(KEY_RUNNING, false)
                    .putBoolean(KEY_MANUAL, false)
                    .putBoolean(KEY_KEEP_SCREEN_ON, false)
                    .putFloat(KEY_LAST_LEVEL, 0f)
                    .apply();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "NUBO Fold Glass",
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("維持鉸鏈角度偵測、半折霧化與半折亮屏效果");
        nm.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent openPi = PendingIntent.getActivity(
                this, 1, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent stopIntent = new Intent(this, FoldGlassService.class).setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(
                this, 2, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_view)
                .setContentTitle("NUBO Fold Glass v0.2 運作中")
                .setContentText("半折自動霧化並保持螢幕亮起；展開或闔上後釋放")
                .setContentIntent(openPi)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_menu_close_clear_cancel, "停止", stopPi).build())
                .build();
    }
}
