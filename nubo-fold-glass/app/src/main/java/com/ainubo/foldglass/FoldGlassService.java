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
import android.os.SystemClock;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * NUBO Fold Glass v0.5 - OPPO Find N6 dual-panel lock.
 *
 * Goal:
 *  - Fully closed: outer normal, inner allowed to turn off.
 *  - Any intermediate angle: BOTH physical built-in displays must remain active;
 *    outer gets the frost, inner stays visible.
 *  - Fully open: restore stock ColorOS behavior.
 *
 * v0.5 never trusts the name HALF_OPENED alone. A DeviceState is persisted only
 * after DisplayManager confirms that at least two built-in panels are actually ON.
 */
public class FoldGlassService extends Service implements SensorEventListener, DisplayManager.DisplayListener {
    public static final String ACTION_START_AUTO = "com.ainubo.foldglass.START_AUTO";
    public static final String ACTION_PREVIEW = "com.ainubo.foldglass.PREVIEW";
    public static final String ACTION_RECALIBRATE = "com.ainubo.foldglass.RECALIBRATE";
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
    static final String KEY_SHIZUKU_STATUS = "shizuku_status";
    static final String KEY_COVER_DISPLAY_ID = "cover_display_id";
    static final String KEY_INNER_DISPLAY_ID = "inner_display_id";
    static final String KEY_DISPLAY_COUNT = "display_count";
    static final String KEY_BUILTIN_DISPLAY_COUNT = "builtin_display_count";
    static final String KEY_ACTIVE_BUILTIN_COUNT = "active_builtin_count";
    static final String KEY_DISPLAY_SUMMARY = "display_summary";
    static final String KEY_CLOSED_STATE_ID = "closed_state_id";
    static final String KEY_OPEN_STATE_ID = "open_state_id";
    static final String KEY_VERIFIED_DUAL_STATE_ID = "verified_dual_state_id";
    static final String KEY_VERIFIED_DUAL_STATE_NAME = "verified_dual_state_name";
    static final String KEY_DUAL_VERIFIED = "dual_verified";
    static final String KEY_FORCED_TRANSITION = "forced_transition";
    static final String KEY_CALIBRATION_STATUS = "calibration_status";

    private static final String CHANNEL_ID = "nubo_fold_glass";
    private static final int NOTIFICATION_ID = 6106;

    private static final float CLOSED_ENDPOINT_MAX = 2.0f;
    private static final float OPEN_ENDPOINT_MIN = 178.0f;
    private static final float CALIBRATION_MIN_ANGLE = 12f;
    private static final float CALIBRATION_MAX_ANGLE = 168f;
    private static final float MIN_TRANSITION_GLASS = 0.08f;
    private static final long REASSERT_COOLDOWN_MS = 420L;

    private SensorManager sensorManager;
    private Sensor hingeSensor;
    private DisplayManager displayManager;
    private GlassOverlayController overlay;
    private SharedPreferences prefs;
    private PowerManager.WakeLock screenWakeLock;
    private DeviceStateController deviceState;
    private ExecutorService deviceStateExecutor;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private volatile boolean manualMode = false;
    private volatile boolean transitionActive = false;
    private volatile boolean calibrationRunning = false;
    private volatile float lastAngle = -1f;

    private boolean keepingScreenOn = false;
    private boolean transitionStateForced = false;
    private boolean stateCommandInFlight = false;
    private boolean resetPending = false;
    private boolean calibrationAttempted = false;
    private int reassertFailures = 0;
    private long lastReassertAt = 0L;

    private int coverDisplayId = -1;
    private int closedStateId = -1;
    private int openStateId = -1;
    private int verifiedDualStateId = -1;
    private String verifiedDualStateName = "";

    @Override public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        coverDisplayId = prefs.getInt(KEY_COVER_DISPLAY_ID, -1);
        closedStateId = prefs.getInt(KEY_CLOSED_STATE_ID, -1);
        openStateId = prefs.getInt(KEY_OPEN_STATE_ID, -1);
        verifiedDualStateId = prefs.getInt(KEY_VERIFIED_DUAL_STATE_ID, -1);
        verifiedDualStateName = prefs.getString(KEY_VERIFIED_DUAL_STATE_NAME, "");

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
                .putBoolean(KEY_DUAL_VERIFIED, verifiedDualStateId >= 0)
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
            calibrationAttempted = false;
            resetForcedStateAsync("手動預覽");
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

        if (ACTION_RECALIBRATE.equals(action)) {
            manualMode = false;
            calibrationAttempted = false;
            reassertFailures = 0;
            verifiedDualStateId = -1;
            verifiedDualStateName = "";
            prefs.edit()
                    .putBoolean(KEY_MANUAL, false)
                    .putBoolean(KEY_DUAL_VERIFIED, false)
                    .putInt(KEY_VERIFIED_DUAL_STATE_ID, -1)
                    .putString(KEY_VERIFIED_DUAL_STATE_NAME, "")
                    .putString(KEY_CALIBRATION_STATUS, "已清除舊結果；請保持手機半折，v0.5 會重新搜尋真正雙螢幕 state")
                    .apply();
            if (isCalibrationAngle(lastAngle)) startCalibrationIfNeeded();
            return START_STICKY;
        }

        manualMode = false;
        calibrationAttempted = false;
        prefs.edit().putBoolean(KEY_MANUAL, false).apply();
        probeDeviceStateAsync();
        return START_STICKY;
    }

    @Override public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_HINGE_ANGLE || event.values.length == 0) return;
        lastAngle = normalizeAngle(event.values[0]);
        prefs.edit().putFloat(KEY_LAST_ANGLE, lastAngle).apply();
        if (manualMode) return;

        if (lastAngle <= CLOSED_ENDPOINT_MAX) {
            enterClosedEndpoint();
        } else if (lastAngle >= OPEN_ENDPOINT_MIN) {
            enterOpenEndpoint();
        } else {
            enterTransition(lastAngle);
        }
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    private void enterClosedEndpoint() {
        transitionActive = false;
        calibrationAttempted = false;
        reassertFailures = 0;
        updateGlobalAwake(false);
        overlay.setKeepScreenOn(false);
        overlay.hide();
        prefs.edit().putFloat(KEY_LAST_LEVEL, 0f).apply();
        resetForcedStateAsync("完全合起");
        captureEndpointStateAsync(true);

        mainHandler.removeCallbacks(captureCoverRunnable);
        mainHandler.postDelayed(captureCoverRunnable, 240);
    }

    private void enterOpenEndpoint() {
        transitionActive = false;
        calibrationAttempted = false;
        reassertFailures = 0;
        updateGlobalAwake(false);
        overlay.setKeepScreenOn(false);
        overlay.hide();
        prefs.edit().putFloat(KEY_LAST_LEVEL, 0f).apply();
        resetForcedStateAsync("完全展開");
        captureEndpointStateAsync(false);
        updateDisplayDiagnostics();
    }

    private void enterTransition(float angle) {
        transitionActive = true;
        updateGlobalAwake(true);

        overlay.setCoverDisplayHint(coverDisplayId);
        overlay.setKeepScreenOn(true);
        float level = Math.max(MIN_TRANSITION_GLASS, AngleMapper.toGlassLevel(angle));
        prefs.edit().putFloat(KEY_LAST_LEVEL, level).apply();
        overlay.showLevel(level);

        if (verifiedDualStateId >= 0) {
            ensureVerifiedDualStateAsync(false);
        } else {
            startCalibrationIfNeeded();
        }
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

    private void captureEndpointStateAsync(boolean closed) {
        if (deviceStateExecutor == null) return;
        deviceStateExecutor.execute(() -> {
            sleepQuietly(260);
            int state = deviceState.getCurrentState();
            mainHandler.post(() -> {
                if (state < 0) return;
                if (closed && lastAngle <= CLOSED_ENDPOINT_MAX) {
                    closedStateId = state;
                    prefs.edit().putInt(KEY_CLOSED_STATE_ID, state).apply();
                } else if (!closed && lastAngle >= OPEN_ENDPOINT_MIN) {
                    openStateId = state;
                    prefs.edit().putInt(KEY_OPEN_STATE_ID, state).apply();
                }
            });
        });
    }

    private void probeDeviceStateAsync() {
        if (deviceStateExecutor == null) return;
        deviceStateExecutor.execute(() -> {
            boolean available = deviceState.isAvailable();
            int current = deviceState.getCurrentState();
            String states = deviceState.describeStates();
            boolean shizukuRunning = deviceState.isShizukuRunning();
            boolean shizukuGranted = deviceState.hasShizukuPermission();

            mainHandler.post(() -> prefs.edit()
                    .putBoolean(KEY_DEVICE_STATE_AVAILABLE, available)
                    .putInt(KEY_CURRENT_DEVICE_STATE, current)
                    .putString(KEY_SHIZUKU_STATUS,
                            shizukuGranted ? "Shizuku 已授權 ✓"
                                    : shizukuRunning ? "Shizuku 已啟動，尚未授權"
                                    : "Shizuku 未啟動；若 OPPO 阻擋 state 控制則需要它")
                    .putString(KEY_DEVICE_STATE_STATUS,
                            "支援 states：" + states)
                    .apply());
        });
    }

    private void startCalibrationIfNeeded() {
        if (calibrationRunning || calibrationAttempted || manualMode || !transitionActive) return;
        if (!isCalibrationAngle(lastAngle) || deviceStateExecutor == null) return;

        calibrationAttempted = true;
        calibrationRunning = true;
        prefs.edit().putString(KEY_CALIBRATION_STATUS,
                "正在搜尋 Find N6 真正雙螢幕 state…請先保持半折").apply();

        deviceStateExecutor.execute(() -> {
            List<DeviceStateController.StateInfo> candidates =
                    deviceState.getTransitionCandidates(closedStateId, openStateId);
            StringBuilder attempts = new StringBuilder();
            DeviceStateController.StateInfo winner = null;
            DeviceStateController.CommandResult winnerResult = null;
            int winnerActive = 0;

            for (DeviceStateController.StateInfo candidate : candidates) {
                if (!transitionActive || manualMode) break;
                DeviceStateController.CommandResult result = deviceState.requestState(candidate.id);
                if (attempts.length() > 0) attempts.append(" ; ");
                attempts.append(candidate.id).append(":").append(candidate.name)
                        .append(result.ok ? "=cmdOK" : "=cmdFAIL");
                if (!result.ok) continue;

                sleepQuietly(220);
                int active = overlay.getActiveBuiltInDisplayCount();
                attempts.append("/active=").append(active);
                if (active >= 2) {
                    winner = candidate;
                    winnerResult = result;
                    winnerActive = active;
                    break;
                }

                deviceState.resetState();
                sleepQuietly(110);
            }

            final DeviceStateController.StateInfo found = winner;
            final DeviceStateController.CommandResult foundResult = winnerResult;
            final int activeCount = winnerActive;
            final String attemptText = attempts.toString();

            if (found == null || !transitionActive || manualMode) {
                deviceState.resetState();
            }

            mainHandler.post(() -> {
                calibrationRunning = false;
                stateCommandInFlight = false;

                if (found != null && transitionActive && !manualMode) {
                    verifiedDualStateId = found.id;
                    verifiedDualStateName = found.name;
                    transitionStateForced = true;
                    reassertFailures = 0;
                    prefs.edit()
                            .putBoolean(KEY_DUAL_VERIFIED, true)
                            .putBoolean(KEY_FORCED_TRANSITION, true)
                            .putInt(KEY_VERIFIED_DUAL_STATE_ID, found.id)
                            .putString(KEY_VERIFIED_DUAL_STATE_NAME, found.name)
                            .putString(KEY_CALIBRATION_STATUS,
                                    "雙螢幕驗證成功 ✓ state=" + found.id + ":" + found.name
                                            + " · active=" + activeCount
                                            + " · backend=" + (foundResult == null ? "?" : foundResult.backend))
                            .putString(KEY_DEVICE_STATE_STATUS, "校準紀錄：" + attemptText)
                            .apply();
                    overlay.forceRebind();
                    overlay.setCoverDisplayHint(coverDisplayId);
                    overlay.setKeepScreenOn(true);
                    overlay.showLevel(prefs.getFloat(KEY_LAST_LEVEL, MIN_TRANSITION_GLASS));
                } else {
                    transitionStateForced = false;
                    prefs.edit()
                            .putBoolean(KEY_DUAL_VERIFIED, false)
                            .putBoolean(KEY_FORCED_TRANSITION, false)
                            .putString(KEY_CALIBRATION_STATUS,
                                    "沒有找到能讓兩塊面板同時 ON 的 state。若命令被 OPPO 擋住，請啟動並授權 Shizuku 後重新校準。")
                            .putString(KEY_DEVICE_STATE_STATUS, "校準紀錄：" + attemptText)
                            .apply();
                }
                updateDisplayDiagnostics();
                if (resetPending || !transitionActive) resetForcedStateAsync("校準後離開過渡");
            });
        });
    }

    private void ensureVerifiedDualStateAsync(boolean forceReassert) {
        if (verifiedDualStateId < 0 || manualMode || !transitionActive) return;
        if (calibrationRunning || stateCommandInFlight || deviceStateExecutor == null) return;

        int active = overlay.getActiveBuiltInDisplayCount();
        if (!forceReassert && transitionStateForced && active >= 2) return;

        long now = SystemClock.elapsedRealtime();
        if (now - lastReassertAt < REASSERT_COOLDOWN_MS) return;
        lastReassertAt = now;
        stateCommandInFlight = true;
        final int target = verifiedDualStateId;

        deviceStateExecutor.execute(() -> {
            DeviceStateController.CommandResult result = deviceState.requestState(target);
            sleepQuietly(170);
            int activeCount = overlay.getActiveBuiltInDisplayCount();
            int current = deviceState.getCurrentState();

            mainHandler.post(() -> {
                stateCommandInFlight = false;
                boolean success = result.ok && activeCount >= 2 && transitionActive && !manualMode;
                transitionStateForced = success;

                if (success) {
                    reassertFailures = 0;
                    prefs.edit()
                            .putBoolean(KEY_FORCED_TRANSITION, true)
                            .putBoolean(KEY_DUAL_VERIFIED, true)
                            .putInt(KEY_CURRENT_DEVICE_STATE, current)
                            .putString(KEY_DEVICE_STATE_STATUS,
                                    "雙螢幕鎖定 ON ✓ state=" + target
                                            + " · active=" + activeCount
                                            + " · backend=" + result.backend)
                            .apply();
                    overlay.forceRebind();
                    overlay.setCoverDisplayHint(coverDisplayId);
                    overlay.setKeepScreenOn(true);
                    overlay.showLevel(prefs.getFloat(KEY_LAST_LEVEL, MIN_TRANSITION_GLASS));
                } else {
                    reassertFailures++;
                    prefs.edit()
                            .putBoolean(KEY_FORCED_TRANSITION, false)
                            .putInt(KEY_CURRENT_DEVICE_STATE, current)
                            .putString(KEY_DEVICE_STATE_STATUS,
                                    "雙螢幕重新鎖定失敗 #" + reassertFailures
                                            + " · active=" + activeCount
                                            + " · " + result.output)
                            .apply();

                    if (reassertFailures >= 3 && transitionActive) {
                        verifiedDualStateId = -1;
                        verifiedDualStateName = "";
                        transitionStateForced = false;
                        calibrationAttempted = false;
                        prefs.edit()
                                .putBoolean(KEY_DUAL_VERIFIED, false)
                                .putInt(KEY_VERIFIED_DUAL_STATE_ID, -1)
                                .putString(KEY_VERIFIED_DUAL_STATE_NAME, "")
                                .putString(KEY_CALIBRATION_STATUS, "舊雙螢幕 state 已失效，重新自動校準")
                                .apply();
                        startCalibrationIfNeeded();
                    }
                }

                updateDisplayDiagnostics();
                if (resetPending || !transitionActive) resetForcedStateAsync("離開過渡");
            });
        });
    }

    private void resetForcedStateAsync(String reason) {
        if (deviceStateExecutor == null) return;
        if (calibrationRunning || stateCommandInFlight) {
            resetPending = true;
            return;
        }
        resetPending = false;
        if (!transitionStateForced && !prefs.getBoolean(KEY_FORCED_TRANSITION, false)) {
            return;
        }

        stateCommandInFlight = true;
        deviceStateExecutor.execute(() -> {
            DeviceStateController.CommandResult result = deviceState.resetState();
            sleepQuietly(100);
            int current = deviceState.getCurrentState();
            mainHandler.post(() -> {
                stateCommandInFlight = false;
                transitionStateForced = false;
                prefs.edit()
                        .putBoolean(KEY_FORCED_TRANSITION, false)
                        .putInt(KEY_CURRENT_DEVICE_STATE, current)
                        .putString(KEY_DEVICE_STATE_STATUS,
                                result.ok
                                        ? reason + "：已解除雙螢幕鎖定，恢復 ColorOS"
                                        : reason + "：解除 state 失敗 " + result.output)
                        .apply();
                updateDisplayDiagnostics();
            });
        });
    }

    @SuppressWarnings("deprecation")
    private void createScreenWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        int flags = PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP;
        screenWakeLock = pm.newWakeLock(flags, getPackageName() + ":FindN6DualPanelTransition");
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
        if (prefs != null) prefs.edit().putBoolean(KEY_KEEP_SCREEN_ON, false).apply();
    }

    private void updateDisplayDiagnostics() {
        if (overlay == null || prefs == null) return;
        int resolvedCover = coverDisplayId >= 0 ? coverDisplayId : overlay.getResolvedCoverDisplayId();
        prefs.edit()
                .putInt(KEY_COVER_DISPLAY_ID, resolvedCover)
                .putInt(KEY_INNER_DISPLAY_ID, overlay.getResolvedInnerDisplayId())
                .putInt(KEY_DISPLAY_COUNT, overlay.getVisibleDisplayCount())
                .putInt(KEY_BUILTIN_DISPLAY_COUNT, overlay.getBuiltInDisplayCount())
                .putInt(KEY_ACTIVE_BUILTIN_COUNT, overlay.getActiveBuiltInDisplayCount())
                .putString(KEY_DISPLAY_SUMMARY, overlay.getDisplaySummary())
                .apply();
    }

    @Override public void onDisplayAdded(int displayId) { scheduleDisplayRefresh(); }
    @Override public void onDisplayRemoved(int displayId) { scheduleDisplayRefresh(); }
    @Override public void onDisplayChanged(int displayId) { scheduleDisplayRefresh(); }

    private void scheduleDisplayRefresh() {
        mainHandler.removeCallbacks(displayRefreshRunnable);
        mainHandler.postDelayed(displayRefreshRunnable, 55);
    }

    private final Runnable displayRefreshRunnable = () -> {
        if (overlay == null) return;
        overlay.refreshDisplayBinding();
        if (transitionActive && !manualMode) {
            overlay.setKeepScreenOn(true);
            overlay.showLevel(prefs.getFloat(KEY_LAST_LEVEL, MIN_TRANSITION_GLASS));
            int active = overlay.getActiveBuiltInDisplayCount();
            if (verifiedDualStateId >= 0 && active < 2) {
                ensureVerifiedDualStateAsync(true);
            } else if (verifiedDualStateId < 0 && !calibrationRunning) {
                startCalibrationIfNeeded();
            }
        }
        updateDisplayDiagnostics();
    };

    @Override public void onDestroy() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        if (displayManager != null) displayManager.unregisterDisplayListener(this);
        mainHandler.removeCallbacks(displayRefreshRunnable);
        mainHandler.removeCallbacks(captureCoverRunnable);

        transitionActive = false;
        manualMode = false;
        try {
            if (deviceState != null) deviceState.resetState();
        } catch (Exception ignored) {}

        releaseWakeLock();
        if (overlay != null) {
            overlay.setKeepScreenOn(false);
            overlay.hide();
        }
        if (deviceStateExecutor != null) deviceStateExecutor.shutdownNow();
        if (prefs != null) {
            prefs.edit()
                    .putBoolean(KEY_RUNNING, false)
                    .putBoolean(KEY_MANUAL, false)
                    .putBoolean(KEY_KEEP_SCREEN_ON, false)
                    .putBoolean(KEY_FORCED_TRANSITION, false)
                    .putFloat(KEY_LAST_LEVEL, 0f)
                    .apply();
        }
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
        channel.setDescription("Find N6 半折期間內外雙螢幕鎖定與外螢幕霧化");
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
                .setContentTitle("NUBO Fold Glass v0.5")
                .setContentText("半折：內外螢幕都亮；完全合起才關內螢幕")
                .setContentIntent(openPi)
                .addAction(new Notification.Action.Builder(
                        null, "停止", stopPi).build())
                .setOngoing(true)
                .build();
    }

    private static boolean isCalibrationAngle(float angle) {
        return angle >= CALIBRATION_MIN_ANGLE && angle <= CALIBRATION_MAX_ANGLE;
    }

    private static float normalizeAngle(float angle) {
        if (Float.isNaN(angle) || Float.isInfinite(angle)) return 0f;
        return Math.max(0f, Math.min(180f, angle));
    }

    private static float clamp(float value) {
        return Math.max(0f, Math.min(1f, value));
    }

    private static void sleepQuietly(long ms) {
        try { Thread.sleep(ms); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
