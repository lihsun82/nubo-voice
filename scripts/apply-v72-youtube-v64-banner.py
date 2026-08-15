from pathlib import Path
import runpy

# Preserve V71 exactly. V72 changes only the YouTube route contract in the web bundle,
# locking it to the V64-era same-Activity bottom 16:9 embedded player behavior.
runpy.run_path("scripts/apply-v71-youtube66-maps-background.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 71", "versionCode 72", 1)
s = s.replace('versionName "0.71.0-youtube66-maps-background"', 'versionName "0.72.0-youtube-v64-banner"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v71", "android-v72")
s = s.replace("NUBO-Android/71", "NUBO-Android/72")
s = s.replace("bundle=v71", "bundle=v72")
s = s.replace("nubo_v71_bundle_flushed", "nubo_v72_bundle_flushed")
s = s.replace("nubo-v71-hide-panels", "nubo-v72-hide-panels")
main.write_text(s)

for token in ["versionCode 72", '0.72.0-youtube-v64-banner']:
    if token not in app.read_text():
        raise SystemExit(f"missing V72 app marker: {token}")

main_final = main.read_text()
# V64 YouTube inherited this exact V58 embedded bottom-banner implementation.
for token in [
    "NUBO-Android/72",
    "android-v72",
    "bundle=v72",
    "embeddedYouTubeOverlayV58",
    "showEmbeddedYouTubeV58",
    "root.addView(overlay, overlayParams)",
    "Gravity.BOTTOM",
    "p.setVolume(72)",
    "loadVideoById",
    "youtube.com/iframe_api",
]:
    if token not in main_final:
        raise SystemExit(f"missing V64 YouTube contract marker: {token}")

# Explicitly preserve the two non-YouTube changes the user just approved.
for token in [
    "beginExternalVoiceKeepAlive",
    "enterPictureInPictureMode",
    "createOnDeviceSpeechRecognizer",
]:
    if token not in main_final:
        raise SystemExit(f"missing preserved non-YouTube capability: {token}")

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

print("Applied V72 Android: V71 baseline + version-only wrapper for V64 YouTube banner")
