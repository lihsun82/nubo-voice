from pathlib import Path
import runpy

# V40 deliberately starts from V39 so first-song behavior, Google Home 1.10.0,
# Gemini/PiP voice keepalive, Sense/YAMNet and all non-YouTube app routing remain
# unchanged. Only repeated YouTube song switching changes architecture.
runpy.run_path("scripts/apply-youtube-native-app-v39.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 39", "versionCode 40", "V40 versionCode")
s = replace_once(
    s,
    'versionName "0.39.0-native-youtube-app-restored"',
    'versionName "0.40.0-hybrid-youtube-ui-switch"',
    "V40 versionName",
)
app.write_text(s)

manifest = Path("android-nubo/app/src/main/AndroidManifest.xml")
manifest_text = manifest.read_text()
required_manifest = [
    ".NuboYouTubeAccessibilityService",
    "android.permission.BIND_ACCESSIBILITY_SERVICE",
    "@xml/nubo_youtube_accessibility_service",
]
for token in required_manifest:
    if token not in manifest_text:
        raise SystemExit(f"missing V40 accessibility manifest marker: {token}")

service = Path(
    "android-nubo/app/src/main/java/com/ainubo/nubo/NuboYouTubeAccessibilityService.java"
)
config = Path("android-nubo/app/src/main/res/xml/nubo_youtube_accessibility_service.xml")
if not service.exists() or not config.exists():
    raise SystemExit("missing V40 YouTube accessibility controller files")

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

# Intercept only REPEATED YouTube requests. The first song still uses the V39
# exact native YouTube deep link. Once NUBO is already in PiP, V40 controls the
# foreground YouTube UI instead of sending another ACTION_VIEW that YouTube may
# swallow by reusing its existing task.
needle = '''            if (safeTarget.isEmpty() || safeLabel.isEmpty()) return false;
            if (!activity.isAllowedBridgeTarget(safeTarget, safeLabel)) return false;

            activity.runOnUiThread(() -> {
'''
replacement = '''            if (safeTarget.isEmpty() || safeLabel.isEmpty()) return false;
            if (!activity.isAllowedBridgeTarget(safeTarget, safeLabel)) return false;

            boolean repeatedYouTubeRequest = activity.isNuboInPictureInPicture();
            if (repeatedYouTubeRequest && NuboYouTubeAccessibilityService.isReady()) {
                String uiQuery = safeQuery.isEmpty() ? safeLabel : safeQuery;
                if (NuboYouTubeAccessibilityService.requestSongSwitch(uiQuery)) {
                    return true;
                }
            }

            // Android does not allow an app to silently grant its own
            // AccessibilityService. If this is the first repeated-song request
            // after installing V40, open the one-time settings page instead of
            // pretending another deep link succeeded. After the user enables
            // "NUBO YouTube Control", later switches are zero-tap.
            if (repeatedYouTubeRequest && !NuboYouTubeAccessibilityService.isReady()) {
                activity.runOnUiThread(() -> {
                    try {
                        Intent settingsIntent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                        activity.startActivity(settingsIntent);
                    } catch (RuntimeException ignored) {
                        // Fail open to V39 below only if settings itself cannot open.
                        activity.launchExactYouTubeVideo(safeQuery, safeTarget, safeLabel);
                    }
                });
                return true;
            }

            activity.runOnUiThread(() -> {
'''
s = replace_once(s, needle, replacement, "V40 repeated-song UI interception")

# Expose status/setup hooks to the web layer as well. Native interception above is
# still authoritative, so this remains reliable even if WebView has stale JS.
bridge_marker = '''        @JavascriptInterface
        public boolean isExternalVoiceKeepAliveActive() {
'''
bridge = '''        @JavascriptInterface
        public boolean isYouTubeUiAgentReady() {
            return NuboYouTubeAccessibilityService.isReady();
        }

        @JavascriptInterface
        public boolean openYouTubeControlSettings() {
            activity.runOnUiThread(() -> {
                try {
                    activity.startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
                } catch (RuntimeException ignored) {
                    // Settings availability is device-specific; keep NUBO alive.
                }
            });
            return true;
        }

'''
s = replace_once(s, bridge_marker, bridge + bridge_marker, "V40 JS status bridge")

s = s.replace("android-v39", "android-v40")
s = s.replace("NUBO-Android/39", "NUBO-Android/40")
main.write_text(s)

final_source = main.read_text()
required = [
    "NuboYouTubeAccessibilityService.isReady()",
    "NuboYouTubeAccessibilityService.requestSongSwitch(uiQuery)",
    "Settings.ACTION_ACCESSIBILITY_SETTINGS",
    "public boolean isYouTubeUiAgentReady()",
    "public boolean openYouTubeControlSettings()",
    "v39-runtime-deeplink-handler",
    "v39-v15-6-41-legacy-app-link",
]
for token in required:
    if token not in final_source:
        raise SystemExit(f"missing V40 hybrid YouTube marker: {token}")

service_source = service.read_text()
for token in [
    "requestSongSwitch",
    "ACTION_SET_TEXT",
    "ACTION_IME_ENTER",
    "secondPassIfSearchStillVisible",
    "do NOT use a generic Pause",
    "dispatchGesture",
]:
    if token not in service_source:
        raise SystemExit(f"missing V40 controller marker: {token}")

print("Applied V40: V39 first launch + foreground YouTube UI switching for repeats")
