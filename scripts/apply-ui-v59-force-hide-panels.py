from pathlib import Path
import runpy

# Build from the current V58 native baseline, then add a native-side UI hide guard.
runpy.run_path("scripts/apply-youtube-v58-native-idle-wake-fallback.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 58", "versionCode 59", "V59 versionCode")
s = replace_once(
    s,
    'versionName "0.58.0-youtube-stable-audio-native-wake-order"',
    'versionName "0.59.0-native-hide-question-task-panels"',
    "V59 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v58", "android-v59")
s = s.replace("NUBO-Android/58", "NUBO-Android/59")
s = s.replace("bundle=v58", "bundle=v59")
s = s.replace("nubo_v58_bundle_flushed", "nubo_v59_bundle_flushed")

# Inject a native-side hard hide after every page load, so even a stale remote bundle
# cannot render the two panels the user asked to hide.
needle = """                view.evaluateJavascript(\n                    \"document.documentElement.dataset.nuboNative='android-v59';window.dispatchEvent(new CustomEvent('nubo-native-ready',{detail:{version:'android-v59',sense:'v1'}}));\",\n                    null\n                );\n"""
replacement = """                view.evaluateJavascript(\n                    \"(function(){try{var id='nubo-v59-hide-panels';var st=document.getElementById(id);if(!st){st=document.createElement('style');st.id=id;st.textContent='.question-history,.task-center{display:none!important}';document.head.appendChild(st);}document.querySelectorAll('.question-history,.task-center').forEach(function(el){el.style.setProperty('display','none','important');});}catch(e){}document.documentElement.dataset.nuboNative='android-v59';window.dispatchEvent(new CustomEvent('nubo-native-ready',{detail:{version:'android-v59',sense:'v1'}}));})();\",\n                    null\n                );\n"""
s = replace_once(s, needle, replacement, "V59 native UI hide injection")

main.write_text(s)

final_source = main.read_text()
for token in [
    "NUBO-Android/59",
    "android-v59",
    "nubo-v59-hide-panels",
    ".question-history,.task-center{display:none!important}",
    "version:'android-v59'",
    "createOnDeviceSpeechRecognizer",
    "p.setVolume(72)",
    "GoogleHomeGatewayImpl",
]:
    if token not in final_source and token != "GoogleHomeGatewayImpl":
        raise SystemExit(f"missing V59 marker: {token}")

print("Applied V59: native force-hide question history + task center")
