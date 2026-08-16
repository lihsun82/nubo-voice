from pathlib import Path
import runpy

# Preserve V73 entirely. V74 changes only the YouTube presentation path in the web bundle:
# exact videoId -> React-owned fixed bottom 16:9 iframe inside the NUBO page.
runpy.run_path("scripts/apply-v73-force-native-youtube-banner.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 73", "versionCode 74", 1)
s = s.replace('versionName "0.73.0-force-native-youtube-banner"', 'versionName "0.74.0-dom-youtube-banner"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v73", "android-v74")
s = s.replace("NUBO-Android/73", "NUBO-Android/74")
s = s.replace("bundle=v73", "bundle=v74")
s = s.replace("nubo_v73_bundle_flushed", "nubo_v74_bundle_flushed")
s = s.replace("nubo-v73-hide-panels", "nubo-v74-hide-panels")
main.write_text(s)

for token in ["versionCode 74", '0.74.0-dom-youtube-banner']:
    if token not in app.read_text():
        raise SystemExit(f"missing V74 app marker: {token}")

final = main.read_text()
for token in [
    "NUBO-Android/74",
    "android-v74",
    "bundle=v74",
    "beginExternalVoiceKeepAlive",
    "enterPictureInPictureMode",
    "createOnDeviceSpeechRecognizer",
    "p.setVolume(72)",
]:
    if token not in final:
        raise SystemExit(f"missing V74 preserved Android marker: {token}")

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

print("Applied V74 Android: V73 baseline + version wrapper for React DOM YouTube banner")
