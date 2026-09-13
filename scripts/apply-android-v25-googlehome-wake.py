from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"V25 missing anchor: {label}")
    return text.replace(old, new, 1)


ROOT = Path("android-nubo")

# ---------------------------------------------------------------------------
# Google Home build wiring restored from the last validated V29 architecture.
# ---------------------------------------------------------------------------
root_gradle = ROOT / "build.gradle"
s = root_gradle.read_text()
if 'id "org.jetbrains.kotlin.android"' not in s:
    s = replace_once(
        s,
        '    id "com.android.application" version "8.10.1" apply false\n',
        '    id "com.android.application" version "8.10.1" apply false\n'
        '    id "org.jetbrains.kotlin.android" version "2.2.21" apply false\n',
        "root Kotlin plugin",
    )
root_gradle.write_text(s)

app_gradle = ROOT / "app/build.gradle"
s = app_gradle.read_text()
if 'id "org.jetbrains.kotlin.android"' not in s:
    s = replace_once(
        s,
        'plugins {\n    id "com.android.application"\n}\n',
        'plugins {\n    id "com.android.application"\n    id "org.jetbrains.kotlin.android"\n}\n\n'
        'def googleHomeEnabled = providers.gradleProperty("nuboGoogleHome").orNull == "true"\n',
        "app Kotlin plugin",
    )

s = s.replace('        minSdk 26\n', '        minSdk googleHomeEnabled ? 29 : 26\n', 1)
s = s.replace('        versionCode 24\n', '        versionCode 25\n', 1)
s = s.replace('        versionName "0.24.0"\n', '        versionName "0.25.0-googlehome-wake-silent"\n', 1)

if 'buildConfigField "boolean", "GOOGLE_HOME_ENABLED"' not in s:
    s = replace_once(
        s,
        '        versionName "0.25.0-googlehome-wake-silent"\n',
        '        versionName "0.25.0-googlehome-wake-silent"\n'
        '        buildConfigField "boolean", "GOOGLE_HOME_ENABLED", googleHomeEnabled.toString()\n',
        "Google Home BuildConfig flag",
    )

if 'java.srcDir "src/googleHome/java"' not in s:
    s = replace_once(
        s,
        '    compileOptions {\n',
        '    sourceSets {\n'
        '        main {\n'
        '            if (googleHomeEnabled) {\n'
        '                java.srcDir "src/googleHome/java"\n'
        '            }\n'
        '        }\n'
        '    }\n\n'
        '    compileOptions {\n',
        "Google Home source set",
    )

if 'kotlinOptions {' not in s:
    s = replace_once(
        s,
        '    compileOptions {\n'
        '        sourceCompatibility JavaVersion.VERSION_17\n'
        '        targetCompatibility JavaVersion.VERSION_17\n'
        '    }\n',
        '    compileOptions {\n'
        '        sourceCompatibility JavaVersion.VERSION_17\n'
        '        targetCompatibility JavaVersion.VERSION_17\n'
        '    }\n\n'
        '    kotlinOptions {\n'
        '        jvmTarget = "17"\n'
        '    }\n',
        "Kotlin jvmTarget",
    )

old_deps = 'dependencies {\n    implementation "com.google.mediapipe:tasks-audio:1.0.0"\n}\n'
new_deps = '''dependencies {
    implementation "androidx.activity:activity:1.10.1"
    implementation "com.google.mediapipe:tasks-audio:1.0.0"
    implementation "net.java.dev.jna:jna:5.18.1@aar"
    implementation "com.alphacephei:vosk-android:0.3.75@aar"

    if (googleHomeEnabled) {
        implementation "com.google.android.gms:play-services-home:17.1.0"
        implementation "com.google.android.gms:play-services-home-types:17.1.0"
        implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2"
    }
}
'''
if old_deps in s:
    s = s.replace(old_deps, new_deps, 1)
for token in [
    'versionCode 25',
    '0.25.0-googlehome-wake-silent',
    'GOOGLE_HOME_ENABLED',
    'src/googleHome/java',
    'play-services-home:17.1.0',
    'vosk-android:0.3.75@aar',
]:
    if token not in s:
        raise SystemExit(f"V25 Gradle wiring missing: {token}")
app_gradle.write_text(s)

# ---------------------------------------------------------------------------
# Foreground microphone service permissions. Notification channel is silent.
# ---------------------------------------------------------------------------
manifest = ROOT / "app/src/main/AndroidManifest.xml"
s = manifest.read_text()
permission_anchor = '    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />\n'
permissions = (
    permission_anchor
    + '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n'
    + '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />\n'
    + '    <uses-permission android:name="android.permission.WAKE_LOCK" />\n'
    + '    <uses-permission android:name="android.permission.REORDER_TASKS" />\n'
)
if 'android.permission.FOREGROUND_SERVICE_MICROPHONE' not in s:
    s = replace_once(s, permission_anchor, permissions, "wake permissions")

service_anchor = '        <service\n            android:name=".NuboYouTubeAccessibilityService"'
wake_service = '''        <service
            android:name=".NuboNativeWakeService"
            android:exported="false"
            android:foregroundServiceType="microphone" />

        <service
            android:name=".NuboYouTubeAccessibilityService"'''
if '.NuboNativeWakeService' not in s:
    s = replace_once(s, service_anchor, wake_service, "wake service declaration")
manifest.write_text(s)

# ---------------------------------------------------------------------------
# Beep-free local wake service: one 16 kHz AudioRecord feeds both Vosk and
# existing NUBO Sense. No Android SpeechRecognizer and no synthetic tone.
# ---------------------------------------------------------------------------
service = ROOT / "app/src/main/java/com/ainubo/nubo/NuboNativeWakeService.java"
service.write_text(r'''package com.ainubo.nubo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.StorageService;

import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class NuboNativeWakeService extends Service {
    public static final String ACTION_ARM = "com.ainubo.nubo.action.NATIVE_WAKE_ARM";
    public static final String ACTION_WAKE_MODE = "com.ainubo.nubo.action.NATIVE_WAKE_LISTEN";
    public static final String ACTION_CLOUD_ACTIVE = "com.ainubo.nubo.action.NATIVE_WAKE_CLOUD";
    public static final String ACTION_STOP = "com.ainubo.nubo.action.NATIVE_WAKE_STOP";

    private static final String TAG = "NuboNativeWakeV25";
    private static final String CHANNEL_ID = "nubo_native_wake_v25";
    private static final int NOTIFICATION_ID = 25001;
    private static final int SAMPLE_RATE = 16_000;
    private static final int SENSE_WINDOW_BYTES = SAMPLE_RATE * 2;
    private static final String GRAMMAR =
        "[\"努寶\",\"努波\",\"奴波\",\"嗨努寶\",\"嘿努寶\",\"兄弟\",\"有人嗎\",\"哈囉\",\"哈啰\",\"你好\",\"[unk]\"]";

    private static volatile boolean running;
    private static volatile boolean wakeMode;
    private static volatile boolean micActive;
    private static volatile boolean modelReady;
    private static volatile long lastAudioAt;
    private static volatile String lastHypothesis = "";
    private static volatile String lastFailure = "";

    private final AtomicBoolean captureRunning = new AtomicBoolean(false);
    private final ExecutorService audioExecutor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Model model;
    private Recognizer recognizer;
    private AudioRecord audioRecord;
    private boolean modelLoading;
    private PowerManager.WakeLock wakeLock;
    private NuboSenseAudioDetector senseDetector;

    public static boolean isRunning() { return running; }
    public static boolean isWakeMode() { return running && wakeMode; }
    public static boolean isMicActive() { return running && micActive; }

    public static String diagnosticJson() {
        try {
            JSONObject o = new JSONObject();
            o.put("running", running);
            o.put("wakeMode", wakeMode);
            o.put("micActive", micActive);
            o.put("modelReady", modelReady);
            o.put("lastAudioAgeMs", lastAudioAt == 0 ? -1 : SystemClock.elapsedRealtime() - lastAudioAt);
            o.put("lastHypothesis", lastHypothesis);
            o.put("lastFailure", lastFailure);
            return o.toString();
        } catch (Exception ignored) {
            return "{}";
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        createChannel();
        acquireWakeLock();
        senseDetector = new NuboSenseAudioDetector(
            this,
            new NuboSenseAudioDetector.Listener() {
                @Override
                public void onSenseEvent(NuboSenseAudioDetector.SenseEvent event) {
                    MainActivity.dispatchSenseEventFromNativeWake(event);
                }

                @Override
                public void onSenseError(String message) {
                    Log.w(TAG, "Sense via wake stream: " + message);
                }
            }
        );
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_ARM : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            shutdown();
            return START_NOT_STICKY;
        }

        if (!startForegroundCompat(notification("NUBO 本機語音核心已就緒"))) {
            return START_NOT_STICKY;
        }

        if (ACTION_WAKE_MODE.equals(action)) {
            enterWakeMode();
        } else {
            leaveWakeMode();
        }
        return START_STICKY;
    }

    private void enterWakeMode() {
        wakeMode = true;
        lastFailure = "";
        updateNotification("NUBO 本機喚醒待命中");
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            fail("RECORD_AUDIO permission missing");
            return;
        }

        if (model != null) {
            modelReady = true;
            startCapture();
            return;
        }
        if (modelLoading) return;

        modelLoading = true;
        StorageService.unpack(
            this,
            "model-cn-small",
            "nubo-wake-model-v25",
            unpacked -> {
                modelLoading = false;
                model = unpacked;
                modelReady = true;
                if (wakeMode) startCapture();
            },
            error -> {
                modelLoading = false;
                modelReady = false;
                fail("Vosk model unpack failed: " + error.getClass().getSimpleName());
            }
        );
    }

    private synchronized void startCapture() {
        if (!wakeMode || model == null || captureRunning.get()) return;
        stopCapture();

        int min = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        int bufferSize = Math.max(min > 0 ? min * 4 : 8192, 8192);

        try {
            recognizer = new Recognizer(model, SAMPLE_RATE, GRAMMAR);
            AudioRecord record = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize
            );
            if (record.getState() != AudioRecord.STATE_INITIALIZED) {
                record.release();
                fail("AudioRecord initialization failed");
                scheduleRestart();
                return;
            }
            audioRecord = record;
            captureRunning.set(true);
            audioExecutor.execute(() -> captureLoop(record, bufferSize));
        } catch (Throwable error) {
            fail("AudioRecord start failed: " + error.getClass().getSimpleName());
            stopCapture();
            scheduleRestart();
        }
    }

    private void captureLoop(AudioRecord record, int bufferSize) {
        byte[] buffer = new byte[bufferSize];
        byte[] senseWindow = new byte[SENSE_WINDOW_BYTES];
        int senseOffset = 0;
        try {
            record.startRecording();
            if (record.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                fail("Microphone did not enter RECORDING state");
                return;
            }

            micActive = true;
            lastAudioAt = SystemClock.elapsedRealtime();
            updateNotification("NUBO 本機喚醒聆聽中");

            while (wakeMode && captureRunning.get() && audioRecord == record) {
                int read = record.read(buffer, 0, buffer.length, AudioRecord.READ_BLOCKING);
                if (read > 0) {
                    lastAudioAt = SystemClock.elapsedRealtime();
                    Recognizer currentRecognizer = recognizer;
                    if (currentRecognizer != null) {
                        boolean endpoint = currentRecognizer.acceptWaveForm(buffer, read);
                        String json = endpoint
                            ? currentRecognizer.getResult()
                            : currentRecognizer.getPartialResult();
                        handleHypothesis(json);
                    }

                    int cursor = 0;
                    while (cursor < read && wakeMode) {
                        int copy = Math.min(read - cursor, senseWindow.length - senseOffset);
                        System.arraycopy(buffer, cursor, senseWindow, senseOffset, copy);
                        cursor += copy;
                        senseOffset += copy;
                        if (senseOffset == senseWindow.length) {
                            if (senseDetector != null) {
                                senseDetector.classifyPcm16(senseWindow);
                            }
                            senseOffset = 0;
                        }
                    }
                } else if (read < 0) {
                    fail("AudioRecord read error " + read);
                    break;
                }
            }
        } catch (Throwable error) {
            fail("Capture loop failed: " + error.getClass().getSimpleName());
        } finally {
            micActive = false;
            captureRunning.set(false);
            try {
                if (record.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) record.stop();
            } catch (Throwable ignored) {}
            try { record.release(); } catch (Throwable ignored) {}
            synchronized (this) {
                if (audioRecord == record) audioRecord = null;
            }
            if (wakeMode) scheduleRestart();
        }
    }

    private boolean matchesWake(String json) {
        if (json == null || json.isBlank()) return false;
        try {
            JSONObject object = new JSONObject(json);
            String text = object.optString("partial", object.optString("text", ""));
            String normalized = text
                .toLowerCase(Locale.ROOT)
                .replace(" ", "")
                .replace("　", "");
            lastHypothesis = text;
            return normalized.contains("努寶")
                || normalized.contains("努波")
                || normalized.contains("奴波")
                || normalized.contains("兄弟")
                || normalized.contains("有人嗎")
                || normalized.contains("哈囉")
                || normalized.contains("哈啰")
                || normalized.contains("你好");
        } catch (Exception ignored) {
            return false;
        }
    }

    private void handleHypothesis(String json) {
        if (!wakeMode || !matchesWake(json)) return;
        wakeMode = false;
        stopCapture();
        updateNotification("NUBO 已聽到喚醒詞");
        mainHandler.postDelayed(
            () -> MainActivity.dispatchNativeWakeFromService(getApplicationContext()),
            120L
        );
    }

    private synchronized void stopCapture() {
        captureRunning.set(false);
        micActive = false;
        AudioRecord record = audioRecord;
        audioRecord = null;
        if (record != null) {
            try {
                if (record.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) record.stop();
            } catch (Throwable ignored) {}
        }
        Recognizer current = recognizer;
        recognizer = null;
        if (current != null) {
            try { current.close(); } catch (Throwable ignored) {}
        }
    }

    private void leaveWakeMode() {
        wakeMode = false;
        stopCapture();
        updateNotification("NUBO 雲端語音活動中");
    }

    private void scheduleRestart() {
        mainHandler.postDelayed(() -> {
            if (wakeMode && !captureRunning.get()) startCapture();
        }, 900L);
    }

    private void fail(String message) {
        lastFailure = message;
        Log.e(TAG, message);
        updateNotification("NUBO 本機喚醒異常");
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "NUBO 本機語音喚醒",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setSound(null, null);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
    }

    private Notification notification(String text) {
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

    private boolean startForegroundCompat(Notification notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            return true;
        } catch (Throwable error) {
            lastFailure = "Foreground service rejected: " + error.getClass().getSimpleName();
            Log.e(TAG, lastFailure, error);
            stopSelf();
            return false;
        }
    }

    private void updateNotification(String text) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, notification(text));
    }

    private void acquireWakeLock() {
        try {
            PowerManager manager = getSystemService(PowerManager.class);
            if (manager != null) {
                wakeLock = manager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "ainubo:native-wake-v25"
                );
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
            }
        } catch (Throwable ignored) {}
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Throwable ignored) {}
        wakeLock = null;
    }

    private void shutdown() {
        wakeMode = false;
        stopCapture();
        if (model != null) {
            try { model.close(); } catch (Throwable ignored) {}
        }
        model = null;
        modelReady = false;
        if (senseDetector != null) {
            senseDetector.close();
            senseDetector = null;
        }
        releaseWakeLock();
        running = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        running = false;
        wakeMode = false;
        stopCapture();
        if (model != null) {
            try { model.close(); } catch (Throwable ignored) {}
        }
        if (senseDetector != null) senseDetector.close();
        senseDetector = null;
        releaseWakeLock();
        audioExecutor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
''')

# ---------------------------------------------------------------------------
# MainActivity: restore Google Home bridge and replace the old chime-prone
# SpeechRecognizer wake loop with the foreground Vosk service.
# ---------------------------------------------------------------------------
main = ROOT / "app/src/main/java/com/ainubo/nubo/MainActivity.java"
s = main.read_text()

for import_line in [
    'import android.speech.RecognitionListener;\n',
    'import android.speech.RecognizerIntent;\n',
    'import android.speech.SpeechRecognizer;\n',
]:
    s = s.replace(import_line, '')

s = s.replace('public final class MainActivity extends Activity {',
              'public final class MainActivity extends GoogleHomeActivity {', 1)
s = s.replace('private static final String NUBO_URL = "https://nubo.ainubo.com/?native=android-v24";',
              'private static final String NUBO_URL = "https://nubo.ainubo.com/?native=android-v25";', 1)
s = s.replace('settings.getUserAgentString() + " NUBO-Android/24"',
              'settings.getUserAgentString() + " NUBO-Android/25"', 1)
s = s.replace("dataset.nuboNative='android-v24'", "dataset.nuboNative='android-v25'")
s = s.replace("version:'android-v24'", "version:'android-v25'")
s = s.replace('return "android-v24";', 'return "android-v25";', 1)

old_fields = '''    private WebView webView;
    private SpeechRecognizer wakeRecognizer;
    private boolean wakeListenerEnabled = false;
    private final Handler wakeHandler = new Handler(Looper.getMainLooper());
'''
new_fields = '''    private static volatile MainActivity nativeWakeActivity;
    private static volatile boolean nativeWakePending;

    private WebView webView;
'''
if old_fields not in s:
    raise SystemExit("V25 missing old wake fields")
s = s.replace(old_fields, new_fields, 1)

s = replace_once(
    s,
    '        super.onCreate(savedInstanceState);\n\n        getWindow().setStatusBarColor',
    '        super.onCreate(savedInstanceState);\n        nativeWakeActivity = this;\n\n        getWindow().setStatusBarColor',
    "active Activity assignment",
)

version_method = '''        @JavascriptInterface
        public String getNativeVersion() {
            return "android-v25";
        }
'''
google_bridge = version_method + '''
        @JavascriptInterface
        public String googleHomeStatus() {
            return activity.googleHomeStatus();
        }

        @JavascriptInterface
        public boolean googleHomeRequestPermissions(String requestId) {
            return activity.googleHomeRequestPermissions(requestId, activity.webView);
        }

        @JavascriptInterface
        public boolean googleHomeListDevices(String requestId) {
            return activity.googleHomeListDevices(requestId, activity.webView);
        }

        @JavascriptInterface
        public boolean googleHomeControl(
            String requestId,
            String action,
            String roomName,
            String deviceName
        ) {
            return activity.googleHomeControl(
                requestId,
                action,
                roomName,
                deviceName,
                activity.webView
            );
        }
'''
if 'public String googleHomeStatus()' not in s:
    s = replace_once(s, version_method, google_bridge, "Google Home JS bridge")

start_bridge = '''        @JavascriptInterface
        public boolean startWakeListener() {
            activity.runOnUiThread(activity::startNativeWakeListener);
            return true;
        }

        @JavascriptInterface
        public boolean stopWakeListener() {
            activity.runOnUiThread(activity::stopNativeWakeListener);
            return true;
        }
'''
new_start_bridge = '''        @JavascriptInterface
        public boolean startWakeListener() {
            activity.runOnUiThread(activity::enterNativeWakeMode);
            return true;
        }

        @JavascriptInterface
        public boolean stopWakeListener() {
            activity.runOnUiThread(activity::markCloudVoiceActive);
            return true;
        }

        @JavascriptInterface
        public boolean armNativeWakeService() {
            activity.runOnUiThread(activity::armNativeWakeService);
            return true;
        }

        @JavascriptInterface
        public boolean enterNativeWakeMode() {
            activity.runOnUiThread(activity::enterNativeWakeMode);
            return true;
        }

        @JavascriptInterface
        public boolean markCloudVoiceActive() {
            activity.runOnUiThread(activity::markCloudVoiceActive);
            return true;
        }

        @JavascriptInterface
        public boolean stopNativeWakeService() {
            activity.runOnUiThread(activity::stopNativeWakeService);
            return true;
        }

        @JavascriptInterface
        public String nativeWakeDiagnostics() {
            return NuboNativeWakeService.diagnosticJson();
        }
'''
if start_bridge not in s:
    raise SystemExit("V25 missing wake bridge block")
s = s.replace(start_bridge, new_start_bridge, 1)

# Remove the old Android SpeechRecognizer restart loop entirely.
wake_pattern = re.compile(
    r'    private boolean isNativeWakeWord\(String text\) \{[\s\S]*?'
    r'    private void stopNativeWakeListener\(\) \{[\s\S]*?\n    \}\n',
    re.MULTILINE,
)
if not wake_pattern.search(s):
    raise SystemExit("V25 old SpeechRecognizer wake block not found")
s = wake_pattern.sub(
    '''    private void startNativeWakeListener() {
        enterNativeWakeMode();
    }

    private void stopNativeWakeListener() {
        markCloudVoiceActive();
    }
''',
    s,
    count=1,
)

native_methods_anchor = '    private boolean isNuboInPictureInPicture() {'
native_methods = r'''    private void sendNativeWakeAction(String action) {
        Intent intent = new Intent(this, NuboNativeWakeService.class);
        intent.setAction(action);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        } catch (RuntimeException ignored) {
            // The web voice path must remain usable even if Android rejects FGS start.
        }
    }

    private void armNativeWakeService() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            requestMicrophonePermissionIfNeeded();
            return;
        }
        sendNativeWakeAction(NuboNativeWakeService.ACTION_ARM);
    }

    private void enterNativeWakeMode() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            requestMicrophonePermissionIfNeeded();
            return;
        }
        stopSenseAmbientCapture();
        sendNativeWakeAction(NuboNativeWakeService.ACTION_WAKE_MODE);
    }

    private void markCloudVoiceActive() {
        stopSenseAmbientCapture();
        if (NuboNativeWakeService.isRunning()) {
            sendNativeWakeAction(NuboNativeWakeService.ACTION_CLOUD_ACTIVE);
        }
    }

    private void stopNativeWakeService() {
        if (NuboNativeWakeService.isRunning()) {
            sendNativeWakeAction(NuboNativeWakeService.ACTION_STOP);
        }
    }

    public static void dispatchNativeWakeFromService(android.content.Context context) {
        nativeWakePending = true;
        MainActivity activity = nativeWakeActivity;
        if (activity != null) {
            activity.runOnUiThread(activity::handleNativeWakeFromService);
            return;
        }
        if (context == null) return;
        try {
            Intent launch = new Intent(context, MainActivity.class);
            launch.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP
            );
            context.startActivity(launch);
        } catch (RuntimeException ignored) {
            // Foreground notification remains available if OEM blocks activity launch.
        }
    }

    public static void dispatchSenseEventFromNativeWake(
        NuboSenseAudioDetector.SenseEvent event
    ) {
        MainActivity activity = nativeWakeActivity;
        if (activity == null || event == null) return;
        activity.runOnUiThread(() -> activity.handleSenseEvent(event));
    }

    private void handleNativeWakeFromService() {
        nativeWakePending = false;
        try {
            android.app.ActivityManager manager =
                (android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE);
            if (manager != null) {
                manager.moveTaskToFront(getTaskId(), 0);
            }
        } catch (RuntimeException ignored) {}

        webView.onResume();
        webView.resumeTimers();
        webView.postDelayed(
            () -> webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('nubo:native-wake',{detail:{source:'android-v25-vosk'}}));",
                null
            ),
            140L
        );
    }

'''
if native_methods_anchor not in s:
    raise SystemExit("V25 native methods anchor missing")
s = s.replace(native_methods_anchor, native_methods + native_methods_anchor, 1)

old_sync = '''    private void syncSenseForVoicePhase() {
        if (!canRunSenseAmbient()) {
            stopSenseAmbientCapture();
            return;
        }

        ensureSenseDetector();
        if (senseDetector != null) {
            senseDetector.startAmbientCapture();
        }
    }
'''
new_sync = '''    private void syncSenseForVoicePhase() {
        if ("idle".equals(voicePhase) || "error".equals(voicePhase)) {
            // V25: the foreground Vosk AudioRecord owns the single idle mic and
            // forwards the same PCM to NUBO Sense, so there is no recorder fight.
            enterNativeWakeMode();
            return;
        }

        markCloudVoiceActive();
        if (!canRunSenseAmbient()) {
            stopSenseAmbientCapture();
            return;
        }

        ensureSenseDetector();
        if (senseDetector != null) {
            senseDetector.startAmbientCapture();
        }
    }
'''
if old_sync not in s:
    raise SystemExit("V25 Sense sync anchor missing")
s = s.replace(old_sync, new_sync, 1)

# Do not let the legacy ambient recorder compete with Vosk if a future call path
# reaches canRunSenseAmbient directly.
s = s.replace(
    '        if (!activityForeground) return false;\n',
    '        if (!activityForeground) return false;\n'
    '        if (NuboNativeWakeService.isWakeMode()) return false;\n',
    1,
)

old_resume = '''    protected void onResume() {
        super.onResume();
        activityForeground = true;
'''
new_resume = '''    protected void onResume() {
        super.onResume();
        nativeWakeActivity = this;
        activityForeground = true;
'''
if old_resume not in s:
    raise SystemExit("V25 onResume anchor missing")
s = s.replace(old_resume, new_resume, 1)

resume_tail = '''        webView.evaluateJavascript(
            "window.dispatchEvent(new Event('nubo:native-foreground'));",
            null
        );
        syncSenseForVoicePhase();
    }
'''
resume_tail_new = '''        webView.evaluateJavascript(
            "window.dispatchEvent(new Event('nubo:native-foreground'));",
            null
        );
        syncSenseForVoicePhase();
        if (nativeWakePending) {
            webView.postDelayed(this::handleNativeWakeFromService, 180L);
        }
    }
'''
if resume_tail not in s:
    raise SystemExit("V25 onResume tail anchor missing")
s = s.replace(resume_tail, resume_tail_new, 1)

# Old SpeechRecognizer teardown is no longer relevant. Keep the Vosk service
# alive through normal Activity recreation so it can relaunch NUBO on wake.
s = s.replace('        stopNativeWakeListener();\n', '', 1)
s = re.sub(
    r'        if \(wakeRecognizer != null\) \{\n'
    r'            wakeRecognizer\.destroy\(\);\n'
    r'            wakeRecognizer = null;\n'
    r'        \}\n',
    '',
    s,
    count=1,
)
s = replace_once(
    s,
    '        webView.destroy();\n        super.onDestroy();',
    '        webView.destroy();\n'
    '        if (nativeWakeActivity == this) nativeWakeActivity = null;\n'
    '        if ("idle".equals(voicePhase) || "error".equals(voicePhase)) {\n'
    '            enterNativeWakeMode();\n'
    '        }\n'
    '        super.onDestroy();',
    "onDestroy wake handoff",
)

main.write_text(s)

# ---------------------------------------------------------------------------
# Build-time invariants: this V25 may add only Google Home + silent native wake.
# ---------------------------------------------------------------------------
main_final = main.read_text()
manifest_final = manifest.read_text()
for token in [
    'extends GoogleHomeActivity',
    'googleHomeStatus()',
    'googleHomeRequestPermissions',
    'googleHomeListDevices',
    'googleHomeControl',
    'android-v25',
    'NUBO-Android/25',
    'armNativeWakeService',
    'enterNativeWakeMode',
    'markCloudVoiceActive',
    'nativeWakeDiagnostics',
    'dispatchNativeWakeFromService',
]:
    if token not in main_final:
        raise SystemExit(f"V25 MainActivity marker missing: {token}")

for forbidden in ['SpeechRecognizer', 'RecognizerIntent', 'RecognitionListener']:
    if forbidden in main_final:
        raise SystemExit(f"V25 chime-prone recognizer survived: {forbidden}")

for token in [
    'NuboNativeWakeService',
    'foregroundServiceType="microphone"',
    'FOREGROUND_SERVICE_MICROPHONE',
    'WAKE_LOCK',
    'REORDER_TASKS',
]:
    if token not in manifest_final:
        raise SystemExit(f"V25 manifest marker missing: {token}")

service_final = service.read_text()
for token in [
    'AudioRecord',
    'VOICE_RECOGNITION',
    'acceptWaveForm',
    'model-cn-small',
    'classifyPcm16',
    'channel.setSound(null, null)',
    'dispatchNativeWakeFromService',
]:
    if token not in service_final:
        raise SystemExit(f"V25 wake service marker missing: {token}")
for forbidden in ['ToneGenerator', 'SpeechRecognizer', 'createOscillator']:
    if forbidden in service_final:
        raise SystemExit(f"V25 audible/chime source survived service: {forbidden}")

print("Applied Android V25: restored Google Home + silent Vosk wake + shared Sense PCM")
