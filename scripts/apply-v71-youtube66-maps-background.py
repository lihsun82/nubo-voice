from pathlib import Path
import runpy

# Preserve V70 exactly. V71 changes only the two requested routes in the web bundle:
# YouTube back through the V66 embedded native route, and Maps through existing PiP keep-alive.
runpy.run_path("scripts/apply-v70-remove-30s-eco.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 70", "versionCode 71", 1)
s = s.replace('versionName "0.70.0-no-30s-eco"', 'versionName "0.71.0-youtube66-maps-background"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v70", "android-v71")
s = s.replace("NUBO-Android/70", "NUBO-Android/71")
s = s.replace("bundle=v70", "bundle=v71")
s = s.replace("nubo_v70_bundle_flushed", "nubo_v71_bundle_flushed")
s = s.replace("nubo-v70-hide-panels", "nubo-v71-hide-panels")
main.write_text(s)

for token in ["versionCode 71", '0.71.0-youtube66-maps-background']:
    if token not in app.read_text():
        raise SystemExit(f"missing V71 app marker: {token}")

main_final = main.read_text()
# These are the V66/V70 capabilities that must remain untouched.
for token in [
    "NUBO-Android/71",
    "android-v71",
    "bundle=v71",
    "embeddedYouTubeOverlayV58",
    "showEmbeddedYouTubeV58",
    "root.addView(overlay, overlayParams)",
    "Gravity.BOTTOM",
    "p.setVolume(72)",
    "beginExternalVoiceKeepAlive",
    "enterPictureInPictureMode",
    "openExternalApp",
    "createOnDeviceSpeechRecognizer",
    "RENDERER_PRIORITY_IMPORTANT",
    "setOffscreenPreRaster(true)",
]:
    if token not in main_final:
        raise SystemExit(f"missing preserved V71 Android capability: {token}")

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

print("Applied V71 Android: V70 baseline + version-only wrapper for two targeted web routes")
