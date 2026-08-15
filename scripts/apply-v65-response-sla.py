from pathlib import Path
import runpy

runpy.run_path("scripts/apply-v64-conversation-sensitive.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 64", "versionCode 65", 1)
s = s.replace('versionName "0.64.0-conversation-sensitive"', 'versionName "0.65.0-response-sla"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v64", "android-v65")
s = s.replace("NUBO-Android/64", "NUBO-Android/65")
s = s.replace("bundle=v64", "bundle=v65")
s = s.replace("nubo_v64_bundle_flushed", "nubo_v65_bundle_flushed")
s = s.replace("nubo-v64-hide-panels", "nubo-v65-hide-panels")
main.write_text(s)

for token in ["versionCode 65", '0.65.0-response-sla']:
    if token not in app.read_text():
        raise SystemExit(f"missing V65 app marker: {token}")

main_final = main.read_text()
for token in [
    "NUBO-Android/65",
    "android-v65",
    "bundle=v65",
    "nubo-v65-hide-panels",
    ".question-history,.task-center,.capabilities{display:none!important}",
    "p.setVolume(72)",
    "createOnDeviceSpeechRecognizer",
]:
    if token not in main_final:
        raise SystemExit(f"missing V65 Android marker: {token}")

home = Path("android-nubo/app/src/googleHome/java/com/ainubo/nubo/googlehome/GoogleHomeGatewayImpl.kt").read_text()
for token in [
    "nubo_google_home_permission_v61",
    "CACHED_GRANTED",
    "REUSED_EXISTING",
    'sdk", "1.10.0"',
]:
    if token not in home:
        raise SystemExit(f"missing preserved Google Home marker: {token}")

print("Applied V65 Android: V64 baseline + 2.5-second audible response SLA bundle")
