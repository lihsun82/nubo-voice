from pathlib import Path
import runpy

# V37 starts from the fully validated V36 zero-accessibility build. It preserves
# Google Home, Gemini voice, PiP, Sense/YAMNet, avatar/UI and the V36 external
# YouTube fallback, but replaces V36's PRIMARY playback implementation with a
# NUBO-owned YouTube IFrame player.
runpy.run_path("scripts/apply-youtube-no-accessibility-v36.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 36", "versionCode 37", "V37 versionCode")
s = replace_once(
    s,
    'versionName "0.36.0-youtube-no-accessibility"',
    'versionName "0.37.0-nubo-youtube-playback-agent"',
    "V37 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

method_start_marker = '''        @JavascriptInterface
        public boolean playYouTubeNoSetup(
'''
method_end_marker = '''        @JavascriptInterface
        public boolean startWakeListener() {
'''

method_start = s.find(method_start_marker)
method_end = s.find(method_end_marker, method_start + 1)
if method_start < 0 or method_end < 0:
    raise SystemExit("missing V36 playYouTubeNoSetup bridge boundaries")

bridge = r'''        @JavascriptInterface
        public boolean playYouTubeNoSetup(
            String query,
            String targetUrl,
            String label
        ) {
            if (targetUrl == null || label == null) return false;

            String safeQuery = query == null ? "" : query.trim();
            String safeTarget = targetUrl.trim();
            String safeLabel = label.trim();
            if (safeTarget.isEmpty() || safeLabel.isEmpty()) return false;
            if (!activity.isAllowedBridgeTarget(safeTarget, safeLabel)) return false;

            Uri target = Uri.parse(safeTarget);
            String videoId = activity.extractYouTubeVideoId(target);
            if (videoId == null || !videoId.matches("^[A-Za-z0-9_-]{11}$")) {
                // Keep the proven V36 package-scoped fallback for unusual URLs.
                activity.runOnUiThread(() -> activity.launchYouTubeNoSetup(
                    safeQuery,
                    safeTarget,
                    safeLabel
                ));
                return true;
            }

            activity.runOnUiThread(() -> {
                // Critical V37 path: when the NUBO player is already visible, do
                // not launch ANY activity. Send the new videoId to the existing
                // same-process player; it calls YouTube IFrame loadVideoById().
                if (NuboYouTubePlayerActivity.isRunning()) {
                    NuboYouTubePlayerActivity.sendSongSwitch(
                        activity,
                        videoId,
                        safeQuery,
                        ""
                    );
                    return;
                }

                // First song only: keep Gemini voice alive in PiP and open NUBO's
                // own player in a separate task. No accessibility or notification
                // permission is involved.
                boolean alreadyInPip = activity.isNuboInPictureInPicture();
                if (!alreadyInPip) {
                    activity.beginExternalVoiceKeepAlive();
                } else {
                    activity.externalVoiceKeepAliveActive = true;
                    activity.activityForeground = true;
                    activity.webView.resumeTimers();
                }

                long delayMs = alreadyInPip ? 40L : 180L;
                activity.webView.postDelayed(() -> {
                    Intent playerIntent = new Intent(
                        activity,
                        NuboYouTubePlayerActivity.class
                    );
                    playerIntent.putExtra(
                        NuboYouTubePlayerActivity.EXTRA_VIDEO_ID,
                        videoId
                    );
                    playerIntent.putExtra(
                        NuboYouTubePlayerActivity.EXTRA_TITLE,
                        safeQuery
                    );
                    playerIntent.putExtra(
                        NuboYouTubePlayerActivity.EXTRA_CHANNEL,
                        ""
                    );
                    playerIntent.putExtra(
                        "nubo_youtube_player_build",
                        "v37-nubo-youtube-playback-agent"
                    );
                    playerIntent.addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                    );

                    try {
                        activity.startActivity(playerIntent);
                    } catch (RuntimeException ignored) {
                        // Fail open to the validated V36 external YouTube path.
                        activity.launchYouTubeNoSetup(
                            safeQuery,
                            safeTarget,
                            safeLabel
                        );
                    }
                }, delayMs);
            });
            return true;
        }

'''

s = s[:method_start] + bridge + s[method_end:]
s = s.replace("android-v36", "android-v37")
s = s.replace("NUBO-Android/36", "NUBO-Android/37")
main.write_text(s)

print("Applied V37 NUBO-owned YouTube playback agent")
