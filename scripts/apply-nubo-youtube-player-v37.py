from pathlib import Path
import runpy

# V37 starts from the fully validated V36 zero-accessibility build. It preserves
# Google Home, Gemini voice, PiP, Sense/YAMNet, avatar/UI and the V36 external
# YouTube fallbacks, but makes NUBO's own YouTube PlayerActivity the primary path.
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

bridge_marker = '''        @JavascriptInterface
        public boolean startWakeListener() {
'''

bridge = r'''        @JavascriptInterface
        public boolean openNuboYouTubePlayer(
            String targetUrl,
            String title,
            String channel
        ) {
            if (targetUrl == null) return false;

            String safeTarget = targetUrl.trim();
            if (safeTarget.isEmpty()) return false;

            Uri target = Uri.parse(safeTarget);
            String videoId = activity.extractYouTubeVideoId(target);
            if (videoId == null || !videoId.matches("^[A-Za-z0-9_-]{11}$")) {
                return false;
            }

            String safeTitle = title == null ? "" : title.trim();
            String safeChannel = channel == null ? "" : channel.trim();

            activity.runOnUiThread(() -> {
                // Once the NUBO player is already foreground, never launch another
                // Activity or third-party YouTube task. Deliver the new video ID
                // directly to the existing player through an in-app broadcast.
                if (NuboYouTubePlayerActivity.isRunning()) {
                    NuboYouTubePlayerActivity.sendSongSwitch(
                        activity,
                        videoId,
                        safeTitle,
                        safeChannel
                    );
                    return;
                }

                // First song only: keep the Gemini voice session alive in PiP and
                // open NUBO's own player in a separate task. Subsequent switches do
                // not touch task management at all.
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
                        safeTitle
                    );
                    playerIntent.putExtra(
                        NuboYouTubePlayerActivity.EXTRA_CHANNEL,
                        safeChannel
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
                        // The web layer retains V36 as a fail-open fallback.
                    }
                }, delayMs);
            });
            return true;
        }

'''

if "public boolean openNuboYouTubePlayer" not in s:
    s = replace_once(
        s,
        bridge_marker,
        bridge + bridge_marker,
        "V37 NUBO YouTube player bridge",
    )

s = s.replace("android-v36", "android-v37")
s = s.replace("NUBO-Android/36", "NUBO-Android/37")
main.write_text(s)

print("Applied V37 NUBO-owned YouTube playback agent")
