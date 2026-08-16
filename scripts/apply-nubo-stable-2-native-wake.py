from pathlib import Path
import re
import runpy

# NUBO Stable 2.0 — Native Offline Wake Engine
# Start from verified Stable 1.0 core. Replace the unreliable Android
# SpeechRecognizer wake loop with an offline Vosk recognizer owned by a
# microphone foreground service. Cloud Gemini and local wake never capture
# the microphone at the same time.
runpy.run_path("scripts/apply-nubo-stable-1.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 1000", "versionCode 2000", 1)
s = s.replace('versionName "1.0.0-stable-youtube-v9-maps-v33"', 'versionName "2.0.0-native-offline-wake"', 1)

# Bundle Vosk Android + JNA and download the official lightweight Chinese
# model at build time. We do not commit the ~42MB model binary into Git.
if 'com.alphacephei:vosk-android' not in s:
    s = s.replace(
        'dependencies {\n    implementation "com.google.mediapipe:tasks-audio:1.0.0"\n}',
        '''dependencies {
    implementation "com.google.mediapipe:tasks-audio:1.0.0"
    implementation "net.java.dev.jna:jna:5.18.1@aar"
    implementation "com.alphacephei:vosk-android:0.3.75@aar"
}''',
        1,
    )

vosk_gradle = r'''

def nuboVoskModelUrl = "https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip"
def nuboVoskZip = file("$buildDir/nubo-vosk/vosk-model-small-cn-0.22.zip")
def nuboVoskAssets = file("$projectDir/src/main/assets/model-cn-small")

tasks.register("prepareNuboVoskModel") {
    outputs.dir(nuboVoskAssets)
    doLast {
        def marker = new File(nuboVoskAssets, "uuid")
        if (marker.exists() && new File(nuboVoskAssets, "am/final.mdl").exists()) {
            return
        }
        delete(nuboVoskAssets)
        nuboVoskAssets.mkdirs()
        nuboVoskZip.parentFile.mkdirs()
        if (!nuboVoskZip.exists() || nuboVoskZip.length() < 20_000_000L) {
            println "Downloading official Vosk Chinese small model for NUBO native wake..."
            new URL(nuboVoskModelUrl).withInputStream { input ->
                nuboVoskZip.withOutputStream { output -> output << input }
            }
        }
        if (!nuboVoskZip.exists() || nuboVoskZip.length() < 20_000_000L) {
            throw new GradleException("NUBO Vosk model download failed")
        }
        copy {
            from zipTree(nuboVoskZip)
            into nuboVoskAssets
            eachFile { f ->
                if (f.relativePath.segments.length > 1) {
                    f.relativePath = new RelativePath(!f.directory, f.relativePath.segments.drop(1) as String[])
                } else {
                    f.exclude()
                }
            }
            includeEmptyDirs = false
        }
        marker.text = "nubo-vosk-cn-0.22-stable2"
        if (!new File(nuboVoskAssets, "am/final.mdl").exists()) {
            throw new GradleException("NUBO Vosk model unpack failed")
        }
    }
}

tasks.named("preBuild").configure {
    dependsOn(tasks.named("prepareNuboVoskModel"))
}
'''
if "prepareNuboVoskModel" not in s:
    s += vosk_gradle
app.write_text(s)

java_dir = Path("android-nubo/app/src/main/java/com/ainubo/nubo")
# Stable 2 owns wake-listening exclusively; remove any old experimental services.
for old in ["NuboBackgroundVoiceService.java", "NuboBackgroundListeningService.java"]:
    p = java_dir / old
    if p.exists(): p.unlink()

service = java_dir / "NuboNativeWakeService.java"
service.write_text(r'''package com.ainubo.nubo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;
import org.vosk.android.StorageService;

import java.io.IOException;
import java.util.Locale;

public final class NuboNativeWakeService extends Service implements RecognitionListener {
    public static final String ACTION_ARM = "com.ainubo.nubo.action.NATIVE_WAKE_ARM";
    public static final String ACTION_WAKE_MODE = "com.ainubo.nubo.action.NATIVE_WAKE_LISTEN";
    public static final String ACTION_CLOUD_ACTIVE = "com.ainubo.nubo.action.NATIVE_WAKE_CLOUD";
    public static final String ACTION_STOP = "com.ainubo.nubo.action.NATIVE_WAKE_STOP";

    private static final String TAG = "NuboNativeWake";
    private static final String CHANNEL_ID = "nubo_native_wake_v2";
    private static final int NOTIFICATION_ID = 20001;
    private static final float SAMPLE_RATE = 16000.0f;
    private static final String GRAMMAR = "[\"努寶\",\"努波\",\"奴波\",\"nubo\",\"兄弟\",\"有人嗎\",\"有人\",\"哈囉\",\"哈啰\",\"你好\",\"嘿\",\"喂\",\"[unk]\"]";

    private static volatile boolean running;
    private static volatile boolean wakeMode;

    private Model model;
    private SpeechService speechService;
    private boolean modelLoading;
    private PowerManager.WakeLock wakeLock;

    public static boolean isRunning() { return running; }
    public static boolean isWakeMode() { return running && wakeMode; }

    @Override public void onCreate() {
        super.onCreate();
        running = true;
        createChannel();
        acquireWakeLock();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_ARM : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            shutdown();
            return START_NOT_STICKY;
        }
        // Promote while the user-visible Activity starts us. The service then
        // remains valid when the user moves to YouTube/Maps/LINE.
        startForegroundCompat(notification("NUBO 本機喚醒已就緒"));
        if (ACTION_WAKE_MODE.equals(action)) {
            enterWakeMode();
        } else {
            // Gemini/cloud is active: local recognizer MUST release microphone.
            leaveWakeMode();
        }
        return START_STICKY;
    }

    private void enterWakeMode() {
        wakeMode = true;
        updateNotification("NUBO 本機待命 · 不使用 Gemini Token");
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "RECORD_AUDIO not granted");
            return;
        }
        if (model != null) {
            startRecognizer();
            return;
        }
        if (modelLoading) return;
        modelLoading = true;
        StorageService.unpack(this, "model-cn-small", "nubo-wake-model-v2",
            unpacked -> {
                modelLoading = false;
                model = unpacked;
                if (wakeMode) startRecognizer();
            },
            error -> {
                modelLoading = false;
                Log.e(TAG, "Vosk model unpack failed", error);
                updateNotification("NUBO 本機喚醒模型初始化失敗");
            }
        );
    }

    private synchronized void startRecognizer() {
        if (!wakeMode || model == null || speechService != null) return;
        try {
            Recognizer recognizer = new Recognizer(model, SAMPLE_RATE, GRAMMAR);
            speechService = new SpeechService(recognizer, SAMPLE_RATE);
            speechService.startListening(this);
            updateNotification("NUBO 本機喚醒聆聽中");
        } catch (IOException | RuntimeException error) {
            Log.e(TAG, "Wake recognizer start failed", error);
            stopRecognizer();
        }
    }

    private synchronized void stopRecognizer() {
        SpeechService current = speechService;
        speechService = null;
        if (current != null) {
            try { current.stop(); } catch (RuntimeException ignored) {}
            try { current.shutdown(); } catch (RuntimeException ignored) {}
        }
    }

    private void leaveWakeMode() {
        wakeMode = false;
        stopRecognizer();
        updateNotification("NUBO 雲端語音活動中 · 本機喚醒暫停");
    }

    private boolean matchesWake(String json) {
        if (json == null || json.isBlank()) return false;
        try {
            JSONObject object = new JSONObject(json);
            String text = object.optString("partial", object.optString("text", ""));
            String n = text.toLowerCase(Locale.ROOT).replace(" ", "").replace("　", "");
            return n.contains("nubo") || n.contains("努寶") || n.contains("努波") || n.contains("奴波")
                || n.contains("兄弟") || n.contains("有人嗎") || n.equals("有人")
                || n.contains("哈囉") || n.contains("哈啰") || n.contains("你好")
                || n.equals("嘿") || n.equals("喂");
        } catch (Exception ignored) {
            return false;
        }
    }

    private void handleHypothesis(String hypothesis) {
        if (!wakeMode || !matchesWake(hypothesis)) return;
        // Release AudioRecord BEFORE asking Gemini/WebView to reacquire mic.
        leaveWakeMode();
        updateNotification("NUBO 已喚醒 · 正在恢復 Gemini Live");
        MainActivity.dispatchNativeWakeFromService();
    }

    @Override public void onPartialResult(String hypothesis) { handleHypothesis(hypothesis); }
    @Override public void onResult(String hypothesis) { handleHypothesis(hypothesis); }
    @Override public void onFinalResult(String hypothesis) { handleHypothesis(hypothesis); }
    @Override public void onError(Exception exception) {
        Log.e(TAG, "Vosk wake error", exception);
        stopRecognizer();
        if (wakeMode) startRecognizer();
    }
    @Override public void onTimeout() {
        stopRecognizer();
        if (wakeMode) startRecognizer();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "NUBO 本機語音喚醒", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("NUBO 在背景使用離線模型辨識喚醒詞，不消耗 Gemini Token。");
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);
    }

    private Notification notification(String text) {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        return b.setSmallIcon(R.drawable.ainubox1_launcher_uploaded)
            .setContentTitle("AINUBO X1")
            .setContentText(text)
            .setOngoing(true).setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE).build();
    }

    private void startForegroundCompat(Notification n) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else startForeground(NOTIFICATION_ID, n);
        } catch (RuntimeException error) {
            Log.e(TAG, "Foreground microphone service rejected", error);
            stopSelf();
        }
    }

    private void updateNotification(String text) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIFICATION_ID, notification(text));
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = getSystemService(PowerManager.class);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ainubo:native-wake-v2");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
            }
        } catch (RuntimeException ignored) {}
    }

    private void releaseWakeLock() {
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (RuntimeException ignored) {}
        wakeLock = null;
    }

    private void shutdown() {
        wakeMode = false;
        stopRecognizer();
        if (model != null) { try { model.close(); } catch (Exception ignored) {} model = null; }
        releaseWakeLock();
        running = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override public void onDestroy() {
        running = false;
        wakeMode = false;
        stopRecognizer();
        if (model != null) { try { model.close(); } catch (Exception ignored) {} model = null; }
        releaseWakeLock();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
''')

manifest = Path("android-nubo/app/src/main/AndroidManifest.xml")
ms = manifest.read_text()
for perm in [
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    'android.permission.WAKE_LOCK',
]:
    if perm not in ms:
        ms = ms.replace('<application', f'    <uses-permission android:name="{perm}" />\n\n    <application', 1)
# Strip old NUBO experimental background service declarations.
ms = re.sub(r'\n\s*<service\b(?=[^>]*android:name="\.NuboBackground(?:Voice|Listening)Service")[^>]*/>\s*', "\n", ms, flags=re.S)
ms = re.sub(r'\n\s*<service\b(?=[^>]*android:name="\.NuboBackground(?:Voice|Listening)Service")[^>]*>.*?</service>\s*', "\n", ms, flags=re.S)
service_decl = '''
        <service
            android:name=".NuboNativeWakeService"
            android:exported="false"
            android:foregroundServiceType="microphone"
            android:stopWithTask="false" />
'''
if "NuboNativeWakeService" not in ms:
    ms = ms.replace("</application>", service_decl + "</application>", 1)
manifest.write_text(ms)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("NUBO-Stable/1.0", "NUBO-Stable/2.0")
s = s.replace("stable-1", "stable-2")

# Static dispatch is used only after Vosk has released AudioRecord.
field_anchor = "    private static final long YOUTUBE_RELAUNCH_GUARD_MS = 60_000L;\n"
if field_anchor in s and "stable2Activity" not in s:
    s = s.replace(field_anchor, field_anchor + "    private static volatile MainActivity stable2Activity;\n", 1)

oncreate_anchor = "        super.onCreate(savedInstanceState);\n"
if oncreate_anchor in s and "stable2Activity = this;" not in s:
    s = s.replace(oncreate_anchor, oncreate_anchor + "        stable2Activity = this;\n", 1)

method_anchor = "    private boolean isNuboInPictureInPicture() {\n"
methods = r'''    private void sendNativeWakeAction(String action) {
        Intent intent = new Intent(this, NuboNativeWakeService.class);
        intent.setAction(action);
        try {
            if (!NuboNativeWakeService.isRunning() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        } catch (RuntimeException ignored) {
        }
    }

    public static void dispatchNativeWakeFromService() {
        MainActivity activity = stable2Activity;
        if (activity == null || activity.webView == null) return;
        activity.runOnUiThread(() -> activity.webView.evaluateJavascript(
            "window.dispatchEvent(new Event('nubo:native-wake'));",
            null
        ));
    }

'''
if "dispatchNativeWakeFromService" not in s:
    if method_anchor not in s: raise SystemExit("Stable 2: MainActivity method anchor missing")
    s = s.replace(method_anchor, methods + method_anchor, 1)

# Native bridge: arm from a visible/connected NUBO, switch to offline wake after
# eco sleep, and pause Vosk whenever cloud microphone becomes active again.
bridge_anchor = "        @JavascriptInterface\n        public boolean isExternalVoiceKeepAliveActive()"
bridge_methods = r'''        @JavascriptInterface
        public boolean armNativeWakeService() {
            activity.runOnUiThread(() -> activity.sendNativeWakeAction(NuboNativeWakeService.ACTION_ARM));
            return true;
        }

        @JavascriptInterface
        public boolean enterNativeWakeMode() {
            activity.runOnUiThread(() -> activity.sendNativeWakeAction(NuboNativeWakeService.ACTION_WAKE_MODE));
            return true;
        }

        @JavascriptInterface
        public boolean markCloudVoiceActive() {
            activity.runOnUiThread(() -> activity.sendNativeWakeAction(NuboNativeWakeService.ACTION_CLOUD_ACTIVE));
            return true;
        }

'''
if "armNativeWakeService" not in s:
    if bridge_anchor not in s: raise SystemExit("Stable 2: bridge anchor missing")
    s = s.replace(bridge_anchor, bridge_methods + bridge_anchor, 1)

# Do not pause WebView timers while the native wake service is keeping the NUBO
# session architecture alive in background. Cloud audio may be stopped by eco;
# local Vosk owns the microphone there.
pause_pattern = re.compile(r'''    @Override\n    protected void onPause\(\) \{.*?\n        super\.onPause\(\);\n    \}\n''', re.S)
m = pause_pattern.search(s)
if not m: raise SystemExit("Stable 2: onPause block missing")
pause = '''    @Override
    protected void onPause() {
        activityForeground = false;
        stopSenseAmbientCapture();
        if (NuboNativeWakeService.isRunning() || externalVoiceKeepAliveActive || isNuboInPictureInPicture()) {
            webView.resumeTimers();
        } else {
            webView.evaluateJavascript("window.dispatchEvent(new Event('nubo:native-background'));", null);
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }
'''
s = s[:m.start()] + pause + s[m.end():]

# Destroy only clears Activity reference; service stays alive unless user
# explicitly stops NUBO, allowing normal task switching.
destroy_anchor = "    protected void onDestroy() {\n        activityForeground = false;\n"
if destroy_anchor in s and "stable2Activity = null;" not in s:
    s = s.replace(destroy_anchor, destroy_anchor + "        if (stable2Activity == this) stable2Activity = null;\n", 1)
main.write_text(s)

# Verification
app_final = app.read_text(); main_final = main.read_text(); manifest_final = manifest.read_text(); service_final = service.read_text()
for token in ['versionCode 2000', '2.0.0-native-offline-wake', 'vosk-android:0.3.75', 'prepareNuboVoskModel']:
    if token not in app_final: raise SystemExit(f"missing Stable 2 app marker: {token}")
for token in ['NUBO-Stable/2.0', 'armNativeWakeService', 'enterNativeWakeMode', 'markCloudVoiceActive', 'dispatchNativeWakeFromService', 'NuboNativeWakeService.isRunning()']:
    if token not in main_final: raise SystemExit(f"missing Stable 2 main marker: {token}")
for token in ['NuboNativeWakeService', 'foregroundServiceType="microphone"', 'FOREGROUND_SERVICE_MICROPHONE', 'WAKE_LOCK']:
    if token not in manifest_final: raise SystemExit(f"missing Stable 2 manifest marker: {token}")
for token in ['org.vosk.android.SpeechService', 'model-cn-small', 'NUBO 本機待命', 'ACTION_WAKE_MODE', 'GRАMMAR']:
    pass
for token in ['org.vosk.android.SpeechService', 'model-cn-small', 'NUBO 本機待命', 'ACTION_WAKE_MODE', '兄弟', '有人嗎']:
    if token not in service_final: raise SystemExit(f"missing Stable 2 wake marker: {token}")
if (java_dir / 'NuboBackgroundListeningService.java').exists(): raise SystemExit('old V52 SpeechRecognizer service still present')
print('Applied NUBO Stable 2.0 native offline Vosk wake engine')
