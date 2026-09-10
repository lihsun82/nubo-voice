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
import android.hardware.display.DisplayManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class FoldGlassService extends Service implements SensorEventListener, DisplayManager.DisplayListener {
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
    static final String KEY_DEVICE_STATE_AVAILABLE = "device_state_available";
    static final String KEY_DEVICE_STATE_STATUS = "device_state_status";
    static final String KEY_CLOSED_STATE_ID = "closed_state_id";
    static final String KEY_CURRENT_DEVICE_STATE = "current_device_state";
    static final String KEY_FORCED_COVER = "forced_cover";

    private static final String CHANNEL_ID = "nubo_fold_glass";
    private static final int NOTIFICATION_ID = 6106;

    // User-requested state machine:
    // closed = stock cover display, transition = cover display forced + frosted glass,
    // open = stock inner display.
    private static final float CLOSED_NORMAL_MAX = 12f;
    private static final float OPEN_NORMAL_MIN = 168f;
    private static final float MIN_TRANSITION_GLASS = 0.10f;

    private SensorManager sensorManager;
    private Sensor hingeSensor;
    private DisplayManager displayManager;
    private GlassOverlayController overlay;
    private SharedPreferences prefs;
    private PowerManager.WakeLock screenWakeLock;
    private DeviceStateController deviceState;
    private ExecutorService deviceStateExecutor;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private boolean manualMode = false;
    private boolean keepingScreenOn = false;
    private boolean transitionActive = false;
    private boolean coverStateForced = false;
    private boolean stateCommandInFlight = false;
    private int closedStateId = -1;

    @Override
    public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        closedStateId = prefs.getInt(KEY_CLOSED_STATE_ID, -1);

        overlay = new GlassOverlayController(this);
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        hingeSensor = sensorManager.getDefaultSensor(Sensor.TYPE_HINGE_ANGLE);
        displayManager = getSystemService(DisplayManager.class);
        deviceState = new DeviceStateController();
        deviceStateExecutor = Executors.newSingleThreadExecutor();
        createScreenWakeLock();

        prefs.edit()
                .putBoolean(KEY_RUNNING, true)
                .putBoolean(KEY_KEEP_SCREEN_ON, false)
                .putBoolean(KEY_FORCED_COVER, false)
                .putBoolean(KEY_BLUR_AVAILABLE, overlay.isBlurAvailable())
                .putString(KEY_SENSOR, hingeSensor == null
                        ? "未偵測到標準 TYPE_HINGE_ANGLE"
                        : hingeSensor.getName() + " / " + hingeSensor.getVendor())
                .apply();

        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
        registerHingeSensor();
        if (displayManager != null) displayManager.registerDisplayListener(this, mainHandler);
        probeDeviceStateAsync();
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
            updateScreenAwakeState(level >= 0.015f);
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
            transitionActive = false;
            updateScreenAwakeState(false);
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
        float angle = normalizeAngle(event.values[0]);
        prefs.edit().putFloat(KEY_LAST_ANGLE, angle).apply();
        if (manualMode) return;

        if (angle <= CLOSED_NORMAL_MAX) {
            // Fully closed: ColorOS owns the normal cover-screen state.
            transitionActive = false;
            updateScreenAwakeState(false);
            overlay.showLevel(0f);
            prefs.edit().putFloat(KEY_LAST_LEVEL, 0f).apply();
            leaveForcedStateAsync(true);
            captureClosedStateIfNeededAsync();
            return;
        }

        if (angle >= OPEN_NORMAL_MIN) {
            // Fully open: restore stock inner-display behavior.
            transitionActive = false;
            updateScreenAwakeState(false);
            overlay.showLevel(0f);
            prefs.edit().putFloat(KEY_LAST_LEVEL, 0f).apply();
            leaveForcedStateAsync(false);
            return;
        }

        // Intermediate folding motion in either direction.
        // Keep the cover/front display alive, then paint the frost on that display.
        transitionActive = true;
        updateScreenAwakeState(true);
        ensureCoverStateForcedAsync();

        float level = Math.max(MIN_TRANSITION_GLASS, AngleMapper.toGlassLevel(angle));
        prefs.edit().putFloat(KEY_LAST_LEVEL, level).apply();
        overlay.refreshDisplayBinding();
        overlay.showLevel(level);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    private void probeDeviceStateAsync() {
        if (deviceStateExecutor == null) return;
        deviceStateExecutor.execute(() -> {
            boolean available = deviceState.isAvailable();
            int current = deviceState.getCurrentState();
            int guessedClosed = closedStateId >= 0 ? closedStateId : deviceState.guessClosedState();
            String states = deviceState.describeStates();

            if (closedStateId < 0 && guessedClosed >= 0) {
                closedStateId = guessedClosed;
            }

            prefs.edit()
                    .putBoolean(KEY_DEVICE_STATE_AVAILABLE, available)
                    .putInt(KEY_CURRENT_DEVICE_STATE, current)
                    .putInt(KEY_CLOSED_STATE_ID, closedStateId)
                    .putString(KEY_DEVICE_STATE_STATUS,
                            available ? "可控制 · " + states : "一般 App 權限不足 · " + states)
                    .apply();
        });
    }

    private void captureClosedStateIfNeededAsync() {
        if (closedStateId >= 0 || stateCommandInFlight || deviceStateExecutor == null) return;
        stateCommandInFlight = true;
        deviceStateExecutor.execute(() -> {
            int current = deviceState.getCurrentState();
            if (current < 0) current = deviceState.guessClosedState();
            final int captured = current;
            mainHandler.post(() -> {
                if (captured >= 0) {
                    closedStateId = captured;
                    prefs.edit()
                            .putInt(KEY_CLOSED_STATE_ID, captured)
                            .putString(KEY_DEVICE_STATE_STATUS, "已記錄合起來外螢幕狀態 ID=" + captured)
                            .apply();
                }
                stateCommandInFlight = false;
            });
        });
    }

    private void ensureCoverStateForcedAsync() {
        if (coverStateForced || stateCommandInFlight || deviceStateExecutor == null) return;

        int target = closedStateId;
        if (target < 0) {
            target = deviceState.guessClosedState();
            if (target >= 0) {
                closedStateId = target;
                prefs.edit().putInt(KEY_CLOSED_STATE_ID, target).apply();
            }
        }

        if (target < 0) {
            prefs.edit().putString(KEY_DEVICE_STATE_STATUS,
                    "尚未取得外螢幕狀態 ID；請先完整合起手機一次").apply();
            return;
        }

        final int stateToForce = target;
        stateCommandInFlight = true;
        deviceStateExecutor.execute(() -> {
            DeviceStateController.CommandResult result = deviceState.requestState(stateToForce);
            int current = deviceState.getCurrentState();
            mainHandler.post(() -> {
                coverStateForced = result.ok;
                stateCommandInFlight = false;
                prefs.edit()
                        .putBoolean(KEY_FORCED_COVER, coverStateForced)
                        .putBoolean(KEY_DEVICE_STATE_AVAILABLE, result.ok)
                        .putInt(KEY_CURRENT_DEVICE_STATE, current)
                        .putString(KEY_DEVICE_STATE_STATUS,
                                result.ok
                                        ? "半折已鎖定外螢幕 state=" + stateToForce
                                        : "外螢幕鎖定失敗：" + result.output)
                        .apply();

                // ColorOS can swap physical panels behind the same logical display id.
                // Recreate the overlay after the state switch so it follows the cover panel.
                mainHandler.postDelayed(() -> {
                    overlay.forceRebind();
                    if (transitionActive && !manualMode) {
                        float level = prefs.getFloat(KEY_LAST_LEVEL, MIN_TRANSITION_GLASS);
                        overlay.showLevel(level);
                    }
                }, 90);
            });
        });
    }

    private void leaveForcedStateAsync(boolean captureClosedAfterReset) {
        if ((!coverStateForced && !prefs.getBoolean(KEY_FORCED_COVER, false))
                || stateCommandInFlight
                || deviceStateExecutor == null) {
            return;
        }

        stateCommandInFlight = true;
        deviceStateExecutor.execute(() -> {
            DeviceStateController.CommandResult result = deviceState.resetState();
            try {
                Thread.sleep(100);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            int current = deviceState.getCurrentState();
            mainHandler.post(() -> {
                coverStateForced = false;
                stateCommandInFlight = false;
                prefs.edit()
                        .putBoolean(KEY_FORCED_COVER, false)
                        .putInt(KEY_CURRENT_DEVICE_STATE, current)
                        .putString(KEY_DEVICE_STATE_STATUS,
                                result.ok ? "已恢復 ColorOS 自動螢幕切換" : "恢復失敗：" + result.output)
                        .apply();
                overlay.forceRebind();

                if (captureClosedAfterReset && current >= 0) {
                    closedStateId = current;
                    prefs.edit().putInt(KEY_CLOSED_STATE_ID, current).apply();
                }
            });
        });
    }

    @SuppressWarnings("deprecation")
    private void createScreenWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        int flags = PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP;
        screenWakeLock = pm.newWakeLock(flags, getPackageName() + ":HalfFoldCoverScreen");
        screenWakeLock.setReferenceCounted(false);
    }

    private void updateScreenAwakeState(boolean shouldKeepAwake) {
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
    public void onDisplayAdded(int displayId) {
        if (transitionActive) scheduleOverlayRefresh();
    }

    @Override
    public void onDisplayRemoved(int displayId) {
        if (transitionActive) scheduleOverlayRefresh();
    }

    @Override
    public void onDisplayChanged(int displayId) {
        if (transitionActive) scheduleOverlayRefresh();
    }

    private void scheduleOverlayRefresh() {
        mainHandler.removeCallbacks(displayRefreshRunnable);
        mainHandler.postDelayed(displayRefreshRunnable, 60);
    }

    private final Runnable displayRefreshRunnable = () -> {
        if (!transitionActive || manualMode || overlay == null) return;
        overlay.refreshDisplayBinding();
        overlay.showLevel(prefs.getFloat(KEY_LAST_LEVEL, MIN_TRANSITION_GLASS));
    };

    @Override
    public void onDestroy() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        if (displayManager != null) displayManager.unregisterDisplayListener(this);
        mainHandler.removeCallbacks(displayRefreshRunnable);

        // Never leave the phone in a forced fold state after the feature is stopped.
        if (deviceState != null && (coverStateForced || prefs.getBoolean(KEY_FORCED_COVER, false))) {
            try {
                deviceState.resetState();
            } catch (Exception ignored) {}
        }

        releaseScreenWakeLock();
        if (overlay != null) overlay.hide();
        if (deviceStateExecutor != null) deviceStateExecutor.shutdownNow();
        if (prefs != null) {
            prefs.edit()
                    .putBoolean(KEY_RUNNING, false)
                    .putBoolean(KEY_MANUAL, false)
                    .putBoolean(KEY_KEEP_SCREEN_ON, false)
                    .putBoolean(KEY_FORCED_COVER, false)
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
        channel.setDescription("OPPO 半折外螢幕鎖定、霧化與亮屏效果");
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
                .setContentTitle("NUBO Fold Glass v0.3 運作中")
                .setContentText("全合/全開正常；半折過渡鎖定正面外螢幕並霧化")
                .setContentIntent(openPi)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_menu_close_clear_cancel, "停止", stopPi).build())
                .build();
    }

    private static float normalizeAngle(float raw) {
        if (Float.isNaN(raw) || Float.isInfinite(raw)) return 0f;
        float angle = raw % 360f;
        if (angle < 0f) angle += 360f;
        if (angle > 180f) angle = 360f - angle;
        return angle;
    }
}
