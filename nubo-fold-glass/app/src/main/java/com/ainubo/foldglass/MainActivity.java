package com.ainubo.foldglass;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import java.util.Locale;

import rikka.shizuku.Shizuku;

public class MainActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView permissionStatus;
    private TextView sensorStatus;
    private TextView blurStatus;
    private TextView deviceStateStatus;
    private TextView displayStatus;
    private TextView liveStatus;
    private TextView manualLabel;
    private SharedPreferences prefs;

    private final Runnable refresher = new Runnable() {
        @Override public void run() {
            refreshStatus();
            handler.postDelayed(this, 450);
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(FoldGlassService.PREFS, MODE_PRIVATE);
        setContentView(buildUi());
        requestNotificationsIfNeeded();
    }

    @Override protected void onResume() {
        super.onResume();
        handler.post(refresher);
    }

    @Override protected void onPause() {
        handler.removeCallbacks(refresher);
        super.onPause();
    }

    private ScrollView buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(8, 9, 11));
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(22), dp(24), dp(22), dp(40));
        scroll.addView(root);

        root.addView(label("NUBO LABS / FIND N6 DUAL-PANEL LOCK", 12, Color.rgb(156,165,176)));
        TextView title = label("Fold Glass", 34, Color.WHITE);
        title.setPadding(0, dp(6), 0, dp(2));
        root.addView(title);
        TextView subtitle = label("OPPO Find N6 半折兩面都亮修正版 · v0.5", 15, Color.rgb(216,233,242));
        subtitle.setPadding(0, 0, 0, dp(20));
        root.addView(subtitle);

        permissionStatus = label("覆蓋權限：檢查中", 15, Color.WHITE);
        sensorStatus = label("鉸鏈感測器：檢查中", 15, Color.WHITE);
        blurStatus = label("系統 Blur Behind：檢查中", 15, Color.WHITE);
        deviceStateStatus = label("雙螢幕鎖定：檢查中", 14, Color.rgb(216,233,242));
        displayStatus = label("內建螢幕：檢查中", 14, Color.rgb(216,233,242));
        liveStatus = label("服務：尚未啟動", 15, Color.WHITE);
        root.addView(permissionStatus);
        root.addView(sensorStatus);
        root.addView(blurStatus);
        root.addView(deviceStateStatus);
        root.addView(displayStatus);
        root.addView(liveStatus);

        Button permission = button("① 授權顯示在其他 App 上層");
        permission.setOnClickListener(v -> openOverlayPermission());
        root.addView(permission, buttonLp());

        Button start = button("② 啟動：半折內外螢幕都亮＋外螢幕霧化");
        start.setOnClickListener(v -> startAuto());
        root.addView(start, buttonLp());

        Button shizuku = button("③ 授權 Shizuku（OPPO 限制時需要）");
        shizuku.setOnClickListener(v -> requestShizuku());
        root.addView(shizuku, buttonLp());

        Button recalibrate = button("④ 半折時重新搜尋真正雙螢幕 state");
        recalibrate.setOnClickListener(v -> recalibrate());
        root.addView(recalibrate, buttonLp());

        Button stop = button("停止並完全恢復 ColorOS 原生折疊");
        stop.setOnClickListener(v -> stopGlass());
        root.addView(stop, buttonLp());

        TextView flow = label("v0.5 正確折疊模式", 20, Color.WHITE);
        flow.setPadding(0, dp(22), 0, dp(4));
        root.addView(flow);
        root.addView(label(
                "完全合起 ≈0°：外螢幕正常，內側大螢幕關閉。\n"
                        + "只要離開完全閉合：外螢幕＋內側大螢幕都必須維持 ON。\n"
                        + "半折：約 90° 外螢幕霧化最強，但兩面都持續顯示。\n"
                        + "完全展開 ≈180°：解除雙螢幕鎖定，回到 ColorOS 正常內螢幕。\n"
                        + "往回合也是同一邏輯；只有真正合到底才允許內螢幕關閉。",
                14, Color.rgb(216,233,242)));

        TextView test = label("手動霧化測試", 20, Color.WHITE);
        test.setPadding(0, dp(24), 0, dp(4));
        root.addView(test);
        root.addView(label("滑桿只測霧化外觀，不會切換 Device State。", 14, Color.rgb(156,165,176)));

        manualLabel = label("霧化強度 0%", 14, Color.rgb(216,233,242));
        manualLabel.setPadding(0, dp(10), 0, 0);
        root.addView(manualLabel);

        SeekBar seek = new SeekBar(this);
        seek.setMax(100);
        root.addView(seek, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                manualLabel.setText("霧化強度 " + progress + "%");
                if (fromUser) preview(progress / 100f);
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });

        Button auto = button("回到自動雙螢幕折疊模式");
        auto.setOnClickListener(v -> startAuto());
        root.addView(auto, buttonLp());

        TextView note = label(
                "第一次安裝 v0.5：先完整合起手機 → 按②啟動 → 慢慢打開並停在約 90°。"
                        + "v0.5 會逐一測試 OPPO 回報的非端點 Device State，只有『內建螢幕 active=2』才會記為成功。"
                        + "成功後會顯示『雙螢幕驗證成功 ✓』，之後每次半折直接鎖定；若 ColorOS 又把正面切暗會自動重套。"
                        + "若校準全部 cmdFAIL，先啟動 Shizuku、按③授權，再於半折狀態按④。",
                13, Color.rgb(156,165,176));
        note.setPadding(0, dp(18), 0, 0);
        root.addView(note);
        return scroll;
    }

    private void openOverlayPermission() {
        startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getPackageName())));
    }

    private void startAuto() {
        if (!Settings.canDrawOverlays(this)) {
            openOverlayPermission();
            return;
        }
        startForegroundService(new Intent(this, FoldGlassService.class)
                .setAction(FoldGlassService.ACTION_START_AUTO));
    }

    private void preview(float level) {
        if (!Settings.canDrawOverlays(this)) return;
        startForegroundService(new Intent(this, FoldGlassService.class)
                .setAction(FoldGlassService.ACTION_PREVIEW)
                .putExtra(FoldGlassService.EXTRA_LEVEL, level));
    }

    private void recalibrate() {
        if (!Settings.canDrawOverlays(this)) {
            openOverlayPermission();
            return;
        }
        startForegroundService(new Intent(this, FoldGlassService.class)
                .setAction(FoldGlassService.ACTION_RECALIBRATE));
    }

    private void stopGlass() {
        stopService(new Intent(this, FoldGlassService.class));
    }

    private void requestShizuku() {
        try {
            if (!Shizuku.pingBinder()) {
                deviceStateStatus.setText("Shizuku：尚未啟動。請先在 Shizuku App 以無線偵錯啟動服務。");
                return;
            }
            if (Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED) {
                deviceStateStatus.setText("Shizuku：已授權 ✓。請在半折狀態按④重新校準。");
                return;
            }
            Shizuku.requestPermission(6107);
        } catch (Throwable e) {
            deviceStateStatus.setText("Shizuku 授權失敗：" + e.getClass().getSimpleName());
        }
    }

    private void refreshStatus() {
        boolean canOverlay = Settings.canDrawOverlays(this);
        permissionStatus.setText("覆蓋權限：" + (canOverlay ? "已授權 ✓" : "尚未授權"));

        SensorManager sm = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        Sensor hinge = sm.getDefaultSensor(Sensor.TYPE_HINGE_ANGLE);
        sensorStatus.setText(hinge == null
                ? "鉸鏈感測器：未找到 TYPE_HINGE_ANGLE ⚠"
                : "鉸鏈感測器：" + hinge.getName() + " ✓");

        boolean blur = new GlassOverlayController(this).isBlurAvailable();
        blurStatus.setText("系統 Blur Behind：" + (blur ? "可用 ✓" : "目前停用 / 不支援"));

        boolean deviceControl = prefs.getBoolean(FoldGlassService.KEY_DEVICE_STATE_AVAILABLE, false);
        boolean verified = prefs.getBoolean(FoldGlassService.KEY_DUAL_VERIFIED, false);
        int dualState = prefs.getInt(FoldGlassService.KEY_VERIFIED_DUAL_STATE_ID, -1);
        String dualName = prefs.getString(FoldGlassService.KEY_VERIFIED_DUAL_STATE_NAME, "");
        int currentState = prefs.getInt(FoldGlassService.KEY_CURRENT_DEVICE_STATE, -1);
        int closedState = prefs.getInt(FoldGlassService.KEY_CLOSED_STATE_ID, -1);
        int openState = prefs.getInt(FoldGlassService.KEY_OPEN_STATE_ID, -1);
        String ds = prefs.getString(FoldGlassService.KEY_DEVICE_STATE_STATUS, "檢查中");
        String shizuku = prefs.getString(FoldGlassService.KEY_SHIZUKU_STATUS, "");
        String calibration = prefs.getString(FoldGlassService.KEY_CALIBRATION_STATUS, "尚未校準");
        deviceStateStatus.setText("雙螢幕鎖定："
                + (verified ? "已驗證 ✓" : "尚未驗證")
                + " · state=" + (dualState >= 0 ? dualState + ":" + dualName : "--")
                + " · current=" + (currentState >= 0 ? currentState : "--")
                + " · closed/open=" + closedState + "/" + openState
                + "\n" + (deviceControl ? "device_state 可讀取" : "device_state 受限制")
                + " · " + shizuku
                + "\n" + calibration
                + "\n" + ds);

        int visible = prefs.getInt(FoldGlassService.KEY_DISPLAY_COUNT, 0);
        int builtIn = prefs.getInt(FoldGlassService.KEY_BUILTIN_DISPLAY_COUNT, 0);
        int activeBuiltIn = prefs.getInt(FoldGlassService.KEY_ACTIVE_BUILTIN_COUNT, 0);
        int cover = prefs.getInt(FoldGlassService.KEY_COVER_DISPLAY_ID, -1);
        int inner = prefs.getInt(FoldGlassService.KEY_INNER_DISPLAY_ID, -1);
        String summary = prefs.getString(FoldGlassService.KEY_DISPLAY_SUMMARY, "--");
        displayStatus.setText("內建螢幕：active " + activeBuiltIn + "/" + builtIn
                + " · 可見=" + visible
                + " · 外=" + (cover >= 0 ? cover : "--")
                + " · 內=" + (inner >= 0 ? inner : "--")
                + "\n" + summary);

        boolean running = prefs.getBoolean(FoldGlassService.KEY_RUNNING, false);
        boolean manual = prefs.getBoolean(FoldGlassService.KEY_MANUAL, false);
        boolean keepScreenOn = prefs.getBoolean(FoldGlassService.KEY_KEEP_SCREEN_ON, false);
        boolean forcedTransition = prefs.getBoolean(FoldGlassService.KEY_FORCED_TRANSITION, false);
        float angle = prefs.getFloat(FoldGlassService.KEY_LAST_ANGLE, -1f);
        float level = prefs.getFloat(FoldGlassService.KEY_LAST_LEVEL, 0f);
        String angleText = angle < 0f ? "--" : String.format(Locale.TAIWAN, "%.1f°", angle);
        liveStatus.setText("服務：" + (running ? "運作中" : "停止")
                + " · " + (manual ? "手動" : "自動")
                + " · 角度 " + angleText
                + " · 外霧化 " + Math.round(level * 100f) + "%"
                + " · 雙螢幕鎖定 " + (forcedTransition ? "ON" : "OFF")
                + " · 全域亮屏 " + (keepScreenOn ? "ON" : "OFF"));
    }

    private void requestNotificationsIfNeeded() {
        if (android.os.Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 6106);
        }
    }

    private TextView label(String text, int sp, int color) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setLineSpacing(0f, 1.15f);
        view.setPadding(0, dp(6), 0, dp(6));
        return view;
    }

    private Button button(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        return b;
    }

    private LinearLayout.LayoutParams buttonLp() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(10);
        return lp;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
