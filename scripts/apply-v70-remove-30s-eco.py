from pathlib import Path
import runpy

# Preserve the validated V69 baseline exactly. V70 changes only the web voice idle policy
# plus Android version/bundle markers so the user can identify/install the build.
runpy.run_path("scripts/apply-v69-restore-v33-maps.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 69", "versionCode 70", 1)
s = s.replace('versionName "0.69.0-v33-maps-restore-only"', 'versionName "0.70.0-no-30s-eco"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v69", "android-v70")
s = s.replace("NUBO-Android/69", "NUBO-Android/70")
s = s.replace("bundle=v69", "bundle=v70")
s = s.replace("nubo_v69_bundle_flushed", "nubo_v70_bundle_flushed")
s = s.replace("nubo-v69-hide-panels", "nubo-v70-hide-panels")
main.write_text(s)

for token in ["versionCode 70", '0.70.0-no-30s-eco']:
    if token not in app.read_text():
        raise SystemExit(f"missing V70 app marker: {token}")

main_final = main.read_text()
for token in [
    "NUBO-Android/70",
    "android-v70",
    "bundle=v70",
    "RENDERER_PRIORITY_IMPORTANT",
    "setOffscreenPreRaster(true)",
    "p.setVolume(72)",
    "createOnDeviceSpeechRecognizer",
]:
    if token not in main_final:
        raise SystemExit(f"missing preserved Android marker: {token}")

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

print("Applied V70 Android: V69 baseline + version-only wrapper for no 30s eco")
