from pathlib import Path
import runpy

# V46 keeps V45 fresh-WebView behavior, V43/V9 direct Android YouTube launch,
# and the established Google Home / voice baselines. The functional YouTube
# change lives in the web API/resolver: external-app playback is no longer
# blocked by V38 room-player eligibility rules.
runpy.run_path("scripts/apply-webview-fresh-bundle-v45.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 45", "versionCode 46", "V46 versionCode")
s = replace_once(s, 'versionName "0.45.0-webview-fresh-bundle"', 'versionName "0.46.0-youtube-canonical-app"', "V46 versionName")
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v45", "android-v46")
s = s.replace("NUBO-Android/45", "NUBO-Android/46")
s = s.replace("bundle=v45", "bundle=v46")
s = s.replace("nubo_v45_bundle_flushed", "nubo_v46_bundle_flushed")
main.write_text(s)

final_source = main.read_text()
for token in [
    "WebSettings.LOAD_NO_CACHE",
    "webView.clearCache(true)",
    "nubo_v46_bundle_flushed",
    "bundle=v46",
    "android-v46",
    "NUBO-Android/46",
    "public boolean playYouTubeNoSetup",
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V46 marker: {token}")

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
        raise SystemExit(f"forbidden layer in V46 YouTube bridge: {forbidden}")

print("Applied V46: canonical external YouTube App playback + fresh web bundle")
