from pathlib import Path
import runpy

# V57 builds on the successful V56 non-modal bottom banner.
# Scope: YouTube playback smoothness during NUBO speech + reliable 30s native wake.
runpy.run_path("scripts/apply-youtube-v56-nonmodal-wake-recovery.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 56", "versionCode 57", "V57 versionCode")
s = replace_once(
    s,
    'versionName "0.56.0-youtube-nonmodal-wake-recovery"',
    'versionName "0.57.0-youtube-audio-mix-native-wake"',
    "V57 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v56", "android-v57")
s = s.replace("NUBO-Android/56", "NUBO-Android/57")
s = s.replace("bundle=v56", "bundle=v57")
s = s.replace("nubo_v56_bundle_flushed", "nubo_v57_bundle_flushed")
s = s.replace("nubo_youtube_v56", "nubo_youtube_v57")
s = s.replace("handleYouTubeIntentV56", "handleYouTubeIntentV57")
s = s.replace("isDuplicateYouTubeLaunchV56", "isDuplicateYouTubeLaunchV57")
s = s.replace("startYouTubeIntentV56", "startYouTubeIntentV57")
s = s.replace("prepareYouTubeMediaRouteV56", "prepareYouTubeMediaRouteV57")
s = s.replace("EmbeddedYouTubeBridgeV56", "EmbeddedYouTubeBridgeV57")
s = s.replace("embeddedYouTubeOverlayV56", "embeddedYouTubeOverlayV57")
s = s.replace("embeddedYouTubeWebViewV56", "embeddedYouTubeWebViewV57")
s = s.replace("embeddedYouTubeVideoIdV56", "embeddedYouTubeVideoIdV57")
s = s.replace("dismissEmbeddedYouTubeV56", "dismissEmbeddedYouTubeV57")
s = s.replace("showEmbeddedYouTubeV56", "showEmbeddedYouTubeV57")
s = s.replace("v56-embed-error-fallback-", "v57-embed-error-fallback-")
s = s.replace("v56-external-fallback-exact", "v57-external-fallback-exact")
s = s.replace("v56-external-fallback-search", "v57-external-fallback-search")
s = s.replace("v56-external-fallback-url", "v57-external-fallback-url")

# Add a wake generation token so stale retries from an old recognizer cannot keep looping.
field_marker = '    private final Handler wakeHandler = new Handler(Looper.getMainLooper());\n'
fields = '''    private final Handler wakeHandler = new Handler(Looper.getMainLooper());\n    private int wakeGenerationV57 = 0;\n    private boolean wakeStartPendingV57 = false;\n'''
s = replace_once(s, field_marker, fields, "V57 wake fields")

# Force the embedded YouTube WebView onto a hardware layer and default cache policy.
old_player = '''            WebView player = new WebView(this);\n            player.setBackgroundColor(Color.BLACK);\n            player.setKeepScreenOn(true);\n            player.getSettings().setJavaScriptEnabled(true);\n            player.getSettings().setDomStorageEnabled(true);\n            player.getSettings().setMediaPlaybackRequiresUserGesture(false);\n'''
new_player = '''            WebView player = new WebView(this);\n            player.setBackgroundColor(Color.BLACK);\n            player.setKeepScreenOn(true);\n            player.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);\n            player.getSettings().setJavaScriptEnabled(true);\n            player.getSettings().setDomStorageEnabled(true);\n            player.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);\n            player.getSettings().setMediaPlaybackRequiresUserGesture(false);\n'''
s = replace_once(s, old_player, new_player, "V57 hardware player")

# Add a YouTube audio-mix helper: preserve media mode and duck volume while NUBO speaks.
method_marker = "    private void prepareYouTubeMediaRouteV57() {\n"
helper = r'''    private void applyYouTubeVoiceMixV57(String phase) {
        if (embeddedYouTubeWebViewV57 == null) return;
        prepareYouTubeMediaRouteV57();
        int volume = 100;
        if ("speaking".equals(phase)) volume = 24;
        else if ("thinking".equals(phase) || "connecting".equals(phase)) volume = 55;
        final int target = volume;
        try {
            embeddedYouTubeWebViewV57.evaluateJavascript(
                "try{if(window.p&&p.setVolume){p.setVolume(" + target + ");if(p.getPlayerState&&p.getPlayerState()===2){p.playVideo();}}}catch(e){}",
                null
            );
        } catch (RuntimeException ignored) {}
    }

'''
s = replace_once(s, method_marker, helper + method_marker, "V57 voice mix helper")

# Every voice phase reasserts MODE_NORMAL and adjusts YouTube volume without stopping video.
old_sync = '''        syncSenseForVoicePhase();\n    }\n\n    private void ensureSenseDetector() {\n'''
new_sync = '''        syncSenseForVoicePhase();\n        applyYouTubeVoiceMixV57(voicePhase);\n    }\n\n    private void ensureSenseDetector() {\n'''
s = replace_once(s, old_sync, new_sync, "V57 voice phase media mix")

# Replace the native wake loop with delayed on-device-first recognition and hard recovery.
start = s.index("    private void scheduleWakeRestart() {")
end = s.index("    private void stopNativeWakeListener() {", start)
new_wake = r'''    private void recreateWakeRecognizerV57() {
        if (wakeRecognizer != null) {
            try { wakeRecognizer.cancel(); } catch (Exception ignored) {}
            try { wakeRecognizer.destroy(); } catch (Exception ignored) {}
            wakeRecognizer = null;
        }
        if (!wakeListenerEnabled) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
                wakeRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
            } else {
                wakeRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
            }
            wakeRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {}
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {}
                @Override public void onError(int error) {
                    if (!wakeListenerEnabled) return;
                    if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY
                        || error == SpeechRecognizer.ERROR_CLIENT
                        || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                            && error == SpeechRecognizer.ERROR_SERVER_DISCONNECTED)) {
                        recreateWakeRecognizerV57();
                        scheduleWakeRestartV57(900L);
                        return;
                    }
                    scheduleWakeRestartV57(650L);
                }
                @Override public void onResults(Bundle results) {
                    handleWakeRecognition(results);
                    if (wakeListenerEnabled) scheduleWakeRestartV57(350L);
                }
                @Override public void onPartialResults(Bundle partialResults) {
                    handleWakeRecognition(partialResults);
                }
                @Override public void onEvent(int eventType, Bundle params) {}
            });
        } catch (RuntimeException ignored) {
            wakeRecognizer = null;
        }
    }

    private void scheduleWakeRestartV57(long delayMs) {
        if (!wakeListenerEnabled) return;
        final int generation = wakeGenerationV57;
        wakeHandler.removeCallbacksAndMessages(null);
        wakeHandler.postDelayed(() -> {
            if (!wakeListenerEnabled || generation != wakeGenerationV57) return;
            startWakeRecognition();
        }, delayMs);
    }

    private void scheduleWakeRestart() {
        scheduleWakeRestartV57(650L);
    }

    private void startWakeRecognition() {
        if (!wakeListenerEnabled) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            wakeListenerEnabled = false;
            return;
        }
        if (wakeRecognizer == null) recreateWakeRecognizerV57();
        if (wakeRecognizer == null) {
            scheduleWakeRestartV57(1200L);
            return;
        }

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(
            RecognizerIntent.EXTRA_LANGUAGE_MODEL,
            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
        );
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-TW");
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 700L);
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 450L);
        try {
            wakeRecognizer.startListening(intent);
        } catch (Exception ignored) {
            recreateWakeRecognizerV57();
            scheduleWakeRestartV57(900L);
        }
    }

    private void startNativeWakeListener() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            requestMicrophonePermissionIfNeeded();
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return;

        stopSenseAmbientCapture();
        wakeGenerationV57++;
        wakeListenerEnabled = true;
        wakeStartPendingV57 = true;
        wakeHandler.removeCallbacksAndMessages(null);
        final int generation = wakeGenerationV57;
        // Give Gemini/WebView time to release RECORD_AUDIO after the 30s idle transition.
        wakeHandler.postDelayed(() -> {
            if (!wakeListenerEnabled || generation != wakeGenerationV57) return;
            wakeStartPendingV57 = false;
            recreateWakeRecognizerV57();
            startWakeRecognition();
        }, 1250L);
    }

'''
s = s[:start] + new_wake + s[end:]

# Strengthen stopNativeWakeListener so all pending retries are invalidated and recognizer is destroyed.
old_stop = '''    private void stopNativeWakeListener() {\n        wakeListenerEnabled = false;\n        wakeHandler.removeCallbacksAndMessages(null);\n        if (wakeRecognizer != null) {\n            try { wakeRecognizer.cancel(); } catch (Exception ignored) {}\n        }\n        syncSenseForVoicePhase();\n    }\n'''
new_stop = '''    private void stopNativeWakeListener() {\n        wakeListenerEnabled = false;\n        wakeStartPendingV57 = false;\n        wakeGenerationV57++;\n        wakeHandler.removeCallbacksAndMessages(null);\n        if (wakeRecognizer != null) {\n            try { wakeRecognizer.cancel(); } catch (Exception ignored) {}\n            try { wakeRecognizer.destroy(); } catch (Exception ignored) {}\n            wakeRecognizer = null;\n        }\n        syncSenseForVoicePhase();\n    }\n'''
s = replace_once(s, old_stop, new_stop, "V57 hard stop wake")

# Native wake must fully revive the NUBO WebView and stop the recognizer before dispatching.
old_dispatch = '''    private void dispatchNativeWake() {\n        wakeListenerEnabled = false;\n        if (wakeRecognizer != null) {\n            try { wakeRecognizer.cancel(); } catch (Exception ignored) {}\n        }\n        activityForeground = true;\n'''
new_dispatch = '''    private void dispatchNativeWake() {\n        wakeListenerEnabled = false;\n        wakeStartPendingV57 = false;\n        wakeGenerationV57++;\n        wakeHandler.removeCallbacksAndMessages(null);\n        if (wakeRecognizer != null) {\n            try { wakeRecognizer.cancel(); } catch (Exception ignored) {}\n            try { wakeRecognizer.destroy(); } catch (Exception ignored) {}\n            wakeRecognizer = null;\n        }\n        activityForeground = true;\n'''
s = replace_once(s, old_dispatch, new_dispatch, "V57 wake dispatch cleanup")

main.write_text(s)

final_source = main.read_text()
for token in [
    "NUBO-Android/57",
    "android-v57",
    "applyYouTubeVoiceMixV57",
    "p.setVolume(",
    "LAYER_TYPE_HARDWARE",
    "WebSettings.LOAD_DEFAULT",
    "createOnDeviceSpeechRecognizer",
    "isOnDeviceRecognitionAvailable",
    "recreateWakeRecognizerV57",
    "wakeGenerationV57",
    "1250L",
    "AudioManager.MODE_NORMAL",
    "YOUTUBE_RELAUNCH_GUARD_MS = 60_000L",
    '"com.google.android.youtube"',
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V57 marker: {token}")

print("Applied V57: smooth YouTube audio mix + resilient on-device native wake")
