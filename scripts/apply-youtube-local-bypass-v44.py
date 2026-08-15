from pathlib import Path
import runpy

# V44 keeps the exact V43/V9 Android YouTube launch behavior unchanged.
# The functional change is in web/local-voice-commands.ts: YouTube playback
# commands are intercepted from the live transcript and sent directly to the
# native bridge, bypassing model tool calls and mobile-direct-app routing.
runpy.run_path("scripts/apply-youtube-v9-restore-v43.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 43", "versionCode 44", "V44 versionCode")
s = replace_once(
    s,
    'versionName "0.43.0-youtube-v9-restore"',
    'versionName "0.44.0-youtube-local-transcript-bypass"',
    "V44 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v43", "android-v44")
s = s.replace("NUBO-Android/43", "NUBO-Android/44")
main.write_text(s)

final_source = main.read_text()
for token in [
    "public boolean playYouTubeNoSetup",
    'normalizedLabel.equals("youtube")',
    "activity.launchExternalTarget(safeTarget, safeLabel)",
    "android-v44",
    "NUBO-Android/44",
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V44 marker: {token}")

# The V9 bridge must remain simple: no PiP/delay/accessibility layers.
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
        raise SystemExit(f"forbidden layer in V44 YouTube bridge: {forbidden}")

print("Applied V44: V43/V9 native launch + local transcript bypass marker")
