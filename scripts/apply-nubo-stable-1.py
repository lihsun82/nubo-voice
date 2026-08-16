from pathlib import Path
import runpy

# NUBO Stable 1.0
# Android baseline = V28 voice/UI + V29 Google Home + proven V9 YouTube direct launch.
# Google Maps stays on the proven V33 browser-tool behavior already present in source.
# Do not import V60-V75 experimental playback/maps/background layers.
runpy.run_path("scripts/apply-youtube-v9-restore-v43.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 43", "versionCode 1000", 1)
s = s.replace('versionName "0.43.0-youtube-v9-restore"', 'versionName "1.0.0-stable-youtube-v9-maps-v33"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v43", "stable-1")
s = s.replace("NUBO-Android/43", "NUBO-Stable/1.0")
main.write_text(s)

app_final = app.read_text()
main_final = main.read_text()
for token in [
    "versionCode 1000",
    'versionName "1.0.0-stable-youtube-v9-maps-v33"',
]:
    if token not in app_final:
        raise SystemExit(f"missing Stable 1.0 app marker: {token}")

for token in [
    "NUBO-Stable/1.0",
    "stable-1",
    "public boolean playYouTubeNoSetup",
    'normalizedLabel.equals("youtube")',
    'safeTarget.contains("youtube.com")',
    "activity.launchExternalTarget(safeTarget, safeLabel)",
    "public boolean googleHomeControl",
    "createOnDeviceSpeechRecognizer",
]:
    if token not in main_final:
        raise SystemExit(f"missing Stable 1.0 Android marker: {token}")

# The dedicated YouTube bridge must remain the exact V9 architecture:
# direct launch; no PiP, delay, accessibility or resolver experiments.
a = main_final.index("        public boolean playYouTubeNoSetup(")
b = main_final.index("        @JavascriptInterface\n        public boolean isExternalVoiceKeepAliveActive()", a)
bridge = main_final[a:b]
for forbidden in [
    "beginExternalVoiceKeepAlive",
    "enterPictureInPictureMode",
    "postDelayed",
    "NuboYouTubeAccessibilityService",
    "queryIntentActivities",
    "vnd.youtube:",
]:
    if forbidden in bridge:
        raise SystemExit(f"forbidden experimental YouTube layer in Stable 1.0: {forbidden}")

home = Path("android-nubo/app/src/googleHome/java/com/ainubo/nubo/googlehome/GoogleHomeGatewayImpl.kt").read_text()
for token in ['sdk", "1.10.0"', 'homeArtifact", "17.1.0"']:
    if token not in home:
        raise SystemExit(f"missing preserved Google Home marker: {token}")

print("Applied NUBO Stable 1.0: proven YouTube V9 Android path; Maps remains proven V33 web path")
