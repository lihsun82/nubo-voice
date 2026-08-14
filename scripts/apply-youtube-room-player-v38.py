from pathlib import Path
import runpy

# Build from the validated V37 NUBO-owned player path, then apply only the
# room-music autoplay/version deltas. Google Home, Gemini voice/PiP, Sense/YAMNet
# and the V33 transcript fast route remain untouched.
runpy.run_path("scripts/apply-nubo-youtube-player-v37.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 37", "versionCode 38", "V38 versionCode")
s = replace_once(
    s,
    'versionName "0.37.0-nubo-youtube-playback-agent"',
    'versionName "0.38.0-room-music-autoplay"',
    "V38 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("v37-nubo-youtube-playback-agent", "v38-room-music-autoplay")
s = s.replace("android-v37", "android-v38")
s = s.replace("NUBO-Android/37", "NUBO-Android/38")
main.write_text(s)

player = Path(
    "android-nubo/app/src/main/java/com/ainubo/nubo/NuboYouTubePlayerActivity.java"
)
p = player.read_text()
required = [
    "NUBO-Android-Player/38",
    "setMediaPlaybackRequiresUserGesture(false)",
    "player.mute()",
    "loadVideoById({videoId:currentId,startSeconds:0})",
    "scheduleAudioPromotion",
    "onAutoplayBlocked",
]
for marker in required:
    if marker not in p:
        raise SystemExit(f"missing V38 room player marker: {marker}")

print("Applied V38 room music autoplay build")
