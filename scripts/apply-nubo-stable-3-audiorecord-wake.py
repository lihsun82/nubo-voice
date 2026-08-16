from pathlib import Path
import runpy

# Materialize Stable 2 hardened baseline first.
runpy.run_path("scripts/apply-nubo-stable-2-native-wake-v2.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 2000", "versionCode 3000", 1)
s = s.replace('versionName "2.0.0-native-offline-wake"', 'versionName "3.0.0-audiorecord-native-wake"', 1)
app.write_text(s)

service = Path("android-nubo/app/src/main/java/com/ainubo/nubo/NuboNativeWakeService.java")
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
import android.speech.tts.TextToSpeech;
import android.util.Log;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.StorageService;

import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class NuboNativeWakeService extends Service {
    public static final String ACTION_ARM = "com.ainubo.nubo.action.NATIVE_WAKE_ARM";
    public static final String ACTION_WAKE_MODE = "com.ainubo.nubo.action.NATIVE_WAKE_LISTEN";
    public static final String ACTION_CLOUD_ACTIVE = "com.ainubo.nubo.action.NATIVE_WAKE_CLOUD";
    public static final String ACTION_STOP = "com.ainubo.nubo.action.NATIVE_WAKE_STOP";

    private static final String TAG = "NuboNativeWakeV3";
    private static final String CHANNEL_ID = "nubo_native_wake_v3";
    private static final int NOTIFICATION_ID = 30001;
    private static final int SAMPLE_RATE = 16000;
    private static final String GRAMMAR = "[\"努寶\",\"努波\",\"奴波\",\"努寶努寶\",\"嗨努寶\",\"嘿努寶\",\"兄弟\",\"有人嗎\",\"有人\",\"哈囉\",\"哈啰\",\"你好\",\"嘿\",\"喂\",\"[unk]\"]";

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
    private TextToSpeech tts;

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
        } catch (Exception e) { return "{}"; }
    }

    @Override public void onCreate() {
        super.onCreate();
        running = true;
        createChannel();
        acquireWakeLock();
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) tts.setLanguage(Locale.TAIWAN);
        });
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? (wakeMode ? ACTION_WAKE_MODE : ACTION_ARM) : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            shutdown();
            return START_NOT_STICKY;
        }
        if (!startForegroundCompat(notification("NUBO 本機語音核心已就緒"))) return START_NOT_STICKY;
        if (ACTION_WAKE_MODE.equals(action)) enterWakeMode();
        else leaveWakeMode();
        return START_STICKY;
    }

    private void enterWakeMode() {
        wakeMode = true;
        lastFailure = "";
        updateNotification("NUBO 本機待命 · 正在準備麥克風");
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
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
        StorageService.unpack(this, "model-cn-small", "nubo-wake-model-v3",
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
        } catch (Throwable e) {
            fail("AudioRecord start failed: " + e.getClass().getSimpleName());
            stopCapture();
            scheduleRestart();
        }
    }

    private void captureLoop(AudioRecord record, int bufferSize) {
        byte[] buffer = new byte[bufferSize];
        try {
            record.startRecording();
            if (record.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                fail("Microphone did not enter RECORDING state");
                return;
            }
            micActive = true;
            lastAudioAt = SystemClock.elapsedRealtime();
            updateNotification("NUBO 本機喚醒聆聽中 · 麥克風正常");
            while (wakeMode && captureRunning.get() && audioRecord == record) {
                int read = record.read(buffer, 0, buffer.length, AudioRecord.READ_BLOCKING);
                if (read > 0) {
                    lastAudioAt = SystemClock.elapsedRealtime();
                    Recognizer r = recognizer;
                    if (r == null) continue;
                    boolean endpoint = r.acceptWaveForm(buffer, read);
                    String json = endpoint ? r.getResult() : r.getPartialResult();
                    handleHypothesis(json);
                } else if (read < 0) {
                    fail("AudioRecord read error " + read);
                    break;
                }
            }
        } catch (Throwable e) {
            fail("Capture loop failed: " + e.getClass().getSimpleName());
        } finally {
            micActive = false;
            captureRunning.set(false);
            try { if (record.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) record.stop(); } catch (Throwable ignored) {}
            try { record.release(); } catch (Throwable ignored) {}
            synchronized (this) { if (audioRecord == record) audioRecord = null; }
            if (wakeMode) scheduleRestart();
        }
    }

    private boolean matchesWake(String json) {
        if (json == null || json.isBlank()) return false;
        try {
            JSONObject object = new JSONObject(json);
            String text = object.optString("partial", object.optString("text", ""));
            String n = text.toLowerCase(Locale.ROOT).replace(" ", "").replace("　", "");
            lastHypothesis = text;
            return n.contains("努寶") || n.contains("努波") || n.contains("奴波")
                || n.contains("兄弟") || n.contains("有人嗎") || n.equals("有人")
                || n.contains("哈囉") || n.contains("哈啰") || n.contains("你好")
                || n.equals("嘿") || n.equals("喂");
        } catch (Exception ignored) { return false; }
    }

    private void handleHypothesis(String json) {
        if (!wakeMode || !matchesWake(json)) return;
        wakeMode = false;
        stopCapture();
        updateNotification("NUBO 已聽到喚醒詞 · 正在恢復語音");
        mainHandler.postDelayed(() -> {
            try {
                if (tts != null) tts.speak("我在", TextToSpeech.QUEUE_FLUSH, null, "nubo-native-wake");
            } catch (Throwable ignored) {}
            MainActivity.dispatchNativeWakeFromService();
        }, 180L);
    }

    private synchronized void stopCapture() {
        captureRunning.set(false);
        micActive = false;
        AudioRecord record = audioRecord;
        audioRecord = null;
        if (record != null) {
            try { if (record.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) record.stop(); } catch (Throwable ignored) {}
        }
        Recognizer r = recognizer;
        recognizer = null;
        if (r != null) try { r.close(); } catch (Throwable ignored) {}
    }

    private void leaveWakeMode() {
        wakeMode = false;
        stopCapture();
        updateNotification("NUBO 雲端語音活動中 · 本機麥克風已釋放");
    }

    private void scheduleRestart() {
        mainHandler.postDelayed(() -> {
            if (wakeMode && !captureRunning.get()) startCapture();
        }, 900L);
    }

    private void fail(String message) {
        lastFailure = message;
        Log.e(TAG, message);
        updateNotification("NUBO 本機喚醒異常 · " + message);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "NUBO 本機語音喚醒", NotificationManager.IMPORTANCE_LOW);
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

    private boolean startForegroundCompat(Notification n) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else startForeground(NOTIFICATION_ID, n);
            return true;
        } catch (Throwable error) {
            lastFailure = "Foreground service rejected: " + error.getClass().getSimpleName();
            Log.e(TAG, lastFailure, error);
            stopSelf();
            return false;
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
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ainubo:native-wake-v3");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
            }
        } catch (Throwable ignored) {}
    }

    private void releaseWakeLock() {
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Throwable ignored) {}
        wakeLock = null;
    }

    private void shutdown() {
        wakeMode = false;
        stopCapture();
        if (model != null) try { model.close(); } catch (Throwable ignored) {}
        model = null;
        modelReady = false;
        if (tts != null) try { tts.shutdown(); } catch (Throwable ignored) {}
        tts = null;
        releaseWakeLock();
        running = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override public void onDestroy() {
        running = false;
        wakeMode = false;
        stopCapture();
        if (model != null) try { model.close(); } catch (Throwable ignored) {}
        if (tts != null) try { tts.shutdown(); } catch (Throwable ignored) {}
        releaseWakeLock();
        audioExecutor.shutdownNow();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
''')

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("NUBO-Stable/2.0", "NUBO-Stable/3.0")
s = s.replace("stable-2", "stable-3")

bridge_anchor = '''        @JavascriptInterface
        public boolean isExternalVoiceKeepAliveActive()'''
diag = '''        @JavascriptInterface
        public String nativeWakeDiagnostics() {
            return NuboNativeWakeService.diagnosticJson();
        }

'''
if "nativeWakeDiagnostics()" not in s:
    if bridge_anchor not in s: raise SystemExit("Stable 3: diagnostic bridge anchor missing")
    s = s.replace(bridge_anchor, diag + bridge_anchor, 1)
main.write_text(s)

# Validate the materialized architecture.
for token in ["versionCode 3000", "3.0.0-audiorecord-native-wake"]:
    if token not in app.read_text(): raise SystemExit("Stable 3 app marker missing: " + token)
final_service = service.read_text(); final_main = main.read_text()
for token in ["AudioRecord", "VOICE_RECOGNITION", "acceptWaveForm", "diagnosticJson", "我在", "scheduleRestart"]:
    if token not in final_service: raise SystemExit("Stable 3 service marker missing: " + token)
if "org.vosk.android.SpeechService" in final_service:
    raise SystemExit("Stable 3 must not use Vosk SpeechService")
if "nativeWakeDiagnostics" not in final_main:
    raise SystemExit("Stable 3 diagnostics bridge missing")
print("Applied NUBO Stable 3.0 self-healing AudioRecord wake core")
