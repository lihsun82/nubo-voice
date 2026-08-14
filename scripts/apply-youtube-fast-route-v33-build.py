from pathlib import Path
import runpy

# Preserve the validated V32 Android exact-video launch path. V33 changes the
# control decision layer in the web source (local transcript fast route) and only
# bumps the native package version/marker here. Google Home, Sense, PiP and voice
# transport remain unchanged.
runpy.run_path("scripts/apply-youtube-switch-v32-exact-video.py", run_name="__main__")

p = Path("android-nubo/app/build.gradle")
s = p.read_text()
if "versionCode 32" not in s:
    raise SystemExit("missing V32 versionCode")
s = s.replace("versionCode 32", "versionCode 33", 1)
s = s.replace(
    'versionName "0.32.0-youtube-exact-video"',
    'versionName "0.33.0-youtube-local-fast-route"',
    1,
)
p.write_text(s)

p = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = p.read_text()
s = s.replace('"v32-exact-video"', '"v33-local-fast-route"', 1)
s = s.replace("android-v28", "android-v33")
s = s.replace("NUBO-Android/28", "NUBO-Android/33")
p.write_text(s)

print("Applied V33 Android release marker over validated V32 exact-video path")
