from pathlib import Path
import runpy

# Preserve exact V60 Android behavior. Only bump the installable version so this
# one-target Maps background-voice fix can be distinguished from the restored V60 APK.
runpy.run_path("scripts/apply-ui-v60-hide-capabilities.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 60", "versionCode 601", 1)
s = s.replace('versionName "0.60.0-native-hide-panels-capabilities"', 'versionName "0.60.1-maps-background-voice"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v60", "android-v60-1")
s = s.replace("NUBO-Android/60", "NUBO-Android/60.1")
s = s.replace("bundle=v60", "bundle=v60-1")
s = s.replace("nubo_v60_bundle_flushed", "nubo_v60_1_bundle_flushed")
s = s.replace("nubo-v60-hide-panels", "nubo-v60-1-hide-panels")
main.write_text(s)

for token in ["versionCode 601", '0.60.1-maps-background-voice']:
    if token not in app.read_text():
        raise SystemExit(f"missing V60.1 app marker: {token}")

final = main.read_text()
for token in [
    "NUBO-Android/60.1",
    "android-v60-1",
    "bundle=v60-1",
    "beginExternalVoiceKeepAlive",
    "enterPictureInPictureMode",
    "openExternalApp",
    "createOnDeviceSpeechRecognizer",
    "p.setVolume(72)",
    ".question-history,.task-center,.capabilities{display:none!important}",
]:
    if token not in final:
        raise SystemExit(f"missing preserved V60.1 Android marker: {token}")

home = Path("android-nubo/app/src/googleHome/java/com/ainubo/nubo/googlehome/GoogleHomeGatewayImpl.kt").read_text()
if 'sdk", "1.10.0"' not in home:
    raise SystemExit("missing preserved Google Home 1.10.0 marker")

print("Applied V60.1 Android: exact V60 baseline + Maps background voice version wrapper")
