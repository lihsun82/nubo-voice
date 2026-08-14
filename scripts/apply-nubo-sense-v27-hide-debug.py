from pathlib import Path
import runpy

# Start from the validated V26 main-voice routing build.
runpy.run_path("scripts/apply-nubo-sense-v26-main-voice.py", run_name="__main__")

# Promote to V27.
p = Path("android-nubo/app/build.gradle")
s = p.read_text()
s = s.replace("versionCode 26", "versionCode 27")
s = s.replace('versionName "0.26.0"', 'versionName "0.27.0"')
p.write_text(s)

p = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = p.read_text()
s = s.replace("android-v26", "android-v27")
s = s.replace("NUBO-Android/26", "NUBO-Android/27")

# Keep all Sense/YAMNet diagnostics active internally, but make the engineering
# overlay invisible to end users. This preserves troubleshooting telemetry while
# removing PCM/Top-5/confidence strings from the bottom of the NUBO UI.
s = s.replace(
    "el.style.cssText = 'position:fixed;left:8px;bottom:8px;",
    "el.style.cssText = 'display:none!important;position:fixed;left:8px;bottom:8px;",
)
s = s.replace(
    "e.style.cssText='position:fixed;left:8px;bottom:8px;",
    "e.style.cssText='display:none!important;position:fixed;left:8px;bottom:8px;",
)

# Also hide any diagnostic element that may already exist from an earlier page state.
marker = '''                installNativeSenseTap(view);\n'''
insert = marker + '''                view.evaluateJavascript(\n                    "(() => { const e=document.getElementById('nubo-sense-v25-diag'); if(e){e.style.display='none'; e.setAttribute('aria-hidden','true');} })();",\n                    null\n                );\n'''
if marker in s and "aria-hidden','true" not in s:
    s = s.replace(marker, insert, 1)

p.write_text(s)
