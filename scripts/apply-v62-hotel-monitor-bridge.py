from pathlib import Path
import runpy

# Build directly on the validated V61 Android baseline.
runpy.run_path("scripts/apply-v61-smart-assistant.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 61", "versionCode 62", 1)
s = s.replace('versionName "0.61.0-smart-assistant-persistent-home"', 'versionName "0.62.0-hotel-monitor-live-bridge"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v61", "android-v62")
s = s.replace("NUBO-Android/61", "NUBO-Android/62")
s = s.replace("bundle=v61", "bundle=v62")
s = s.replace("nubo_v61_bundle_flushed", "nubo_v62_bundle_flushed")
s = s.replace("nubo-v61-hide-panels", "nubo-v62-hide-panels")
main.write_text(s)

# IMPORTANT: do not rename nubo_google_home_permission_v61. Keeping the same preference
# key is what lets V62 reuse the Google Home authorization established by V61.
for token in ["versionCode 62", '0.62.0-hotel-monitor-live-bridge']:
    if token not in app.read_text():
        raise SystemExit(f"missing V62 app marker: {token}")

main_final = main.read_text()
for token in [
    "NUBO-Android/62",
    "android-v62",
    "bundle=v62",
    ".question-history,.task-center,.capabilities{display:none!important}",
    "p.setVolume(72)",
    "createOnDeviceSpeechRecognizer",
]:
    if token not in main_final:
        raise SystemExit(f"missing V62 Android marker: {token}")

home = Path("android-nubo/app/src/googleHome/java/com/ainubo/nubo/googlehome/GoogleHomeGatewayImpl.kt").read_text()
for token in [
    "nubo_google_home_permission_v61",
    "CACHED_GRANTED",
    "REUSED_EXISTING",
    'sdk", "1.10.0"',
]:
    if token not in home:
        raise SystemExit(f"missing preserved Google Home marker: {token}")

print("Applied V62 Android: V61 baseline + fresh WebView bundle for live AinuboX1 hotel monitor bridge")
