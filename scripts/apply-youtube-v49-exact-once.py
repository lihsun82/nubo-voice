from pathlib import Path
import runpy

# V49 preserves the V48 stable 2026-08-01 Android intent handoff.
# Only YouTube behavior changes: exact videoId is preferred and the same launch
# is suppressed across WebView resume/reload for 30 seconds.
runpy.run_path("scripts/apply-youtube-stable-v48.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 48", "versionCode 49", "V49 versionCode")
s = replace_once(
    s,
    'versionName "0.48.0-youtube-stable-0801-launch"',
    'versionName "0.49.0-youtube-exact-once"',
    "V49 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v48", "android-v49")
s = s.replace("NUBO-Android/48", "NUBO-Android/49")
s = s.replace("bundle=v48", "bundle=v49")
s = s.replace("nubo_v48_bundle_flushed", "nubo_v49_bundle_flushed")
main.write_text(s)

final_source = main.read_text()
for token in [
    "WebSettings.LOAD_NO_CACHE",
    "webView.clearCache(true)",
    "nubo_v49_bundle_flushed",
    "bundle=v49",
    "android-v49",
    "NUBO-Android/49",
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V49 marker: {token}")

print("Applied V49: stable YouTube exact-video + one-shot handoff")
