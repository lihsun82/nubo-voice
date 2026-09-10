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

/**
 * NUBO Fold Glass v0.4 - video-matched dual-display transition state machine.
 *
 * CLOSED (~0°): cover normal, inner released/off by ColorOS.
 * TRANSITION: cover frosted + inner kept awake; prefer a dual/half-fold DeviceState.
 * OPEN (~180°): inner normal, all transition overrides released.
 */
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
    static final String KEY_CURRENT_DEVICE_STATE = "current_device_state";
    static final String KEY_TRANSITION_STATE_ID = "transition_state_id";
    static final String KEY_TRANSITION_STATE_NAME = "transition_state_name";
    static final String KEY_FORCED_TRANSITION = "forced_transition";
    static final String KEY_SHIZUKU_STATUS = "shizuku_status";
    static final String KEY_COVER_DISPLAY_ID = "cover_display_id";
    static final String KEY_INNER_DISPLAY_ID = "inner_display_id";
    static final String KEY_DISPLAY_COUNT = "display_count";
    static final String KEY_DISPLAY_SUMMARY = "display_summary";

    private static final String CHANNEL_ID = "nubo_fold_glass";
    private static final int NOTIFICATION_ID = 6106;

    // Keep the inner display alive almost all the way to physical closure.
    private static final float CLOSED_ENDPOINT_MAX = 4f;
    private static final float OPEN_ENDPOINT_MIN = 176f;
    private static final float MIN_TRANSITION_GLASS = 0.08f;

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
    private boolean transitionActive = false;
    private boolean keepingScreenOn = false;
    private boolean wantTransitionState = false;
    private boolean transitionStateForced = false;
    private boolean stateCommandInFlight = false;
    private int transitionStateId = -1;
    private String transitionStateName = "";
    private int coverDisplayId = -1;

    @Override public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        coverDisplayId = prefs.getInt(KEY_COVER_DISPLAY_ID, -1);
        transitionStateId = prefs.getInt(KEY_TRANSITION_STATE_ID, -1);
        transitionStateName = prefs.getString(KEY_TRANSITION_STATE_NAME, "");

        overlay = new GlassOverlayController(this);
        overlay.setCoverDisplayHint(coverDisplayId);
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        hingeSensor = sensorManager.getDefaultSensor(Sensor.TYPE_HINGE_ANGLE);
        displayManager = getSystemService(DisplayManager.class);
        deviceState = new DeviceStateController();
        deviceStateExecutor = Executors.newSingleThreadExecutor();
        createScreenWakeLock();

        prefs.edit()
                .putBoolean(KEY_RUNNING, true)
                .putBoolean(KEY_KEEP_SCREEN_ON, false)
                .putBoolean(KEY_FORCED_TRANSITION, false)
                .putBoolean(KEY_BLUR_AVAILABLE, overlay.isBlurAvailable())
                .putString(KEY_SENSOR, hingeSensor == null
                        ? "未偵測到標準 TYPE_HINGE_ANGLE"
                        : hingeSensor.getName() + " / " + hingeSensor.getVendor())
                .apply();

        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
        if (hingeSensor != null) {
            sensorManager.registerListener(this, hingeSensor, SensorManager.SENSOR_DELAY_GAME);
        }
        if (displayManager != null) displayManager.registerDisplayListener(this, mainHandler);
        probeDeviceStateAsync();
        updateDisplayDiagnostics();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START_AUTO : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_PREVIEW.equals(action)) {
            manualMode = true;
            transitionActive = false;
            wantTransitionState = false;
            dispatchStateCommand();
            float level = clamp(intent.getFloatExtra(EXTRA_LEVEL, 0f));
            overlay.setKeepScreenOn(level >= 0.015f);
            overlay.showLevel(level);
            prefs.edit()
                    .putBoolean(KEY_MANUAL, true)
                    .putFloat(KEY_LAST_LEVEL, level)
                    .apply();
            updateDisplayDiagnostics();
            return START_STICKY;
        }

        manualMode = false;
        prefs.edit().putBoolean(KEY_MANUAL, false).apply();
        return START_STICKY;
    }

    @Override public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_HINGE_ANGLE || event.values.length == 0) return;
        float angle = normalizeAngle(event.values[0]);
        prefs.edit().putFloat(KEY_LAST_ANGLE, angle).apply();
        if (manualMode) return;

        if (angle <= CLOSED_ENDPOINT_MAX) {
            enterClosedEndpoint();
        } else if (angle >= OPEN_ENDPOINT_MIN) {
            enterOpenEndpoint();
        } else {
            enterTransition(angle);
        }
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    private void enterClosedEndpoint() {
        transitionActive = false;
        wantTransitionState = false;
        updateGlobalAwake(false);
        overlay.setKeepScreenOn(false);
        overlay.hide();
        prefs.edit().putFloat(KEY_LAST_LEVEL, 0f).apply();
        dispatchStateCommand();

        // After ColorOS settles into the physically closed state, remember which
        // logical display is the cover panel. This prevents accidental blur on
        // the large inner display on subsequent transitions.
        mainHandler.removeCallbacks(captureCoverRunnable);
        mainHandler.postDelayed(captureCoverRunnable, 180);
    }

    private void enterOpenEndpoint() {
        transitionActive = false;
        wantTransitionState = false;
        updateGlobalAwake(false);
        overlay.setKeepScreenOn(false);
        overlay.hide();
        prefs.edit().putFloat(KEY_LAST_LEVEL, 0f).apply();
        dispatchStateCommand();
        updateDisplayDiagnostics();
    }

    private void enterTransition(float angle) {
        transitionActive = true;
        wantTransitionState = true;
        updateGlobalAwake(true);
        dispatchStateCommand();

        overlay.setCoverDisplayHint(coverDisplayId);
        overlay.setKeepScreenOn(true);
        float level = Math.max(MIN_TRANSITION_GLASS, AngleMapper.toGlassLevel(angle));
        prefs.edit().putFloat(KEY_LAST_LEVEL, level).apply();
        overlay.showLevel(level);
        updateDisplayDiagnostics();
    }

    private final Runnable captureCoverRunnable = () -> {
        if (transitionActive || manualMode || overlay == null) return;
        int id = overlay.captureCoverDisplayHint();
        if (id >= 0) {
            coverDisplayId = id;
            prefs.edit().putInt(KEY_COVER_DISPLAY_ID, id).apply();
        }
        updateDisplayDiagnostics();
    };

    private void probeDeviceStateAsync() {
        if (deviceStateExecutor == null) return;
        deviceStateExecutor.execute(() -> {
            boolean available = deviceState.isAvailable();
            int current = deviceState.getCurrentState();
            DeviceStateController.StateInfo candidate = deviceState.guessTransitionState();
            String states = deviceState.describeStates();
            boolean shizukuRunning = deviceState.isShizukuRunning();
            boolean shizukuGranted = deviceState.hasShizukuPermission();

            mainHandler.post(() -> {
                if (candidate != null) {
                    transitionStateId = candidate.id;
                    transitionStateName = candidate.name;
                } else {
                    transitionStateId = -1;
                    transitionStateName = "";
                }
                prefs.edit()
                        .putBoolean(KEY_DEVICE_STATE_AVAILABLE, available)
                        .putInt(KEY_CURRENT_DEVICE_STATE, current)
                        .putInt(KEY_TRANSITION_STATE_ID, transitionStateId)
                        .putString(KEY_TRANSITION_STATE_NAME, transitionStateName)
                        .putString(KEY_SHIZUKU_STATUS,
                                shizukuGranted ? "Shizuku 已授權 ✓"
                                        : shizukuRunning ? "Shizuku 已啟動，尚未授權"
                                        : "Shizuku 未啟動（一般權限可用時不需要）")
                        .putString(KEY_DEVICE_STATE_STATUS,
                                candidate != null
                                        ? "過渡候選=" + candidate.id + ":" + candidate.name + " · " + states
                                        : "找不到 DUAL/CONCURRENT/HALF_FOLDED 過渡 state · " + states)
                        .apply();
                if (transitionActive) dispatchStateCommand();
            });
        });
    }

    /**
     * Serializes request/reset commands. If OPPO rejects the first transition
     * request, fail closed: stop forcing device state and wait for Shizuku or a
     * fresh service start instead of hammering the system command repeatedly.
     */
    private void dispatchStateCommand() {
        if (stateCommandInFlight || deviceStateExecutor == null) return;
        if (wantTransitionState == transitionStateForced) return;

        if (wantTransitionState && transitionStateId < 0) {
            prefs.edit().putString(KEY_DEVICE_STATE_STATUS,
                    "雙螢幕過渡 state 不可用：維持 ColorOS 原生切換；若內/外不能同時亮，需 Shizuku 或 OPPO 專屬 state")
                    .apply();
            return;
        }

        final boolean request = wantTransitionState;
        final int target = transitionStateId;
        stateCommandInFlight = true;
        deviceStateExecutor.execute(() -> {
            DeviceStateController.CommandResult result = request
                    ? deviceState.requestState(target)
                    : deviceState.resetState();
            int current = deviceState.getCurrentState();

            mainHandler.post(() -> {
                stateCommandInFlight = false;
                if (result.ok) {
                    transitionStateForced = request;
                } else if (!request) {
                    transitionStateForced = false;
                } else {
                    // Prevent repeated failed requests during every sensor event.
                    transitionStateId = -1;
                    transitionStateName = "";
                }

                prefs.edit()
                        .putBoolean(KEY_FORCED_TRANSITION, transitionStateForced)
                        .putBoolean(KEY_DEVICE_STATE_AVAILABLE, result.ok || prefs.getBoolean(KEY_DEVICE_STATE_AVAILABLE, false))
                        .putInt(KEY_CURRENT_DEVICE_STATE, current)
                        .putInt(KEY_TRANSITION_STATE_ID, transitionStateId)
                        .putString(KEY_TRANSITION_STATE_NAME, transitionStateName)
                        .putString(KEY_DEVICE_STATE_STATUS,
                                result.ok
                                        ? (request
                                            ? "雙螢幕過渡 state=" + target + " 已啟用 · backend=" + result.backend
                                            : "已解除過渡 state，恢復 ColorOS · backend=" + result.backend)
                                        : (request
                                            ? "雙螢幕過渡 state 啟用失敗，已停止重試：" + result.output
                                            : "解除過渡 state 失敗：" + result.output))
                        .apply();

                // Device-state changes can create/remove logical displays.
                mainHandler.postDelayed(() -> {
                    overlay.forceRebind();
                    if (transitionActive && !manualMode) {
                        overlay.setCoverDisplayHint(coverDisplayId);
                        overlay.setKeepScreenOn(true);
                        overlay.showLevel(prefs.getFloat(KEY_LAST_LEVEL, MIN_TRANSITION_GLASS));
                    }
                    updateDisplayDiagnostics();
                }, 100);

                if (result.ok && wantTransitionState != transitionStateForced) {
                    dispatchStateCommand();
                }
            });
        });
    }

    @SuppressWarnings("deprecation")
    private void createScreenWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        int flags = PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP;
        screenWakeLock = pm.newWakeLock(flags, getPackageName() + ":DualFoldTransition");
        screenWakeLock.setReferenceCounted(false);
    }

    private void updateGlobalAwake(boolean shouldKeepAwake) {
        if (shouldKeepAwake == keepingScreenOn) return;
        keepingScreenOn = shouldKeepAwake;
        if (screenWakeLock != null) {
            if (shouldKeepAwake && !screenWakeLock.isHeld()) {
                try { screenWakeLock.acquire(); } catch (Exception ignored) {}
            } else if (!shouldKeepAwake && screenWakeLock.isHeld()) {
                try { screenWakeLock.release(); } catch (Exception ignored) {}
            }
        }
        prefs.edit().putBoolean(KEY_KEEP_SCREEN_ON, shouldKeepAwake).apply();
    }

    private void releaseWakeLock() {
        keepingScreenOn = false;
        if (screenWakeLock != null && screenWakeLock.isHeld()) {
            try { screenWakeLock.release(); } catch (Exception ignored) {}
        }
        prefs.edit().putBoolean(KEY_KEEP_SCREEN_ON, false).apply();
    }

    private void updateDisplayDiagnostics() {
        if (overlay == null || prefs == null) return;
        int resolvedCover = coverDisplayId >= 0 ? coverDisplayId : overlay.getResolvedCoverDisplayId();
        prefs.edit()
                .putInt(KEY_COVER_DISPLAY_ID, resolvedCover)
                .putInt(KEY_INNER_DISPLAY_ID, overlay.getResolvedInnerDisplayId())
                .putInt(KEY_DISPLAY_COUNT, overlay.getVisibleDisplayCount())
                .putString(KEY_DISPLAY_SUMMARY, overlay.getDisplaySummary())
                .apply();
    }

    @Override public void onDisplayAdded(int displayId) { scheduleDisplayRefresh(); }
    @Override public void onDisplayRemoved(int displayId) { scheduleDisplayRefresh(); }
    @Override public void onDisplayChanged(int displayId) { scheduleDisplayRefresh(); }

    private void scheduleDisplayRefresh() {
        mainHandler.removeCallbacks(displayRefreshRunnable);
        mainHandler.postDelayed(displayRefreshRunnable, 50);
    }

    private final Runnable displayRefreshRunnable = () -> {
        if (overlay == null) return;
        overlay.refreshDisplayBinding();
        if (transitionActive && !manualMode) {
            overlay.setKeepScreenOn(true);
            overlay.showLevel(prefs.getFloat(KEY_LAST_LEVEL, MIN_TRANSITION_GLASS));
        }
        updateDisplayDiagnostics();
    };

    @Override public void onDestroy() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        if (displayManager != null) displayManager.unregisterDisplayListener(this);
        mainHandler.removeCallbacks(displayRefreshRunnable);
        mainHandler.removeCallbacks(captureCoverRunnable);

        wantTransitionState = false;
        if (deviceState != null && (transitionStateForced || prefs.getBoolean(KEY_FORCED_TRANSITION, false))) {
            try { deviceState.resetState(); } catch (Exception ignored) {}
        }
        transitionStateForced = false;
        releaseWakeLock();
        if (overlay != null) {
            overlay.setKeepScreenOn(false);
            overlay.hide();
        }
        if (deviceStateExecutor != null) deviceStateExecutor.shutdownNow();
        prefs.edit()
                .putBoolean(KEY_RUNNING, false)
                .putBoolean(KEY_MANUAL, false)
                .putBoolean(KEY_FORCED_TRANSITION, false)
                .putFloat(KEY_LAST_LEVEL, 0f)
                .apply();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private void createNotificationChannel() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "NUBO Fold Glass",
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("半折時外螢幕霧化、內螢幕持續亮至完全闔上");
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
                .setContentTitle("NUBO Fold Glass v0.4 運作中")
                .setContentText("半折雙螢幕過渡：外螢幕霧化＋內螢幕保持亮起")
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

    private static float clamp(float value) {
        return Math.max(0f, Math.min(1f, value));
    }
}
