from pathlib import Path
import runpy

# V53 keeps the full V52 implementation and fixes the observed race only.
# The service already owns timeout + native wake callbacks; the missing piece is
# that Activity.onPause can happen before startForegroundService reaches onStartCommand.
# Set the existing keep-alive flag synchronously BEFORE launching YouTube.
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
s = s.replace("v52-native-exact-background", "v53-native-exact-background")
s = s.replace("v52-native-play-from-search-background", "v53-native-play-from-search-background")
s = s.replace("v52-native-url-fallback-background", "v53-native-url-fallback-background")

old_start = '''    private void startCompanionListeningV52() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) return;
        try {
            Intent serviceIntent = new Intent(this, NuboBackgroundListeningService.class);
'''
new_start = '''    private void startCompanionListeningV52() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) return;
        // V53: set synchronously before startForegroundService. Otherwise YouTube can
        // trigger Activity.onPause before the service flips cloudWindowActive=true,
        // causing WebView/Gemini microphone + timers to be paused immediately.
        externalVoiceKeepAliveActive = true;
        activityForeground = true;
        try {
            webView.onResume();
            webView.resumeTimers();
        } catch (RuntimeException ignored) {}
        try {
            Intent serviceIntent = new Intent(this, NuboBackgroundListeningService.class);
'''
s = replace_once(s, old_start, new_start, "synchronous keepalive before FGS")

old_catch = '''        } catch (RuntimeException ignored) {
            // Fail open: V51 YouTube playback must still work even if companion mode cannot start.
        }
    }
'''
new_catch = '''        } catch (RuntimeException ignored) {
            externalVoiceKeepAliveActive = false;
            // Fail open: V51 YouTube playback must still work even if companion mode cannot start.
        }
    }
'''
s = replace_once(s, old_catch, new_catch, "clear keepalive when FGS start fails")

main.write_text(s)

final_source = main.read_text()
for token in [
    "NUBO-Android/53",
    "android-v53",
    "externalVoiceKeepAliveActive = true",
    "startCompanionListeningV52",
    "NuboBackgroundListeningService.isCloudWindowActive()",
    "onCompanionTimeoutFromService",
    "onCompanionWakeFromService",
    "prepareYouTubeMediaRouteV52",
    "YOUTUBE_RELAUNCH_GUARD_MS = 60_000L",
    '"com.google.android.youtube"',
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V53 marker: {token}")

service = Path("android-nubo/app/src/main/java/com/ainubo/nubo/NuboBackgroundListeningService.java").read_text()
for token in [
    "MainActivity.onCompanionTimeoutFromService();",
    "MainActivity.onCompanionWakeFromService();",
    "RecognizerIntent.EXTRA_PREFER_OFFLINE",
    "ACTIVE_WINDOW_MS = 30_000L",
]:
    if token not in service:
        raise SystemExit(f"missing V52 service capability required by V53: {token}")

print("Applied V53: deterministic pre-YouTube background keepalive; V52 timeout/wake preserved")
