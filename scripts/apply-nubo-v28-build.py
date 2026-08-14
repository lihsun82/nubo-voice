from pathlib import Path
import runpy

# Build on the validated V27 Sense/main-voice/hidden-diagnostics chain.
runpy.run_path("scripts/apply-nubo-sense-v27-hide-debug.py", run_name="__main__")

p = Path("android-nubo/app/build.gradle")
s = p.read_text()
s = s.replace("versionCode 27", "versionCode 28")
s = s.replace('versionName "0.27.0"', 'versionName "0.28.0"')
p.write_text(s)

p = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = p.read_text()
s = s.replace("android-v27", "android-v28")
s = s.replace("NUBO-Android/27", "NUBO-Android/28")
p.write_text(s)
