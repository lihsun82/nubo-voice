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

    private static final String CHANNEL_ID = "nubo_fold_glass";
    private static final int NOTIFICATION_ID = 6106;

    private SensorManager sensorManager;
    private Sensor hingeSensor;
    private GlassOverlayController overlay;
    private SharedPreferences prefs;
    private boolean manualMode = false;

    @Override
    public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        overlay = new GlassOverlayController(this);
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        hingeSensor = sensorManager.getDefaultSensor(Sensor.TYPE_HINGE_ANGLE);

        prefs.edit()
                .putBoolean(KEY_RUNNING, true)
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
            overlay.showLevel(level);
            prefs.edit().putFloat(KEY_LAST_LEVEL, level).apply();
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override
    public void onDestroy() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        if (overlay != null) overlay.hide();
        if (prefs != null) {
            prefs.edit()
                    .putBoolean(KEY_RUNNING, false)
                    .putBoolean(KEY_MANUAL, false)
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
        channel.setDescription("維持鉸鏈角度偵測與半折霧化效果");
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
                .setContentTitle("NUBO Fold Glass 運作中")
                .setContentText("半折時自動霧化；完全展開或闔上恢復清晰")
                .setContentIntent(openPi)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_menu_close_clear_cancel, "停止", stopPi).build())
                .build();
    }
}
