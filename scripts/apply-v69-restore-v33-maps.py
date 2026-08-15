from pathlib import Path
import runpy

# Build from the validated V68 baseline, then change ONLY version/bundle markers.
# The V33 Maps behavior itself is restored by the web patch in package.json.
runpy.run_path("scripts/apply-v68-maps-list-geolock.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 68", "versionCode 69", 1)
s = s.replace('versionName "0.68.0-maps-list-geolock"', 'versionName "0.69.0-v33-maps-restore-only"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v68", "android-v69")
s = s.replace("NUBO-Android/68", "NUBO-Android/69")
s = s.replace("bundle=v68", "bundle=v69")
s = s.replace("nubo_v68_bundle_flushed", "nubo_v69_bundle_flushed")
s = s.replace("nubo-v68-hide-panels", "nubo-v69-hide-panels")
main.write_text(s)

for token in ["versionCode 69", '0.69.0-v33-maps-restore-only']:
    if token not in app.read_text():
        raise SystemExit(f"missing V69 app marker: {token}")

main_final = main.read_text()
for token in [
    "NUBO-Android/69",
    "android-v69",
    "bundle=v69",
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

print("Applied V69 Android: V68 baseline, version-only wrapper for isolated V33 Maps restore")
