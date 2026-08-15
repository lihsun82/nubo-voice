from pathlib import Path
import runpy

# V47 keeps the proven Android V9/V43 direct YouTube launch and V45 fresh-WebView
# behavior, but replaces the web YouTube resolver stack with one clean V47 route.
runpy.run_path("scripts/apply-youtube-canonical-v46.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 46", "versionCode 47", "V47 versionCode")
s = replace_once(
    s,
    'versionName "0.46.0-youtube-canonical-app"',
    'versionName "0.47.0-youtube-clean-single-route"',
    "V47 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v46", "android-v47")
s = s.replace("NUBO-Android/46", "NUBO-Android/47")
s = s.replace("bundle=v46", "bundle=v47")
s = s.replace("nubo_v46_bundle_flushed", "nubo_v47_bundle_flushed")
main.write_text(s)

final_source = main.read_text()
for token in [
    "WebSettings.LOAD_NO_CACHE",
    "webView.clearCache(true)",
    "nubo_v47_bundle_flushed",
    "bundle=v47",
    "android-v47",
    "NUBO-Android/47",
    "public boolean playYouTubeNoSetup",
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V47 marker: {token}")

start = final_source.index("        public boolean playYouTubeNoSetup(")
end = final_source.index("        @JavascriptInterface\n        public boolean isExternalVoiceKeepAliveActive()", start)
youtube_bridge = final_source[start:end]
for forbidden in [
    "beginExternalVoiceKeepAlive",
    "enterPictureInPictureMode",
    "postDelayed",
    "NuboYouTubeAccessibilityService",
    "queryIntentActivities",
    "vnd.youtube:",
]:
    if forbidden in youtube_bridge:
        raise SystemExit(f"forbidden legacy layer in V47 YouTube bridge: {forbidden}")

print("Applied V47: clean single-route YouTube playback")
