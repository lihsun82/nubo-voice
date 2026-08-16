from pathlib import Path
import runpy

# Preserve V74 Android baseline; V75 changes only version markers and web routing.
runpy.run_path("scripts/apply-v74-dom-youtube-banner.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 74", "versionCode 75", 1)
s = s.replace('versionName "0.74.0-dom-youtube-banner"', 'versionName "0.75.0-external-command-relay"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v74", "android-v75")
s = s.replace("NUBO-Android/74", "NUBO-Android/75")
s = s.replace("bundle=v74", "bundle=v75")
s = s.replace("nubo_v74_bundle_flushed", "nubo_v75_bundle_flushed")
s = s.replace("nubo-v74-hide-panels", "nubo-v75-hide-panels")
main.write_text(s)

for token in ["versionCode 75", '0.75.0-external-command-relay']:
    if token not in app.read_text():
        raise SystemExit(f"missing V75 app marker: {token}")

final = main.read_text()
for token in [
    "NUBO-Android/75",
    "android-v75",
    "bundle=v75",
    "beginExternalVoiceKeepAlive",
    "enterPictureInPictureMode",
    "createOnDeviceSpeechRecognizer",
    "openExternalApp",
    "playYouTubeNoSetup",
]:
    if token not in final:
        raise SystemExit(f"missing V75 preserved Android marker: {token}")

home = Path("android-nubo/app/src/googleHome/java/com/ainubo/nubo/googlehome/GoogleHomeGatewayImpl.kt").read_text()
for token in [
    "nubo_google_home_permission_v61",
    "CACHED_GRANTED",
    "REUSED_EXISTING",
    'putBoolean("granted", true).commit()',
    'sdk", "1.10.0"',
]:
    if token not in home:
        raise SystemExit(f"missing preserved Google Home marker: {token}")

print("Applied V75 Android: external-app command relay wrapper; existing bridges preserved")
