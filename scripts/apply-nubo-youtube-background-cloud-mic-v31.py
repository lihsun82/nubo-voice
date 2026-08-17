from pathlib import Path

# NUBO 3.1 — real native microphone bridge while external apps are foreground.
# This patch runs AFTER Stable 3 + Google Home materialization. It does not touch
# Google Home transport/gateway code.

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 3000", "versionCode 3100", 1)
s = s.replace('versionName "3.0.0-audiorecord-native-wake"', 'versionName "3.1.0-youtube-background-cloud-mic"', 1)
app.write_text(s)

service = Path("android-nubo/app/src/main/java/com/ainubo/nubo/NuboNativeWakeService.java")
s = service.read_text()

s = s.replace(
    '    public static final String ACTION_CLOUD_ACTIVE = "com.ainubo.nubo.action.NATIVE_WAKE_CLOUD";\n',
    '    public static final String ACTION_CLOUD_ACTIVE = "com.ainubo.nubo.action.NATIVE_WAKE_CLOUD";\n'
    '    public static final String ACTION_BACKGROUND_CLOUD = "com.ainubo.nubo.action.NATIVE_BACKGROUND_CLOUD";\n',
    1,
)
s = s.replace(
    '    private static volatile boolean wakeMode;\n    private static volatile boolean micActive;\n',
    '    private static volatile boolean wakeMode;\n    private static volatile boolean backgroundCloudMode;\n    private static volatile boolean micActive;\n',
    1,
)
s = s.replace(
    '            o.put("wakeMode", wakeMode);\n            o.put("micActive", micActive);\n',
    '            o.put("wakeMode", wakeMode);\n            o.put("backgroundCloudMode", backgroundCloudMode);\n            o.put("micActive", micActive);\n',
    1,
)
old_dispatch = '''        if (!startForegroundCompat(notification("NUBO 本機語音核心已就緒"))) return START_NOT_STICKY;\n        if (ACTION_WAKE_MODE.equals(action)) enterWakeMode();\n        else leaveWakeMode();\n        return START_STICKY;'''
new_dispatch = '''        if (!startForegroundCompat(notification("NUBO 本機語音核心已就緒"))) return START_NOT_STICKY;\n        if (ACTION_BACKGROUND_CLOUD.equals(action)) enterBackgroundCloudMode();\n        else if (ACTION_WAKE_MODE.equals(action)) enterWakeMode();\n        else leaveWakeMode();\n        return START_STICKY;'''
if old_dispatch not in s:
    raise SystemExit("3.1 service dispatch anchor missing")
s = s.replace(old_dispatch, new_dispatch, 1)

s = s.replace(
    '    private void enterWakeMode() {\n        wakeMode = true;\n',
    '    private void enterWakeMode() {\n        backgroundCloudMode = false;\n        wakeMode = true;\n',
    1,
)

anchor = '    private synchronized void stopCapture() {\n'
cloud_methods = r'''    private void enterBackgroundCloudMode() {
        wakeMode = false;
        backgroundCloudMode = true;
        stopCapture();
        lastFailure = "";
        updateNotification("NUBO 背景對話中 · Android 原生麥克風");
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            fail("RECORD_AUDIO permission missing");
            return;
        }
        startBackgroundCloudCapture();
    }

    private synchronized void startBackgroundCloudCapture() {
        if (!backgroundCloudMode || captureRunning.get()) return;
        int min = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        // ~100ms chunks at 16kHz mono PCM16, large enough to avoid excessive
        // WebView bridge calls while keeping Live latency low.
        int bufferSize = Math.max(min > 0 ? min : 3200, 3200);
        try {
            AudioRecord record = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                Math.max(bufferSize * 2, 6400)
            );
            if (record.getState() != AudioRecord.STATE_INITIALIZED) {
                record.release();
                fail("Background cloud AudioRecord initialization failed");
                scheduleCloudRestart();
                return;
            }
            audioRecord = record;
            captureRunning.set(true);
            audioExecutor.execute(() -> backgroundCloudCaptureLoop(record, bufferSize));
        } catch (Throwable e) {
            fail("Background cloud AudioRecord start failed: " + e.getClass().getSimpleName());
            stopCapture();
            scheduleCloudRestart();
        }
    }

    private void backgroundCloudCaptureLoop(AudioRecord record, int bufferSize) {
        byte[] buffer = new byte[bufferSize];
        try {
            record.startRecording();
            if (record.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                fail("Background cloud microphone did not enter RECORDING state");
                return;
            }
            micActive = true;
            lastAudioAt = SystemClock.elapsedRealtime();
            updateNotification("NUBO 背景對話中 · 麥克風正常");
            while (backgroundCloudMode && captureRunning.get() && audioRecord == record) {
                int read = record.read(buffer, 0, buffer.length, AudioRecord.READ_BLOCKING);
                if (read > 0) {
                    lastAudioAt = SystemClock.elapsedRealtime();
                    String pcm = android.util.Base64.encodeToString(
                        java.util.Arrays.copyOf(buffer, read),
                        android.util.Base64.NO_WRAP
                    );
                    MainActivity.dispatchBackgroundPcmFromService(pcm);
                } else if (read < 0) {
                    fail("Background cloud AudioRecord read error " + read);
                    break;
                }
            }
        } catch (Throwable e) {
            fail("Background cloud capture loop failed: " + e.getClass().getSimpleName());
        } finally {
            micActive = false;
            captureRunning.set(false);
            try { if (record.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) record.stop(); } catch (Throwable ignored) {}
            try { record.release(); } catch (Throwable ignored) {}
            synchronized (this) { if (audioRecord == record) audioRecord = null; }
            if (backgroundCloudMode) scheduleCloudRestart();
        }
    }

    private void scheduleCloudRestart() {
        mainHandler.postDelayed(() -> {
            if (backgroundCloudMode && !captureRunning.get()) startBackgroundCloudCapture();
        }, 700L);
    }

'''
if anchor not in s:
    raise SystemExit("3.1 service stopCapture anchor missing")
s = s.replace(anchor, cloud_methods + anchor, 1)

s = s.replace(
    '    private void leaveWakeMode() {\n        wakeMode = false;\n        stopCapture();\n',
    '    private void leaveWakeMode() {\n        wakeMode = false;\n        backgroundCloudMode = false;\n        stopCapture();\n',
    1,
)
s = s.replace(
    '    private void shutdown() {\n        wakeMode = false;\n        stopCapture();\n',
    '    private void shutdown() {\n        wakeMode = false;\n        backgroundCloudMode = false;\n        stopCapture();\n',
    1,
)
s = s.replace(
    '        running = false;\n        wakeMode = false;\n        stopCapture();\n',
    '        running = false;\n        wakeMode = false;\n        backgroundCloudMode = false;\n        stopCapture();\n',
    1,
)
service.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

wake_dispatch = '''    public static void dispatchNativeWakeFromService() {'''
if wake_dispatch not in s:
    raise SystemExit("3.1 MainActivity native wake dispatch anchor missing")
# Insert the PCM dispatcher immediately before the PiP helper, after the existing
# dispatchNativeWakeFromService method block.
method_anchor = '    private boolean isNuboInPictureInPicture() {\n'
pcm_dispatch = r'''    public static void dispatchBackgroundPcmFromService(String pcmBase64) {
        MainActivity activity = stable2Activity;
        if (activity == null || activity.webView == null || pcmBase64 == null || pcmBase64.isEmpty()) return;
        activity.runOnUiThread(() -> {
            try {
                JSONObject detail = new JSONObject();
                detail.put("data", pcmBase64);
                detail.put("mimeType", "audio/pcm;rate=16000");
                activity.webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('nubo:native-background-pcm',{detail:"
                        + detail.toString() + "}));",
                    null
                );
            } catch (Exception ignored) {}
        });
    }

'''
if 'dispatchBackgroundPcmFromService' not in s:
    if method_anchor not in s:
        raise SystemExit("3.1 MainActivity PiP anchor missing")
    s = s.replace(method_anchor, pcm_dispatch + method_anchor, 1)

begin_anchor = '    private void beginExternalVoiceKeepAlive() {\n'
begin_patch = '''    private void beginExternalVoiceKeepAlive() {\n        // NUBO 3.1: hand microphone ownership from WebView to the already-armed\n        // Android microphone foreground service BEFORE launching YouTube.\n        if (webView != null && NuboNativeWakeService.isRunning()) {\n            webView.evaluateJavascript(\n                "window.dispatchEvent(new Event('nubo:native-background-audio-start'));",\n                null\n            );\n            webView.postDelayed(\n                () -> sendNativeWakeAction(NuboNativeWakeService.ACTION_BACKGROUND_CLOUD),\n                260L\n            );\n        }\n'''
if 'NUBO 3.1: hand microphone ownership' not in s:
    if begin_anchor not in s:
        raise SystemExit("3.1 MainActivity beginExternalVoiceKeepAlive anchor missing")
    s = s.replace(begin_anchor, begin_patch, 1)

resume_anchor = '''        webView.onResume();\n        webView.resumeTimers();\n'''
resume_patch = '''        webView.onResume();\n        webView.resumeTimers();\n        // Return microphone ownership to WebView when NUBO becomes visible again.\n        if (NuboNativeWakeService.isRunning()) {\n            sendNativeWakeAction(NuboNativeWakeService.ACTION_CLOUD_ACTIVE);\n        }\n        webView.evaluateJavascript(\n            "window.dispatchEvent(new Event('nubo:native-background-audio-stop'));",\n            null\n        );\n'''
if 'nubo:native-background-audio-stop' not in s:
    if resume_anchor not in s:
        raise SystemExit("3.1 MainActivity onResume anchor missing")
    s = s.replace(resume_anchor, resume_patch, 1)
main.write_text(s)

web = Path("components/GeminiVoiceConsole.tsx")
s = web.read_text()
if 'NUBO_NATIVE_BACKGROUND_PCM_V31' not in s:
    ref_anchor = '  const ecoRecognitionRef = useRef<any>(null);\n'
    if ref_anchor not in s:
        raise SystemExit("3.1 web ref anchor missing")
    s = s.replace(
        ref_anchor,
        ref_anchor + '  const nativeBackgroundAudioRef = useRef(false); // NUBO_NATIVE_BACKGROUND_PCM_V31\n',
        1,
    )

    effect_anchor = '''  useEffect(() => {\n    if (state === "idle") notifyNuboVoicePhase("idle");'''
    background_effect = r'''  useEffect(() => {
    const stopBrowserMicForNative = () => {
      nativeBackgroundAudioRef.current = true;
      const current = microphoneRef.current;
      microphoneRef.current = null;
      void current?.stop();
    };

    const forwardNativePcm = (event: Event) => {
      if (!nativeBackgroundAudioRef.current || ecoSleepingRef.current || closingRef.current) return;
      const detail = (event as CustomEvent<{ data?: string; mimeType?: string }>).detail;
      const data = detail?.data;
      if (!data) return;
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({
        realtimeInput: {
          audio: {
            data,
            mimeType: detail?.mimeType || "audio/pcm;rate=16000",
          },
        },
      }));
    };

    const restoreBrowserMic = () => {
      if (!nativeBackgroundAudioRef.current) return;
      nativeBackgroundAudioRef.current = false;
      if (ecoSleepingRef.current || closingRef.current || microphoneRef.current) return;
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const microphone = new MicrophonePcmStream();
      microphoneRef.current = microphone;
      void microphone.start((data) => {
        if (socket.readyState !== WebSocket.OPEN || nativeBackgroundAudioRef.current) return;
        socket.send(JSON.stringify({
          realtimeInput: {
            audio: { data, mimeType: "audio/pcm;rate=16000" },
          },
        }));
      }).catch(() => {
        if (microphoneRef.current === microphone) microphoneRef.current = null;
      });
    };

    window.addEventListener("nubo:native-background-audio-start", stopBrowserMicForNative);
    window.addEventListener("nubo:native-background-pcm", forwardNativePcm);
    window.addEventListener("nubo:native-background-audio-stop", restoreBrowserMic);
    return () => {
      window.removeEventListener("nubo:native-background-audio-start", stopBrowserMicForNative);
      window.removeEventListener("nubo:native-background-pcm", forwardNativePcm);
      window.removeEventListener("nubo:native-background-audio-stop", restoreBrowserMic);
    };
  }, []);

'''
    if effect_anchor not in s:
        raise SystemExit("3.1 web effect anchor missing")
    s = s.replace(effect_anchor, background_effect + effect_anchor, 1)
web.write_text(s)

# Final safeguards: Google Home identifiers must still exist in MainActivity/manifest
# and the Stable 3 native wake path must remain present.
final_app = app.read_text(); final_service = service.read_text(); final_main = main.read_text(); final_web = web.read_text()
for token in ["versionCode 3100", "3.1.0-youtube-background-cloud-mic"]:
    if token not in final_app: raise SystemExit("3.1 app marker missing: " + token)
for token in ["ACTION_BACKGROUND_CLOUD", "backgroundCloudCaptureLoop", "VOICE_RECOGNITION", "dispatchBackgroundPcmFromService"]:
    if token not in final_service + final_main: raise SystemExit("3.1 native marker missing: " + token)
for token in ["NUBO_NATIVE_BACKGROUND_PCM_V31", "nubo:native-background-pcm", "realtimeInput"]:
    if token not in final_web: raise SystemExit("3.1 web marker missing: " + token)
print("Applied NUBO 3.1 real Android background PCM -> Gemini Live bridge")
