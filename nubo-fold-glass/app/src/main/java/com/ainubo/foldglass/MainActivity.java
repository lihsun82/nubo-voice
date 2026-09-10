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

public class MainActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView permissionStatus;
    private TextView sensorStatus;
    private TextView blurStatus;
    private TextView deviceStateStatus;
    private TextView liveStatus;
    private TextView manualLabel;
    private SharedPreferences prefs;

    private final Runnable refresher = new Runnable() {
        @Override public void run() {
            refreshStatus();
            handler.postDelayed(this, 500);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(FoldGlassService.PREFS, MODE_PRIVATE);
        setContentView(buildUi());
        requestNotificationsIfNeeded();
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.post(refresher);
    }

    @Override
    protected void onPause() {
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

        root.addView(label("NUBO LABS / OPPO FOLD DISPLAY", 12, Color.rgb(156,165,176)));
        TextView title = label("Fold Glass", 34, Color.WHITE);
        title.setPadding(0, dp(6), 0, dp(2));
        root.addView(title);
        TextView subtitle = label("Find N6 外螢幕半折鎖定＋霧透明 · v0.3", 15, Color.rgb(216,233,242));
        subtitle.setPadding(0, 0, 0, dp(20));
        root.addView(subtitle);

        permissionStatus = label("覆蓋權限：檢查中", 15, Color.WHITE);
        sensorStatus = label("鉸鏈感測器：檢查中", 15, Color.WHITE);
        blurStatus = label("系統 Blur Behind：檢查中", 15, Color.WHITE);
        deviceStateStatus = label("OPPO 螢幕狀態控制：檢查中", 14, Color.rgb(216,233,242));
        liveStatus = label("服務：尚未啟動", 15, Color.WHITE);
        root.addView(permissionStatus);
        root.addView(sensorStatus);
        root.addView(blurStatus);
        root.addView(deviceStateStatus);
        root.addView(liveStatus);

        Button permission = button("① 授權顯示在其他 App 上層");
        permission.setOnClickListener(v -> openOverlayPermission());
        root.addView(permission, buttonLp());

        Button start = button("② 啟動 OPPO 半折外螢幕霧化");
        start.setOnClickListener(v -> startAuto());
        root.addView(start, buttonLp());

        Button stop = button("停止並恢復 ColorOS 自動切換");
        stop.setOnClickListener(v -> stopGlass());
        root.addView(stop, buttonLp());

        TextView flow = label("目標流程", 20, Color.WHITE);
        flow.setPadding(0, dp(22), 0, dp(4));
        root.addView(flow);
        root.addView(label(
                "全合 0°：外螢幕正常 → 打開途中：外螢幕保持顯示並逐漸霧化 → 90°：最霧 → 全開 180°：恢復內螢幕正常。反方向合起來完全相同。",
                14, Color.rgb(216,233,242)));

        TextView test = label("手動霧化測試", 20, Color.WHITE);
        test.setPadding(0, dp(24), 0, dp(4));
        root.addView(test);
        root.addView(label("這個滑桿只測霧化，不會強制切換內/外螢幕。", 14, Color.rgb(156,165,176)));

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

        Button auto = button("回到自動折疊模式");
        auto.setOnClickListener(v -> startAuto());
        root.addView(auto, buttonLp());

        TextView note = label(
                "第一次使用建議先把手機完整合起來，再啟動功能，讓 v0.3 記住 Find N6 的『外螢幕 Device State ID』。之後打開或合起的中間角度會暫時鎖定該狀態；到 0° 或 180° 即解除。若上方顯示『一般 App 權限不足』，下一步需加入 Shizuku 模式。",
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

    private void stopGlass() {
        stopService(new Intent(this, FoldGlassService.class));
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
        int closedState = prefs.getInt(FoldGlassService.KEY_CLOSED_STATE_ID, -1);
        int currentState = prefs.getInt(FoldGlassService.KEY_CURRENT_DEVICE_STATE, -1);
        String ds = prefs.getString(FoldGlassService.KEY_DEVICE_STATE_STATUS, "檢查中");
        deviceStateStatus.setText("OPPO 螢幕狀態控制："
                + (deviceControl ? "可用 ✓" : "尚未確認/不可用")
                + " · 外螢幕 ID=" + (closedState >= 0 ? closedState : "--")
                + " · 目前 ID=" + (currentState >= 0 ? currentState : "--")
                + "\n" + ds);

        boolean running = prefs.getBoolean(FoldGlassService.KEY_RUNNING, false);
        boolean manual = prefs.getBoolean(FoldGlassService.KEY_MANUAL, false);
        boolean keepScreenOn = prefs.getBoolean(FoldGlassService.KEY_KEEP_SCREEN_ON, false);
        boolean forcedCover = prefs.getBoolean(FoldGlassService.KEY_FORCED_COVER, false);
        float angle = prefs.getFloat(FoldGlassService.KEY_LAST_ANGLE, -1f);
        float level = prefs.getFloat(FoldGlassService.KEY_LAST_LEVEL, 0f);
        String angleText = angle < 0f ? "--" : String.format(Locale.TAIWAN, "%.1f°", angle);
        liveStatus.setText("服務：" + (running ? "運作中" : "停止")
                + " · " + (manual ? "手動" : "自動")
                + " · 角度 " + angleText
                + " · 霧化 " + Math.round(level * 100f) + "%"
                + " · 外螢幕鎖定 " + (forcedCover ? "ON" : "OFF")
                + " · 亮屏 " + (keepScreenOn ? "ON" : "OFF"));
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
