from pathlib import Path
import runpy

# V52 starts from the proven V51 YouTube baseline.
# Only YouTube handoff/lifecycle is extended: keep the WebView/Gemini microphone
# alive for 30s behind YouTube via a microphone foreground service, then stop the
# cloud session and enter local wake-word mode. No other app route is changed.
runpy.run_path("scripts/apply-youtube-v51-exact-play.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 51", "versionCode 52", "V52 versionCode")
s = replace_once(
    s,
    'versionName "0.51.0-youtube-exact-play-media-route"',
    'versionName "0.52.0-youtube-background-listening"',
    "V52 versionName",
)
app.write_text(s)

manifest = Path("android-nubo/app/src/main/AndroidManifest.xml")
s = manifest.read_text()
if 'android.permission.FOREGROUND_SERVICE"' not in s:
    s = replace_once(
        s,
        '    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />\n',
        '    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />\n'
        '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n'
        '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />\n',
        "foreground-service permissions",
    )
service = '''\n        <service\n            android:name=".NuboBackgroundListeningService"\n            android:exported="false"\n            android:foregroundServiceType="microphone"\n            android:stopWithTask="false" />\n'''
if '.NuboBackgroundListeningService' not in s:
    s = replace_once(s, '    </application>\n', service + '    </application>\n', "V52 service manifest")
manifest.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v51", "android-v52")
s = s.replace("NUBO-Android/51", "NUBO-Android/52")
s = s.replace("bundle=v51", "bundle=v52")
s = s.replace("nubo_v51_bundle_flushed", "nubo_v52_bundle_flushed")
s = s.replace("nubo_youtube_v51", "nubo_youtube_v52")
s = s.replace("handleYouTubeIntentV51", "handleYouTubeIntentV52")
s = s.replace("isDuplicateYouTubeLaunchV51", "isDuplicateYouTubeLaunchV52")
s = s.replace("startYouTubeIntentV51", "startYouTubeIntentV52")
s = s.replace("prepareYouTubeMediaRouteV51", "prepareYouTubeMediaRouteV52")
s = s.replace("v51-native-exact-media", "v52-native-exact-background")
s = s.replace("v51-native-play-from-search-media", "v52-native-play-from-search-background")
s = s.replace("v51-native-url-fallback-media", "v52-native-url-fallback-background")

field_marker = '    private volatile boolean externalVoiceKeepAliveActive = false;\n'
field_block = '''    private volatile boolean externalVoiceKeepAliveActive = false;\n    private static volatile MainActivity companionActivityV52;\n'''
s = replace_once(s, field_marker, field_block, "V52 activity reference")

create_marker = '        super.onCreate(savedInstanceState);\n\n'
s = replace_once(
    s,
    create_marker,
    '        super.onCreate(savedInstanceState);\n        companionActivityV52 = this;\n\n',
    "V52 onCreate activity reference",
)

method_marker = '    private boolean startYouTubeIntentV52(Intent intent) {\n'
helpers = r'''    private void startCompanionListeningV52() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) return;
        try {
            Intent serviceIntent = new Intent(this, NuboBackgroundListeningService.class);
            serviceIntent.setAction(NuboBackgroundListeningService.ACTION_START);
            startForegroundService(serviceIntent);
        } catch (RuntimeException ignored) {
            // Fail open: V51 YouTube playback must still work even if companion mode cannot start.
        }
    }

    private void stopCompanionListeningV52() {
        try {
            Intent serviceIntent = new Intent(this, NuboBackgroundListeningService.class);
            serviceIntent.setAction(NuboBackgroundListeningService.ACTION_STOP);
            startService(serviceIntent);
        } catch (RuntimeException ignored) {}
    }

    public static void onCompanionTimeoutFromService() {
        MainActivity activity = companionActivityV52;
        if (activity == null) return;
        activity.runOnUiThread(activity::handleCompanionTimeoutV52);
    }

    public static void onCompanionWakeFromService() {
        MainActivity activity = companionActivityV52;
        if (activity == null) return;
        activity.runOnUiThread(activity::handleCompanionWakeV52);
    }

    private void handleCompanionTimeoutV52() {
        externalVoiceKeepAliveActive = false;
        activityForeground = false;
        stopSenseAmbientCapture();
        // Click the existing Disconnect button so Gemini Live, microphone and playback
        // are actually closed after 30 seconds. This avoids cloud token use while sleeping.
        webView.evaluateJavascript(
            "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('結束對話'));if(b)b.click();})();",
            null
        );
        webView.postDelayed(() -> {
            try {
                webView.onPause();
                webView.pauseTimers();
            } catch (RuntimeException ignored) {}
        }, 450L);
    }

    private void handleCompanionWakeV52() {
        activityForeground = true;
        try {
            webView.onResume();
            webView.resumeTimers();
        } catch (RuntimeException ignored) {}
        webView.postDelayed(() -> webView.evaluateJavascript(
            "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('啟動NUBO'));if(b)b.click();window.dispatchEvent(new CustomEvent('nubo:native-wake',{detail:{source:'android-v52-companion'}}));})();",
            null
        ), 180L);
    }

'''
s = replace_once(s, method_marker, helpers + method_marker, "V52 companion helpers")

old_start = '''    private boolean startYouTubeIntentV52(Intent intent) {
        if (intent == null) return false;
        try {
            prepareYouTubeMediaRouteV52();
            startActivity(intent);
'''
new_start = '''    private boolean startYouTubeIntentV52(Intent intent) {
        if (intent == null) return false;
        try {
            startCompanionListeningV52();
            prepareYouTubeMediaRouteV52();
            startActivity(intent);
'''
s = replace_once(s, old_start, new_start, "V52 service before YouTube")

old_pause = '''        final boolean keepVoiceAlive =
            externalVoiceKeepAliveActive || isNuboInPictureInPicture();
'''
new_pause = '''        final boolean keepVoiceAlive =
            externalVoiceKeepAliveActive
                || isNuboInPictureInPicture()
                || NuboBackgroundListeningService.isCloudWindowActive();
'''
s = replace_once(s, old_pause, new_pause, "V52 onPause keep-alive")

old_resume = '''        activityForeground = true;
        if (!isNuboInPictureInPicture()) {
'''
new_resume = '''        activityForeground = true;
        if (NuboBackgroundListeningService.isRunning()) {
            stopCompanionListeningV52();
        }
        if (!isNuboInPictureInPicture()) {
'''
s = replace_once(s, old_resume, new_resume, "V52 stop service on normal foreground return")

old_destroy = '''    protected void onDestroy() {
        activityForeground = false;
'''
new_destroy = '''    protected void onDestroy() {
        activityForeground = false;
        if (companionActivityV52 == this) companionActivityV52 = null;
'''
s = replace_once(s, old_destroy, new_destroy, "V52 clear activity reference")

main.write_text(s)

final_source = main.read_text()
for token in [
    "NUBO-Android/52",
    "android-v52",
    "nubo_v52_bundle_flushed",
    "handleYouTubeIntentV52",
    "startCompanionListeningV52",
    "NuboBackgroundListeningService.isCloudWindowActive()",
    "onCompanionTimeoutFromService",
    "onCompanionWakeFromService",
    "結束對話",
    "啟動NUBO",
    "prepareYouTubeMediaRouteV52",
    "AudioManager.MODE_NORMAL",
    "YOUTUBE_RELAUNCH_GUARD_MS = 60_000L",
    '"com.google.android.youtube"',
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V52 marker: {token}")

manifest_source = manifest.read_text()
for token in [
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_MICROPHONE",
    ".NuboBackgroundListeningService",
    'android:foregroundServiceType="microphone"',
]:
    if token not in manifest_source:
        raise SystemExit(f"missing V52 manifest marker: {token}")

print("Applied V52: YouTube foreground + NUBO 30s background listening + native wake")
