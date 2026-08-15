from pathlib import Path

# V43 is intentionally a minimal YouTube-only patch applied after V28 + V29.
# It restores the proven V9 Android launch behavior for YouTube:
#   runOnUiThread -> launchExternalTarget -> ACTION_VIEW(package=YouTube)
# No pre-launch PiP, no delay, no accessibility, no resolver scoring.
# Every non-YouTube route remains on the existing V28/V29 behavior.


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 29", "versionCode 43", "V43 versionCode")
s = replace_once(
    s,
    'versionName "0.29.0-googlehome"',
    'versionName "0.43.0-youtube-v9-restore"',
    "V43 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

# Dedicated modern web hook: execute the exact V9 YouTube launch path immediately.
bridge_marker = '''        @JavascriptInterface
        public boolean isExternalVoiceKeepAliveActive() {
'''
bridge = '''        @JavascriptInterface
        public boolean playYouTubeNoSetup(
            String query,
            String targetUrl,
            String label
        ) {
            if (targetUrl == null || label == null) return false;
            String safeTarget = targetUrl.trim();
            String safeLabel = label.trim();
            if (safeTarget.isEmpty() || safeLabel.isEmpty()) return false;
            if (!activity.isAllowedBridgeTarget(safeTarget, safeLabel)) return false;

            // V43 = exact V9 behavior: launch YouTube directly from the UI thread.
            // Do not enter PiP first and do not delay the Activity handoff.
            activity.runOnUiThread(
                () -> activity.launchExternalTarget(safeTarget, safeLabel)
            );
            return true;
        }

'''
s = replace_once(s, bridge_marker, bridge + bridge_marker, "V43 direct YouTube JS bridge")

# Stale/current web fallback guard. If the web layer calls openExternalApp instead
# of playYouTubeNoSetup, YouTube must STILL use the same V9 direct launch. Other
# apps continue through the untouched keepalive/PiP route below.
needle = '''            if (!activity.isAllowedBridgeTarget(safeTarget, safeLabel)) {
                return false;
            }

            activity.runOnUiThread(() -> {
'''
replacement = '''            if (!activity.isAllowedBridgeTarget(safeTarget, safeLabel)) {
                return false;
            }

            String normalizedLabel = safeLabel.toLowerCase(Locale.ROOT);
            boolean youtubeTarget = normalizedLabel.equals("youtube")
                || normalizedLabel.equals("youtube music")
                || safeTarget.contains("youtube.com")
                || safeTarget.contains("youtu.be");
            if (youtubeTarget) {
                // V9 proven path: no PiP / no delay before YouTube startActivity().
                activity.runOnUiThread(
                    () -> activity.launchExternalTarget(safeTarget, safeLabel)
                );
                return true;
            }

            activity.runOnUiThread(() -> {
'''
s = replace_once(s, needle, replacement, "V43 stale-web YouTube fallback")

# Build markers only; do not alter voice, Google Home, Sense, or app routing code.
s = s.replace("android-v28", "android-v43")
s = s.replace("NUBO-Android/28", "NUBO-Android/43")
main.write_text(s)

final_source = main.read_text()
for token in [
    "public boolean playYouTubeNoSetup",
    'normalizedLabel.equals("youtube")',
    'safeTarget.contains("youtube.com")',
    "activity.launchExternalTarget(safeTarget, safeLabel)",
    "android-v43",
    "NUBO-Android/43",
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V43 V9-restore marker: {token}")

# Guard the dedicated method against accidentally reintroducing the failed layers.
start = final_source.index("        public boolean playYouTubeNoSetup(")
end = final_source.index("        @JavascriptInterface\n        public boolean isExternalVoiceKeepAliveActive()", start)
youtube_bridge = final_source[start:end]
for forbidden in [
    "beginExternalVoiceKeepAlive",
    "enterPictureInPictureMode",
    "postDelayed",
    "NuboYouTubeAccessibilityService",
    "queryIntentActivities",
    "vnd.youtube:",
]:
    if forbidden in youtube_bridge:
        raise SystemExit(f"forbidden non-V9 layer in V43 YouTube bridge: {forbidden}")

print("Applied V43: restored V9 direct YouTube App launch only; all other routes unchanged")
