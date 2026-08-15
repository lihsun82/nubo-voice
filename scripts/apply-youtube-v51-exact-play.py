from pathlib import Path
import runpy

# V51 starts from V50: successful V48 YouTube handoff + persistent relaunch guard.
# Only YouTube is changed. Before every YouTube Activity handoff Android is reset
# to normal media routing, matching the useful part of the old V14.7 speaker fix.
runpy.run_path("scripts/apply-youtube-v50-native-guard.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 50", "versionCode 51", "V51 versionCode")
s = replace_once(
    s,
    'versionName "0.50.0-youtube-native-autoplay-guard"',
    'versionName "0.51.0-youtube-exact-play-media-route"',
    "V51 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v50", "android-v51")
s = s.replace("NUBO-Android/50", "NUBO-Android/51")
s = s.replace("bundle=v50", "bundle=v51")
s = s.replace("nubo_v50_bundle_flushed", "nubo_v51_bundle_flushed")
s = s.replace("nubo_youtube_v50", "nubo_youtube_v51")
s = s.replace("handleYouTubeIntentV50", "handleYouTubeIntentV51")
s = s.replace("isDuplicateYouTubeLaunchV50", "isDuplicateYouTubeLaunchV51")
s = s.replace("startYouTubeIntentV50", "startYouTubeIntentV51")
s = s.replace("v50-native-exact", "v51-native-exact-media")
s = s.replace("v50-native-play-from-search", "v51-native-play-from-search-media")
s = s.replace("v50-native-url-fallback", "v51-native-url-fallback-media")

if "import android.media.AudioManager;" not in s:
    s = replace_once(
        s,
        "import android.media.AudioAttributes;\n",
        "import android.media.AudioAttributes;\nimport android.media.AudioManager;\n",
        "AudioManager import",
    )

method_marker = "    private boolean startYouTubeIntentV51(Intent intent) {\n"
helper = r'''    private void prepareYouTubeMediaRouteV51() {
        try {
            AudioManager audio = (AudioManager) getSystemService(AUDIO_SERVICE);
            if (audio == null) return;
            // V14.7 principle, scoped to YouTube only: leave communication/call mode
            // before handing playback to YouTube so media uses STREAM_MUSIC/speaker.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try { audio.clearCommunicationDevice(); } catch (RuntimeException ignored) {}
            }
            audio.setMode(AudioManager.MODE_NORMAL);
            setVolumeControlStream(AudioManager.STREAM_MUSIC);
        } catch (RuntimeException ignored) {
            // Audio routing must never block YouTube launch.
        }
    }

'''
s = replace_once(s, method_marker, helper + method_marker, "V51 media-route helper")

old_start = '''    private boolean startYouTubeIntentV51(Intent intent) {
        if (intent == null) return false;
        try {
            startActivity(intent);
'''
new_start = '''    private boolean startYouTubeIntentV51(Intent intent) {
        if (intent == null) return false;
        try {
            prepareYouTubeMediaRouteV51();
            startActivity(intent);
'''
s = replace_once(s, old_start, new_start, "V51 media route before YouTube start")

main.write_text(s)

final_source = main.read_text()
for token in [
    "NUBO-Android/51",
    "android-v51",
    "nubo_v51_bundle_flushed",
    "handleYouTubeIntentV51",
    "prepareYouTubeMediaRouteV51",
    "AudioManager.MODE_NORMAL",
    "AudioManager.STREAM_MUSIC",
    "MediaStore.INTENT_ACTION_VIDEO_PLAY_FROM_SEARCH",
    "YOUTUBE_RELAUNCH_GUARD_MS = 60_000L",
    '"com.google.android.youtube"',
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V51 marker: {token}")

print("Applied V51: YouTube exact-play + V14.7 multimedia media-route principle")
