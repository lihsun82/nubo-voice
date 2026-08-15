from pathlib import Path
import runpy

runpy.run_path("scripts/apply-v65-response-sla.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 65", "versionCode 66", 1)
s = s.replace('versionName "0.65.0-response-sla"', 'versionName "0.66.0-voice-stability"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v65", "android-v66")
s = s.replace("NUBO-Android/65", "NUBO-Android/66")
s = s.replace("bundle=v65", "bundle=v66")
s = s.replace("nubo_v65_bundle_flushed", "nubo_v66_bundle_flushed")
s = s.replace("nubo-v65-hide-panels", "nubo-v66-hide-panels")
main.write_text(s)

for token in ["versionCode 66", '0.66.0-voice-stability']:
    if token not in app.read_text():
        raise SystemExit(f"missing V66 app marker: {token}")

main_final = main.read_text()
for token in [
    "NUBO-Android/66",
    "android-v66",
    "bundle=v66",
    "nubo-v66-hide-panels",
    ".question-history,.task-center,.capabilities{display:none!important}",
    "p.setVolume(72)",
    "createOnDeviceSpeechRecognizer",
]:
    if token not in main_final:
        raise SystemExit(f"missing V66 Android marker: {token}")

home = Path("android-nubo/app/src/googleHome/java/com/ainubo/nubo/googlehome/GoogleHomeGatewayImpl.kt").read_text()
for token in [
    "nubo_google_home_permission_v61",
    "CACHED_GRANTED",
    "REUSED_EXISTING",
    'sdk", "1.10.0"',
]:
    if token not in home:
        raise SystemExit(f"missing preserved Google Home marker: {token}")

print("Applied V66 Android: V65 baseline + voice loop stability bundle")
