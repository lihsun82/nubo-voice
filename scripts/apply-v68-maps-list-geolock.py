from pathlib import Path
import runpy

runpy.run_path("scripts/apply-v67-location-youtube-home.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 67", "versionCode 68", 1)
s = s.replace('versionName "0.67.0-geo-youtube-home-stable"', 'versionName "0.68.0-maps-list-geolock"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v67", "android-v68")
s = s.replace("NUBO-Android/67", "NUBO-Android/68")
s = s.replace("bundle=v67", "bundle=v68")
s = s.replace("nubo_v67_bundle_flushed", "nubo_v68_bundle_flushed")
s = s.replace("nubo-v67-hide-panels", "nubo-v68-hide-panels")
main.write_text(s)

for token in ["versionCode 68", '0.68.0-maps-list-geolock']:
    if token not in app.read_text():
        raise SystemExit(f"missing V68 app marker: {token}")

main_final = main.read_text()
for token in [
    "NUBO-Android/68",
    "android-v68",
    "bundle=v68",
    "RENDERER_PRIORITY_IMPORTANT",
    "setOffscreenPreRaster(true)",
    "p.setVolume(72)",
    "createOnDeviceSpeechRecognizer",
]:
    if token not in main_final:
        raise SystemExit(f"missing V68 Android marker: {token}")

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

print("Applied V68 Android: V67 baseline + maps-list geo-lock bundle refresh")
