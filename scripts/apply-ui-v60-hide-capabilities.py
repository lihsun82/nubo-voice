from pathlib import Path
import runpy

runpy.run_path("scripts/apply-ui-v59-force-hide-panels.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 59", "versionCode 60", 1)
s = s.replace('versionName "0.59.0-native-hide-question-task-panels"', 'versionName "0.60.0-native-hide-panels-capabilities"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v59", "android-v60")
s = s.replace("NUBO-Android/59", "NUBO-Android/60")
s = s.replace("bundle=v59", "bundle=v60")
s = s.replace("nubo_v59_bundle_flushed", "nubo_v60_bundle_flushed")
s = s.replace("nubo-v59-hide-panels", "nubo-v60-hide-panels")
s = s.replace(".question-history,.task-center{display:none!important}", ".question-history,.task-center,.capabilities{display:none!important}")
s = s.replace("document.querySelectorAll('.question-history,.task-center')", "document.querySelectorAll('.question-history,.task-center,.capabilities')")
main.write_text(s)

final = main.read_text()
for token in ["NUBO-Android/60","android-v60","nubo-v60-hide-panels",".question-history,.task-center,.capabilities{display:none!important}","p.setVolume(72)","createOnDeviceSpeechRecognizer"]:
    if token not in final:
        raise SystemExit(f"missing V60 marker: {token}")
print("Applied V60: hide question history + task center + capability hint cards")
