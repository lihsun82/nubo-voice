from pathlib import Path
import runpy

# V64 builds on the validated V63 baseline. Only conversation sensitivity is changed.
runpy.run_path("scripts/apply-v63-voice-intent-guard.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 63", "versionCode 64", 1)
s = s.replace('versionName "0.63.0-voice-intent-youtube-guard"', 'versionName "0.64.0-conversation-sensitive"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v63", "android-v64")
s = s.replace("NUBO-Android/63", "NUBO-Android/64")
s = s.replace("bundle=v63", "bundle=v64")
s = s.replace("nubo_v63_bundle_flushed", "nubo_v64_bundle_flushed")
s = s.replace("nubo-v63-hide-panels", "nubo-v64-hide-panels")
main.write_text(s)

for token in ["versionCode 64", '0.64.0-conversation-sensitive']:
    if token not in app.read_text():
        raise SystemExit(f"missing V64 app marker: {token}")

main_final = main.read_text()
for token in [
    "NUBO-Android/64",
    "android-v64",
    "bundle=v64",
    "nubo-v64-hide-panels",
    ".question-history,.task-center,.capabilities{display:none!important}",
    "p.setVolume(72)",
    "createOnDeviceSpeechRecognizer",
]:
    if token not in main_final:
        raise SystemExit(f"missing V64 Android marker: {token}")

# Preserve Google Home authorization and SDK exactly from the V61+ baseline.
home = Path("android-nubo/app/src/googleHome/java/com/ainubo/nubo/googlehome/GoogleHomeGatewayImpl.kt").read_text()
for token in [
    "nubo_google_home_permission_v61",
    "CACHED_GRANTED",
    "REUSED_EXISTING",
    'sdk", "1.10.0"',
]:
    if token not in home:
        raise SystemExit(f"missing preserved Google Home marker: {token}")

print("Applied V64 Android: V63 baseline + conversation-sensitive web bundle")
