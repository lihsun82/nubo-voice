from pathlib import Path
import runpy

# V63 keeps the validated V62/V61 Google Home + YouTube + UI baseline and
# refreshes the Android bundle/version so the new V63 web voice-intent guard is used.
runpy.run_path("scripts/apply-v62-hotel-monitor-bridge.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 62", "versionCode 63", 1)
s = s.replace('versionName "0.62.0-hotel-monitor-live-bridge"', 'versionName "0.63.0-voice-intent-youtube-guard"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v62", "android-v63")
s = s.replace("NUBO-Android/62", "NUBO-Android/63")
s = s.replace("bundle=v62", "bundle=v63")
s = s.replace("nubo_v62_bundle_flushed", "nubo_v63_bundle_flushed")
s = s.replace("nubo-v62-hide-panels", "nubo-v63-hide-panels")
main.write_text(s)

for token in ["versionCode 63", '0.63.0-voice-intent-youtube-guard']:
    if token not in app.read_text():
        raise SystemExit(f"missing V63 app marker: {token}")

main_final = main.read_text()
for token in [
    "NUBO-Android/63",
    "android-v63",
    "bundle=v63",
    "nubo-v63-hide-panels",
    ".question-history,.task-center,.capabilities{display:none!important}",
    "p.setVolume(72)",
    "createOnDeviceSpeechRecognizer",
]:
    if token not in main_final:
        raise SystemExit(f"missing V63 Android marker: {token}")

# Preserve the existing Google Home authorization preference key deliberately.
home = Path("android-nubo/app/src/googleHome/java/com/ainubo/nubo/googlehome/GoogleHomeGatewayImpl.kt").read_text()
for token in [
    "nubo_google_home_permission_v61",
    "CACHED_GRANTED",
    "REUSED_EXISTING",
    'sdk", "1.10.0"',
]:
    if token not in home:
        raise SystemExit(f"missing preserved Google Home marker: {token}")

print("Applied V63 Android: V62 baseline + voice intent / YouTube guard bundle refresh")
