from pathlib import Path
import runpy

# V53 starts from V52 and fixes two lifecycle bugs only:
# 1) foreground-service startup races Activity.onPause, so set keep-alive synchronously
#    before launching YouTube;
# 2) V52 timeout broadcast had no receiver, so call MainActivity directly and start
#    the existing native wake listener after Gemini releases the microphone.
runpy.run_path("scripts/apply-youtube-v52-background-listening.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 52", "versionCode 53", "V53 versionCode")
s = replace_once(
    s,
    'versionName "0.52.0-youtube-background-listening"',
    'versionName "0.53.0-youtube-background-keepalive-fix"',
    "V53 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v52", "android-v53")
s = s.replace("NUBO-Android/52", "NUBO-Android/53")
s = s.replace("bundle=v52", "bundle=v53")
s = s.replace("nubo_v52_bundle_flushed", "nubo_v53_bundle_flushed")
s = s.replace("nubo_youtube_v52", "nubo_youtube_v53")
s = s.replace("handleYouTubeIntentV52", "handleYouTubeIntentV53")
s = s.replace("isDuplicateYouTubeLaunchV52", "isDuplicateYouTubeLaunchV53")
s = s.replace("startYouTubeIntentV52", "startYouTubeIntentV53")
s = s.replace("prepareYouTubeMediaRouteV52", "prepareYouTubeMediaRouteV53")
s = s.replace("startCompanionListeningV52", "startCompanionListeningV53")
s = s.replace("stopCompanionListeningV52", "stopCompanionListeningV53")
s = s.replace("handleCompanionTimeoutV52", "handleCompanionTimeoutV53")
s = s.replace("handleCompanionWakeV52", "handleCompanionWakeV53")
s = s.replace("onCompanionTimeoutFromService", "onCompanionTimeoutFromServiceV53")
s = s.replace("onCompanionWakeFromService", "onCompanionWakeFromServiceV53")
s = s.replace("companionActivityV52", "companionActivityV53")
s = s.replace("v52-native-exact-background", "v53-native-exact-background")
s = s.replace("v52-native-play-from-search-background", "v53-native-play-from-search-background")
s = s.replace("v52-native-url-fallback-background", "v53-native-url-fallback-background")

old_start_helper = '''    private void startCompanionListeningV53() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) return;
        try {
            Intent serviceIntent = new Intent(this, NuboBackgroundListeningService.class);
'''
new_start_helper = '''    private void startCompanionListeningV53() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) return;
        externalVoiceKeepAliveActive = true;
        activityForeground = true;
        try {
            webView.resumeTimers();
            webView.onResume();
        } catch (RuntimeException ignored) {}
        try {
            Intent serviceIntent = new Intent(this, NuboBackgroundListeningService.class);
'''
s = replace_once(s, old_start_helper, new_start_helper, "synchronous keepalive before FGS")

old_start_catch = '''        } catch (RuntimeException ignored) {
            // Fail open: V51 YouTube playback must still work even if companion mode cannot start.
        }
    }

    private void stopCompanionListeningV53() {
'''
new_start_catch = '''        } catch (RuntimeException ignored) {
            externalVoiceKeepAliveActive = false;
            // Fail open: V51 YouTube playback must still work even if companion mode cannot start.
        }
    }

    private void touchCompanionListeningV53() {
        if (!NuboBackgroundListeningService.isRunning()) return;
        externalVoiceKeepAliveActive = true;
        activityForeground = true;
        try {
            Intent serviceIntent = new Intent(this, NuboBackgroundListeningService.class);
            serviceIntent.setAction(NuboBackgroundListeningService.ACTION_TOUCH);
            startService(serviceIntent);
        } catch (RuntimeException ignored) {}
    }

    private void stopCompanionListeningV53() {
'''
s = replace_once(s, old_start_catch, new_start_catch, "V53 touch helper")

old_timeout_tail = '''        webView.postDelayed(() -> {
            try {
                webView.onPause();
                webView.pauseTimers();
            } catch (RuntimeException ignored) {}
        }, 450L);
    }

    private void handleCompanionWakeV53() {
'''
new_timeout_tail = '''        webView.postDelayed(() -> {
            try {
                webView.onPause();
                webView.pauseTimers();
            } catch (RuntimeException ignored) {}
            startNativeWakeListener();
        }, 700L);
    }

    private void handleCompanionWakeV53() {
'''
s = replace_once(s, old_timeout_tail, new_timeout_tail, "start native wake after timeout")

old_wake = '''    private void handleCompanionWakeV53() {
        activityForeground = true;
        try {
            webView.onResume();
            webView.resumeTimers();
        } catch (RuntimeException ignored) {}
        webView.postDelayed(() -> webView.evaluateJavascript(
'''
new_wake = '''    private void handleCompanionWakeV53() {
        stopNativeWakeListener();
        externalVoiceKeepAliveActive = true;
        activityForeground = true;
        touchCompanionListeningV53();
        try {
            webView.onResume();
            webView.resumeTimers();
        } catch (RuntimeException ignored) {}
        webView.postDelayed(() -> webView.evaluateJavascript(
'''
s = replace_once(s, old_wake, new_wake, "wake reactivates companion window")

old_dispatch = '''    private void dispatchNativeWake() {
        wakeListenerEnabled = false;
        if (wakeRecognizer != null) {
            try { wakeRecognizer.cancel(); } catch (Exception ignored) {}
        }
        webView.evaluateJavascript(
'''
new_dispatch = '''    private void dispatchNativeWake() {
        wakeListenerEnabled = false;
        if (wakeRecognizer != null) {
            try { wakeRecognizer.cancel(); } catch (Exception ignored) {}
        }
        if (NuboBackgroundListeningService.isRunning()
            && !NuboBackgroundListeningService.isCloudWindowActive()) {
            handleCompanionWakeV53();
            return;
        }
        webView.evaluateJavascript(
'''
s = replace_once(s, old_dispatch, new_dispatch, "native wake companion handoff")

old_resume_stop = '''        if (NuboBackgroundListeningService.isRunning()) {
            stopCompanionListeningV53();
        }
        if (!isNuboInPictureInPicture()) {
'''
new_resume_stop = '''        if (NuboBackgroundListeningService.isRunning()) {
            stopCompanionListeningV53();
            externalVoiceKeepAliveActive = false;
        }
        if (!isNuboInPictureInPicture()) {
'''
s = replace_once(s, old_resume_stop, new_resume_stop, "clear keepalive on manual return")

main.write_text(s)

service = Path("android-nubo/app/src/main/java/com/ainubo/nubo/NuboBackgroundListeningService.java")
s = service.read_text()
old_timeout = '''        Intent timeout = new Intent(ACTION_TIMEOUT);
        timeout.setPackage(getPackageName());
        sendBroadcast(timeout);
'''
new_timeout = '''        MainActivity.onCompanionTimeoutFromServiceV53();
'''
s = replace_once(s, old_timeout, new_timeout, "direct timeout callback")
service.write_text(s)

final_source = main.read_text()
for token in [
    "NUBO-Android/53",
    "android-v53",
    "externalVoiceKeepAliveActive = true",
    "touchCompanionListeningV53",
    "startNativeWakeListener();",
    "handleCompanionWakeV53();",
    "NuboBackgroundListeningService.isCloudWindowActive()",
    "prepareYouTubeMediaRouteV53",
    "YOUTUBE_RELAUNCH_GUARD_MS = 60_000L",
    '"com.google.android.youtube"',
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V53 marker: {token}")

service_source = service.read_text()
if "MainActivity.onCompanionTimeoutFromServiceV53();" not in service_source:
    raise SystemExit("missing V53 direct timeout callback")
if "sendBroadcast(timeout)" in service_source:
    raise SystemExit("V52 unhandled timeout broadcast still present")

print("Applied V53: synchronous background keepalive + direct timeout + native wake")
