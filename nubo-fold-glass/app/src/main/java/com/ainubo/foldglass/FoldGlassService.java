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
 * NUBO Fold Glass v0.7 - direct display-power hand-off for OPPO Find N6.
 *
 * CLOSED: outer normal, inner released.
 * TRANSITION: directly request STATE_ON for both logical internal displays via
 * Shizuku/DisplayManagerService, keep the cover frosted, and optionally keep a
 * verified concurrent DeviceState as a secondary helper.
 * OPEN: reset all display-power overrides and return control to ColorOS.
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
    static final String KEY_PHYSICAL_PANEL_COUNT = "physical_panel_count";
    static final String KEY_PHYSICAL_ACTIVE_COUNT = "physical_active_count";
    static final String KEY_PHYSICAL_PANEL_SUMMARY = "physical_panel_summary";
    static final String KEY_PHYSICAL_PANEL_BACKEND = "physical_panel_backend";
    static final String KEY_CLOSED_STATE_ID = "closed_state_id";
    static final String KEY_OPEN_STATE_ID = "open_state_id";
    static final String KEY_VERIFIED_DUAL_STATE_ID = "verified_dual_state_id";
    static final String KEY_VERIFIED_DUAL_STATE_NAME = "verified_dual_state_name";
    static final String KEY_DUAL_VERIFIED = "dual_verified";
    static final String KEY_FORCED_TRANSITION = "forced_transition";
    static final String KEY_CALIBRATION_STATUS = "calibration_status";
    static final String KEY_OUTER_LOGICAL_ID = "outer_logical_id";
    static final String KEY_INNER_LOGICAL_ID = "inner_logical_id";
    static final String KEY_DIRECT_POWER_OK = "direct_power_ok";
    static final String KEY_DIRECT_POWER_STATUS = "direct_power_status";
    static final String KEY_LOGICAL_INTERNAL_SUMMARY = "logical_internal_summary";

    private static final String CHANNEL_ID = "nubo_fold_glass";
    private static final int NOTIFICATION_ID = 6106;

    private static final float CLOSED_ENDPOINT_MAX = 1.0f;
    private static final float OPEN_ENDPOINT_MIN = 179.0f;
    private static final float CALIBRATION_MIN_ANGLE = 8f;
    private static final float CALIBRATION_MAX_ANGLE = 172f;
    private static final float MIN_TRANSITION_GLASS = 0.10f;
    private static final long REASSERT_COOLDOWN_MS = 260L;
    private static final long PANEL_WATCHDOG_MS = 700L;
    private static final long DIRECT_POWER_WATCHDOG_MS = 150L;

    private SensorManager sensorManager;
    private Sensor hingeSensor;
    private DisplayManager displayManager;
    private GlassOverlayController overlay;
    private SharedPreferences prefs;
    private PowerManager.WakeLock screenWakeLock;
    private DeviceStateController deviceState;
    private DisplayPowerController displayPower;
    private ExecutorService deviceStateExecutor;
    private ExecutorService displayPowerExecutor;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private volatile boolean manualMode = false;
    private volatile boolean transitionActive = false;
    private volatile boolean calibrationRunning = false;
    private volatile boolean directPowerInFlight = false;
    private volatile boolean powerCalibrationPaused = false;
    private volatile float lastAngle = -1f;

    private boolean keepingScreenOn = false;
    private boolean transitionStateForced = false;
    private boolean stateCommandInFlight = false;
    private boolean resetPending = false;
    private boolean calibrationAttempted = false;
    private int reassertFailures = 0;
    private int directPowerTick = 0;
    private long lastReassertAt = 0L;

    private int coverDisplayId = -1;
    private int outerLogicalId = -1;
    private int innerLogicalId = -1;
    private int closedStateId = -1;
    private int openStateId = -1;
    private int verifiedDualStateId = -1;
    private String verifiedDualStateName = "";

    @Override public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        coverDisplayId = prefs.getInt(KEY_COVER_DISPLAY_ID, -1);
        outerLogicalId = prefs.getInt(KEY_OUTER_LOGICAL_ID, -1);
        innerLogicalId = prefs.getInt(KEY_INNER_LOGICAL_ID, -1);
        closedStateId = prefs.getInt(KEY_CLOSED_STATE_ID, -1);
        openStateId = prefs.getInt(KEY_OPEN_STATE_ID, -1);
        verifiedDualStateId = prefs.getInt(KEY_VERIFIED_DUAL_STATE_ID, -1);
        verifiedDualStateName = prefs.getString(KEY_VERIFIED_DUAL_STATE_NAME, "");

        overlay = new GlassOverlayController(this);
        overlay.setHandoffDisplayHints(
                outerLogicalId >= 0 ? outerLogicalId : coverDisplayId,
                innerLogicalId);
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        hingeSensor = sensorManager.getDefaultSensor(Sensor.TYPE_HINGE_ANGLE);
        displayManager = getSystemService(DisplayManager.class);
        deviceState = new DeviceStateController();
        displayPower = new DisplayPowerController(deviceState);
        deviceStateExecutor = Executors.newSingleThreadExecutor();
        displayPowerExecutor = Executors.newSingleThreadExecutor();
        createScreenWakeLock();

        prefs.edit()
                .putBoolean(KEY_RUNNING, true)
                .putBoolean(KEY_KEEP_SCREEN_ON, false)
                .putBoolean(KEY_FORCED_TRANSITION, false)
                .putBoolean(KEY_DIRECT_POWER_OK, false)
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
        probeLogicalDisplaysAsync();
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
            powerCalibrationPaused = false;
            stopTransitionWatchdogs();
            resetDirectDisplayPowerAsync("手動預覽");
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
                    .putString(KEY_CALIBRATION_STATUS,
                            "v0.7 進階 concurrent state 校準；直接電源銜接會暫停，請保持半折")
                    .apply();
            if (isCalibrationAngle(lastAngle)) startCalibrationIfNeeded();
            return START_STICKY;
        }

        manualMode = false;
        calibrationAttempted = false;
        powerCalibrationPaused = false;
        prefs.edit().putBoolean(KEY_MANUAL, false).apply();
        probeDeviceStateAsync();
        probeLogicalDisplaysAsync();
        if (transitionActive) startTransitionWatchdogs();
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
        powerCalibrationPaused = false;
        reassertFailures = 0;
        stopTransitionWatchdogs();
        updateGlobalAwake(false);
        overlay.setKeepScreenOn(false);
        overlay.hide();
        prefs.edit().putFloat(KEY_LAST_LEVEL, 0f).apply();
        resetDirectDisplayPowerAsync("完全合起");
        resetForcedStateAsync("完全合起");
        captureEndpointStateAsync(true);
        captureLogicalEndpointAsync(true);

        mainHandler.removeCallbacks(captureCoverRunnable);
        mainHandler.postDelayed(captureCoverRunnable, 220);
    }

    private void enterOpenEndpoint() {
        transitionActive = false;
        calibrationAttempted = false;
        powerCalibrationPaused = false;
        reassertFailures = 0;
        stopTransitionWatchdogs();
        updateGlobalAwake(false);
        overlay.setKeepScreenOn(false);
        overlay.hide();
        prefs.edit().putFloat(KEY_LAST_LEVEL, 0f).apply();
        resetDirectDisplayPowerAsync("完全展開");
        resetForcedStateAsync("完全展開");
        captureEndpointStateAsync(false);
        captureLogicalEndpointAsync(false);
        updateDisplayDiagnostics();
    }

    private void enterTransition(float angle) {
        boolean wasTransition = transitionActive;
        transitionActive = true;
        updateGlobalAwake(true);

        overlay.setHandoffDisplayHints(
                outerLogicalId >= 0 ? outerLogicalId : coverDisplayId,
                innerLogicalId);
        overlay.setKeepScreenOn(true);
        float level = Math.max(MIN_TRANSITION_GLASS, AngleMapper.toGlassLevel(angle));
        prefs.edit().putFloat(KEY_LAST_LEVEL, level).apply();
        overlay.showLevel(level);

        if (!wasTransition) {
            startTransitionWatchdogs();
        }

        // v0.7 primary path: direct display power ON for both panels.
        forceDirectDisplayPowerAsync(true);

        // Secondary path: if a real concurrent DeviceState was previously
        // verified, keep it asserted too. We no longer auto-scan states while
        // the user is folding because that causes visible state churn.
        if (verifiedDualStateId >= 0) {
            ensureVerifiedDualStateAsync(false);
        }
        updateDisplayDiagnostics();
    }

    private void startTransitionWatchdogs() {
        mainHandler.removeCallbacks(directPowerWatchdogRunnable);
        mainHandler.removeCallbacks(panelWatchdogRunnable);
        if (!transitionActive || manualMode || calibrationRunning || powerCalibrationPaused) return;
        mainHandler.post(directPowerWatchdogRunnable);
        mainHandler.postDelayed(panelWatchdogRunnable, 250);
    }

    private void stopTransitionWatchdogs() {
        mainHandler.removeCallbacks(directPowerWatchdogRunnable);
        mainHandler.removeCallbacks(panelWatchdogRunnable);
    }

    private final Runnable captureCoverRunnable = () -> {
        if (transitionActive || manualMode || overlay == null) return;
        int id = overlay.captureCoverDisplayHint();
        if (id >= 0) {
            coverDisplayId = id;
            if (outerLogicalId < 0) outerLogicalId = id;
            prefs.edit()
                    .putInt(KEY_COVER_DISPLAY_ID, id)
                    .putInt(KEY_OUTER_LOGICAL_ID, outerLogicalId)
                    .apply();
        }
        updateDisplayDiagnostics();
    };

    private void captureEndpointStateAsync(boolean closed) {
        if (deviceStateExecutor == null) return;
        deviceStateExecutor.execute(() -> {
            sleepQuietly(240);
            int state = deviceState.getCurrentState();
            DeviceStateController.PanelSnapshot snapshot = deviceState.getPhysicalPanelSnapshot();
            writePhysicalSnapshot(snapshot);
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

    private void captureLogicalEndpointAsync(boolean closed) {
        if (displayPowerExecutor == null || displayPower == null) return;
        displayPowerExecutor.execute(() -> {
            sleepQuietly(260);
            List<DisplayPowerController.LogicalDisplayInfo> infos = displayPower.listInternalDisplays();
            int outer = outerLogicalId;
            int inner = innerLogicalId;
            if (closed && lastAngle <= CLOSED_ENDPOINT_MAX) {
                int active = displayPower.chooseActiveId(infos, true);
                if (active >= 0) outer = active;
            } else if (!closed && lastAngle >= OPEN_ENDPOINT_MIN) {
                int active = displayPower.chooseActiveId(infos, false);
                if (active >= 0) inner = active;
            }
            if (outer < 0) outer = displayPower.chooseOuterId(infos, inner);
            if (inner < 0) inner = displayPower.chooseInnerId(infos, outer);
            final int resolvedOuter = outer;
            final int resolvedInner = inner;
            final String summary = summarizeLogical(infos);
            mainHandler.post(() -> {
                outerLogicalId = resolvedOuter;
                innerLogicalId = resolvedInner;
                prefs.edit()
                        .putInt(KEY_OUTER_LOGICAL_ID, outerLogicalId)
                        .putInt(KEY_INNER_LOGICAL_ID, innerLogicalId)
                        .putString(KEY_LOGICAL_INTERNAL_SUMMARY, summary)
                        .apply();
                overlay.setHandoffDisplayHints(
                        outerLogicalId >= 0 ? outerLogicalId : coverDisplayId,
                        innerLogicalId);
                updateDisplayDiagnostics();
            });
        });
    }

    private void probeLogicalDisplaysAsync() {
        if (displayPowerExecutor == null || displayPower == null) return;
        displayPowerExecutor.execute(() -> {
            List<DisplayPowerController.LogicalDisplayInfo> infos = displayPower.listInternalDisplays();
            int outer = outerLogicalId;
            int inner = innerLogicalId;
            if (outer < 0) outer = displayPower.chooseOuterId(infos, inner);
            if (inner < 0) inner = displayPower.chooseInnerId(infos, outer);
            final int resolvedOuter = outer;
            final int resolvedInner = inner;
            final String summary = summarizeLogical(infos);
            mainHandler.post(() -> {
                outerLogicalId = resolvedOuter;
                innerLogicalId = resolvedInner;
                prefs.edit()
                        .putInt(KEY_OUTER_LOGICAL_ID, outerLogicalId)
                        .putInt(KEY_INNER_LOGICAL_ID, innerLogicalId)
                        .putString(KEY_LOGICAL_INTERNAL_SUMMARY, summary)
                        .apply();
                overlay.setHandoffDisplayHints(
                        outerLogicalId >= 0 ? outerLogicalId : coverDisplayId,
                        innerLogicalId);
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
            DeviceStateController.PanelSnapshot snapshot = deviceState.getPhysicalPanelSnapshot();
            writePhysicalSnapshot(snapshot);

            mainHandler.post(() -> prefs.edit()
                    .putBoolean(KEY_DEVICE_STATE_AVAILABLE, available)
                    .putInt(KEY_CURRENT_DEVICE_STATE, current)
                    .putString(KEY_SHIZUKU_STATUS,
                            shizukuGranted ? "Shizuku 已授權 ✓ · v0.7 可直接控制 display power"
                                    : shizukuRunning ? "Shizuku 已啟動，尚未授權"
                                    : "Shizuku 未啟動；v0.7 直接外螢幕電源控制需要它")
                    .putString(KEY_DEVICE_STATE_STATUS,
                            "支援 states：" + states)
                    .apply());
        });
    }

    private void forceDirectDisplayPowerAsync(boolean forceDiagnostics) {
        if (!transitionActive || manualMode || calibrationRunning || powerCalibrationPaused) return;
        if (displayPowerExecutor == null || displayPower == null || directPowerInFlight) return;

        if (!displayPower.isPrivilegedReady()) {
            prefs.edit()
                    .putBoolean(KEY_DIRECT_POWER_OK, false)
                    .putString(KEY_DIRECT_POWER_STATUS,
                            "直接面板 ON 尚未啟用：請先啟動 Shizuku 並按③授權")
                    .apply();
            return;
        }

        directPowerInFlight = true;
        final int tick = ++directPowerTick;
        displayPowerExecutor.execute(() -> {
            int outer = outerLogicalId;
            int inner = innerLogicalId;
            List<DisplayPowerController.LogicalDisplayInfo> infos = null;

            if (outer < 0 || inner < 0 || tick % 8 == 0) {
                infos = displayPower.listInternalDisplays();
                if (outer < 0) outer = displayPower.chooseOuterId(infos, inner);
                if (inner < 0) inner = displayPower.chooseInnerId(infos, outer);
            }

            final int resolvedOuter = outer;
            final int resolvedInner = inner;
            DisplayPowerController.PowerResult result =
                    displayPower.forceBothOn(resolvedOuter, resolvedInner);

            int onCount = -1;
            String logicalSummary = "";
            if (forceDiagnostics || tick % 5 == 0 || !result.ok) {
                if (infos == null) infos = displayPower.listInternalDisplays();
                onCount = displayPower.countOn(infos);
                logicalSummary = summarizeLogical(infos);
            }

            final int finalOnCount = onCount;
            final String finalLogicalSummary = logicalSummary;
            final DisplayPowerController.PowerResult finalResult = result;

            mainHandler.post(() -> {
                directPowerInFlight = false;
                if (resolvedOuter >= 0) outerLogicalId = resolvedOuter;
                if (resolvedInner >= 0) innerLogicalId = resolvedInner;

                SharedPreferences.Editor edit = prefs.edit()
                        .putInt(KEY_OUTER_LOGICAL_ID, outerLogicalId)
                        .putInt(KEY_INNER_LOGICAL_ID, innerLogicalId)
                        .putBoolean(KEY_DIRECT_POWER_OK, finalResult.ok)
                        .putString(KEY_DIRECT_POWER_STATUS,
                                (finalResult.ok ? "直接 Display Power ON ✓ · " : "直接 Display Power 失敗 · ")
                                        + finalResult.detail
                                        + (finalOnCount >= 0 ? " · logical ON=" + finalOnCount : ""));
                if (!finalLogicalSummary.isEmpty()) {
                    edit.putString(KEY_LOGICAL_INTERNAL_SUMMARY, finalLogicalSummary);
                }
                edit.apply();

                overlay.setHandoffDisplayHints(
                        outerLogicalId >= 0 ? outerLogicalId : coverDisplayId,
                        innerLogicalId);
                if (transitionActive && !manualMode) {
                    overlay.refreshDisplayBinding();
                    overlay.setKeepScreenOn(true);
                    overlay.showLevel(prefs.getFloat(KEY_LAST_LEVEL, MIN_TRANSITION_GLASS));
                }
            });
        });
    }

    private void resetDirectDisplayPowerAsync(String reason) {
        mainHandler.removeCallbacks(directPowerWatchdogRunnable);
        if (displayPowerExecutor == null || displayPower == null) return;
        if (!displayPower.isPrivilegedReady()) return;

        displayPowerExecutor.execute(() -> {
            if (transitionActive) return;
            displayPower.resetKnown(outerLogicalId, innerLogicalId);
            List<DisplayPowerController.LogicalDisplayInfo> infos = displayPower.listInternalDisplays();
            final String summary = summarizeLogical(infos);
            mainHandler.post(() -> prefs.edit()
                    .putBoolean(KEY_DIRECT_POWER_OK, false)
                    .putString(KEY_DIRECT_POWER_STATUS, reason + "：已 reset display power override")
                    .putString(KEY_LOGICAL_INTERNAL_SUMMARY, summary)
                    .apply());
        });
    }

    /**
     * Optional advanced calibration. v0.7 pauses direct power forcing first so a
     * candidate DeviceState cannot appear successful merely because the power
     * bridge itself has turned both panels ON.
     */
    private void startCalibrationIfNeeded() {
        if (calibrationRunning || calibrationAttempted || manualMode || !transitionActive) return;
        if (!isCalibrationAngle(lastAngle) || deviceStateExecutor == null) return;

        calibrationAttempted = true;
        calibrationRunning = true;
        powerCalibrationPaused = true;
        stopTransitionWatchdogs();
        prefs.edit().putString(KEY_CALIBRATION_STATUS,
                "v0.7 正在進階掃描 concurrent states；直接 power forcing 已暫停…").apply();

        deviceStateExecutor.execute(() -> {
            if (displayPower != null && displayPower.isPrivilegedReady()) {
                displayPower.resetKnown(outerLogicalId, innerLogicalId);
                sleepQuietly(140);
            }

            List<DeviceStateController.StateInfo> candidates =
                    deviceState.getTransitionCandidates(closedStateId, openStateId);
            StringBuilder attempts = new StringBuilder();
            DeviceStateController.StateInfo winner = null;
            DeviceStateController.CommandResult winnerResult = null;
            DeviceStateController.PanelSnapshot winnerSnapshot = null;

            for (DeviceStateController.StateInfo candidate : candidates) {
                if (!transitionActive || manualMode) break;
                DeviceStateController.CommandResult result = deviceState.requestState(candidate.id);
                if (attempts.length() > 0) attempts.append(" ; ");
                attempts.append(candidate.id).append(":").append(candidate.name)
                        .append(result.ok ? "=OK" : "=FAIL");
                if (!result.ok) continue;

                sleepQuietly(260);
                DeviceStateController.PanelSnapshot snapshot = deviceState.getPhysicalPanelSnapshot();
                writePhysicalSnapshot(snapshot);
                attempts.append("/phys=")
                        .append(snapshot.activeInternalPanels)
                        .append("/").append(snapshot.totalInternalPanels)
                        .append("@").append(snapshot.backend);

                if (snapshot.bothOn()) {
                    winner = candidate;
                    winnerResult = result;
                    winnerSnapshot = snapshot;
                    break;
                }

                deviceState.resetState();
                sleepQuietly(130);
            }

            final DeviceStateController.StateInfo found = winner;
            final DeviceStateController.CommandResult foundResult = winnerResult;
            final DeviceStateController.PanelSnapshot foundSnapshot = winnerSnapshot;
            final String attemptText = attempts.toString();

            if (found == null || !transitionActive || manualMode) {
                deviceState.resetState();
            }

            mainHandler.post(() -> {
                calibrationRunning = false;
                powerCalibrationPaused = false;
                stateCommandInFlight = false;

                if (found != null && foundSnapshot != null && transitionActive && !manualMode) {
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
                                    "進階 concurrent state 成功 ✓ state=" + found.id + ":" + found.name
                                            + " · " + foundSnapshot.summary
                                            + " · backend=" + (foundResult == null ? "?" : foundResult.backend))
                            .putString(KEY_DEVICE_STATE_STATUS, "v0.7 state 掃描：" + attemptText)
                            .apply();
                } else {
                    transitionStateForced = false;
                    prefs.edit()
                            .putBoolean(KEY_DUAL_VERIFIED, false)
                            .putBoolean(KEY_FORCED_TRANSITION, false)
                            .putString(KEY_CALIBRATION_STATUS,
                                    "未找到 concurrent state；v0.7 仍會使用直接 Display Power ON 作為主要銜接")
                            .putString(KEY_DEVICE_STATE_STATUS, "v0.7 state 掃描：" + attemptText)
                            .apply();
                }
                if (transitionActive && !manualMode) startTransitionWatchdogs();
                updateDisplayDiagnostics();
                if (resetPending || !transitionActive) resetForcedStateAsync("校準後離開過渡");
            });
        });
    }

    private void ensureVerifiedDualStateAsync(boolean forceReassert) {
        if (verifiedDualStateId < 0 || manualMode || !transitionActive) return;
        if (calibrationRunning || stateCommandInFlight || deviceStateExecutor == null) return;

        long now = SystemClock.elapsedRealtime();
        if (now - lastReassertAt < REASSERT_COOLDOWN_MS) return;
        lastReassertAt = now;
        stateCommandInFlight = true;
        final int target = verifiedDualStateId;

        deviceStateExecutor.execute(() -> {
            DeviceStateController.PanelSnapshot before = deviceState.getPhysicalPanelSnapshot();
            writePhysicalSnapshot(before);

            if (!forceReassert && transitionStateForced && before.bothOn()) {
                mainHandler.post(() -> {
                    stateCommandInFlight = false;
                    prefs.edit()
                            .putBoolean(KEY_FORCED_TRANSITION, true)
                            .putString(KEY_DEVICE_STATE_STATUS,
                                    "concurrent state 維持中 ✓ " + before.summary)
                            .apply();
                });
                return;
            }

            DeviceStateController.CommandResult first = deviceState.requestState(target);
            sleepQuietly(90);
            DeviceStateController.CommandResult second = first;
            if (transitionActive && !manualMode) second = deviceState.requestState(target);
            sleepQuietly(170);

            DeviceStateController.PanelSnapshot after = deviceState.getPhysicalPanelSnapshot();
            writePhysicalSnapshot(after);
            int current = deviceState.getCurrentState();
            final DeviceStateController.CommandResult finalResult = second.ok ? second : first;

            mainHandler.post(() -> {
                stateCommandInFlight = false;
                boolean success = finalResult.ok && after.bothOn() && transitionActive && !manualMode;
                transitionStateForced = success;

                if (success) {
                    reassertFailures = 0;
                    prefs.edit()
                            .putBoolean(KEY_FORCED_TRANSITION, true)
                            .putBoolean(KEY_DUAL_VERIFIED, true)
                            .putInt(KEY_CURRENT_DEVICE_STATE, current)
                            .putString(KEY_DEVICE_STATE_STATUS,
                                    "concurrent state ON ✓ state=" + target
                                            + " · " + after.summary
                                            + " · backend=" + finalResult.backend)
                            .apply();
                } else {
                    reassertFailures++;
                    prefs.edit()
                            .putBoolean(KEY_FORCED_TRANSITION, false)
                            .putInt(KEY_CURRENT_DEVICE_STATE, current)
                            .putString(KEY_DEVICE_STATE_STATUS,
                                    "concurrent state 重套失敗 #" + reassertFailures
                                            + " · " + after.summary
                                            + " · direct power 仍持續")
                            .apply();

                    if (reassertFailures >= 4) {
                        verifiedDualStateId = -1;
                        verifiedDualStateName = "";
                        transitionStateForced = false;
                        prefs.edit()
                                .putBoolean(KEY_DUAL_VERIFIED, false)
                                .putInt(KEY_VERIFIED_DUAL_STATE_ID, -1)
                                .putString(KEY_VERIFIED_DUAL_STATE_NAME, "")
                                .putString(KEY_CALIBRATION_STATUS,
                                        "concurrent state 已失效；direct Display Power ON 繼續工作，可手動按④重新掃描")
                                .apply();
                    }
                }
                updateDisplayDiagnostics();
                if (resetPending || !transitionActive) resetForcedStateAsync("離開過渡");
            });
        });
    }

    private final Runnable directPowerWatchdogRunnable = new Runnable() {
        @Override public void run() {
            if (!transitionActive || manualMode || calibrationRunning || powerCalibrationPaused) return;
            forceDirectDisplayPowerAsync(false);
            mainHandler.postDelayed(this, DIRECT_POWER_WATCHDOG_MS);
        }
    };

    private final Runnable panelWatchdogRunnable = new Runnable() {
        @Override public void run() {
            if (!transitionActive || manualMode || calibrationRunning) return;
            if (verifiedDualStateId >= 0) ensureVerifiedDualStateAsync(false);
            else probePhysicalPanelsAsync();
            mainHandler.postDelayed(this, PANEL_WATCHDOG_MS);
        }
    };

    private void probePhysicalPanelsAsync() {
        if (deviceStateExecutor == null || stateCommandInFlight || calibrationRunning) return;
        deviceStateExecutor.execute(() -> writePhysicalSnapshot(deviceState.getPhysicalPanelSnapshot()));
    }

    private void resetForcedStateAsync(String reason) {
        if (deviceStateExecutor == null) return;
        if (calibrationRunning || stateCommandInFlight) {
            resetPending = true;
            return;
        }
        resetPending = false;
        if (!transitionStateForced && !prefs.getBoolean(KEY_FORCED_TRANSITION, false)) return;

        stateCommandInFlight = true;
        deviceStateExecutor.execute(() -> {
            DeviceStateController.CommandResult result = deviceState.resetState();
            sleepQuietly(110);
            int current = deviceState.getCurrentState();
            DeviceStateController.PanelSnapshot snapshot = deviceState.getPhysicalPanelSnapshot();
            writePhysicalSnapshot(snapshot);
            mainHandler.post(() -> {
                stateCommandInFlight = false;
                transitionStateForced = false;
                prefs.edit()
                        .putBoolean(KEY_FORCED_TRANSITION, false)
                        .putInt(KEY_CURRENT_DEVICE_STATE, current)
                        .putString(KEY_DEVICE_STATE_STATUS,
                                result.ok
                                        ? reason + "：已解除 concurrent state，恢復 ColorOS"
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
        screenWakeLock = pm.newWakeLock(flags, getPackageName() + ":FindN6DirectPowerHandoff");
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

    private void writePhysicalSnapshot(DeviceStateController.PanelSnapshot snapshot) {
        if (snapshot == null || prefs == null) return;
        prefs.edit()
                .putInt(KEY_PHYSICAL_PANEL_COUNT, snapshot.totalInternalPanels)
                .putInt(KEY_PHYSICAL_ACTIVE_COUNT, snapshot.activeInternalPanels)
                .putString(KEY_PHYSICAL_PANEL_SUMMARY, snapshot.summary)
                .putString(KEY_PHYSICAL_PANEL_BACKEND, snapshot.backend)
                .apply();
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
        mainHandler.postDelayed(displayRefreshRunnable, 35);
    }

    private final Runnable displayRefreshRunnable = () -> {
        if (overlay == null) return;
        overlay.refreshDisplayBinding();
        if (transitionActive && !manualMode) {
            overlay.setHandoffDisplayHints(
                    outerLogicalId >= 0 ? outerLogicalId : coverDisplayId,
                    innerLogicalId);
            overlay.setKeepScreenOn(true);
            overlay.showLevel(prefs.getFloat(KEY_LAST_LEVEL, MIN_TRANSITION_GLASS));
            forceDirectDisplayPowerAsync(true);
            if (verifiedDualStateId >= 0) ensureVerifiedDualStateAsync(false);
        }
        updateDisplayDiagnostics();
    };

    @Override public void onDestroy() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        if (displayManager != null) displayManager.unregisterDisplayListener(this);
        mainHandler.removeCallbacks(displayRefreshRunnable);
        mainHandler.removeCallbacks(captureCoverRunnable);
        stopTransitionWatchdogs();

        transitionActive = false;
        manualMode = false;
        try {
            if (displayPower != null && displayPower.isPrivilegedReady()) {
                displayPower.resetKnown(outerLogicalId, innerLogicalId);
            }
        } catch (Exception ignored) {}
        try {
            if (deviceState != null) deviceState.resetState();
        } catch (Exception ignored) {}

        releaseWakeLock();
        if (overlay != null) {
            overlay.setKeepScreenOn(false);
            overlay.hide();
        }
        if (deviceStateExecutor != null) deviceStateExecutor.shutdownNow();
        if (displayPowerExecutor != null) displayPowerExecutor.shutdownNow();
        if (prefs != null) {
            prefs.edit()
                    .putBoolean(KEY_RUNNING, false)
                    .putBoolean(KEY_MANUAL, false)
                    .putBoolean(KEY_KEEP_SCREEN_ON, false)
                    .putBoolean(KEY_FORCED_TRANSITION, false)
                    .putBoolean(KEY_DIRECT_POWER_OK, false)
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
        channel.setDescription("Find N6 開合銜接：直接維持內外面板 ON 並在正面套霧化");
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
                .setContentTitle("NUBO Fold Glass v0.7")
                .setContentText("開合途中：直接要求外＋內螢幕 ON，正面霧化銜接")
                .setContentIntent(openPi)
                .addAction(new Notification.Action.Builder(
                        null, "停止", stopPi).build())
                .setOngoing(true)
                .build();
    }

    private static String summarizeLogical(List<DisplayPowerController.LogicalDisplayInfo> infos) {
        if (infos == null || infos.isEmpty()) return "logical INTERNAL: unavailable";
        StringBuilder out = new StringBuilder("logical INTERNAL: ");
        for (DisplayPowerController.LogicalDisplayInfo info : infos) {
            if (out.length() > 18) out.append(" | ");
            out.append(info.toString());
        }
        return out.toString();
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
