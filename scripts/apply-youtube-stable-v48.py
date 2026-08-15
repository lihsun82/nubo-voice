from pathlib import Path
import runpy

# V48 keeps the current application, Google Home, voice, Sense and all non-YouTube
# mobile routes. Only the YouTube launch owner is restored to the proven
# stable-2026-08-01-before-phone-agent-v2-bridge-fix Android intent handoff.
runpy.run_path("scripts/apply-youtube-clean-v47.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 47", "versionCode 48", "V48 versionCode")
s = replace_once(
    s,
    'versionName "0.47.0-youtube-clean-single-route"',
    'versionName "0.48.0-youtube-stable-0801-launch"',
    "V48 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v47", "android-v48")
s = s.replace("NUBO-Android/47", "NUBO-Android/48")
s = s.replace("bundle=v47", "bundle=v48")
s = s.replace("nubo_v47_bundle_flushed", "nubo_v48_bundle_flushed")
main.write_text(s)

final_source = main.read_text()
for token in [
    "WebSettings.LOAD_NO_CACHE",
    "webView.clearCache(true)",
    "nubo_v48_bundle_flushed",
    "bundle=v48",
    "android-v48",
    "NUBO-Android/48",
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V48 marker: {token}")

print("Applied V48: YouTube launch restored from stable 2026-08-01 only")
