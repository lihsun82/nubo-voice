from pathlib import Path
import runpy

# V45 keeps the V44/V43/V9 YouTube native launch and Google Home baseline.
# The only functional native change is to force the WebView to stop reusing
# stale cached Next.js/Service Worker bundles from nubo.ainubo.com.
runpy.run_path("scripts/apply-youtube-local-bypass-v44.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 44", "versionCode 45", "V45 versionCode")
s = replace_once(
    s,
    'versionName "0.44.0-youtube-local-transcript-bypass"',
    'versionName "0.45.0-webview-fresh-bundle"',
    "V45 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

# Force network-backed page/resource loading instead of WebView HTTP cache.
s = replace_once(
    s,
    "        settings.setMediaPlaybackRequiresUserGesture(false);\n",
    "        settings.setMediaPlaybackRequiresUserGesture(false);\n"
    "        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);\n",
    "V45 WebView cache mode",
)

# Clear disk/memory resource cache before the first navigation. LocalStorage and
# cookies are intentionally preserved so voice preferences and signed-in state stay intact.
s = replace_once(
    s,
    "        configureWebView(webView);\n        initializeSenseTts();\n",
    "        configureWebView(webView);\n"
    "        webView.clearCache(true);\n"
    "        initializeSenseTts();\n",
    "V45 startup cache clear",
)

# Replace whatever native query marker the baseline currently has. This avoids
# depending on a specific earlier version number.
import re
s, url_replacements = re.subn(
    r'private static final String NUBO_URL = "https://nubo\.ainubo\.com/\?native=android-v[^"]+";',
    'private static final String NUBO_URL = "https://nubo.ainubo.com/?native=android-v45&bundle=v45";',
    s,
    count=1,
)
if url_replacements != 1:
    raise SystemExit("missing pattern: V45 NUBO_URL")

# Insert the cache/service-worker purge at the stable onPageFinished entry point,
# rather than replacing the pre-existing native-ready block whose version marker
# is changed by earlier build scripts.
on_page_anchor = '''        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
'''
purge_block = '''        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (isTrustedNuboUri(Uri.parse(url))) {
                view.evaluateJavascript(
                    "(async()=>{"
                    + "try{"
                    + "if(!sessionStorage.getItem('nubo_v45_bundle_flushed')){"
                    + "sessionStorage.setItem('nubo_v45_bundle_flushed','1');"
                    + "if(window.caches&&caches.keys){const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));}"
                    + "if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){const rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(r=>r.unregister()));}"
                    + "location.replace('/?native=android-v45&bundle=v45&fresh=1');return;"
                    + "}"
                    + "}catch(e){}"
                    + "})();",
                    null
                );
            }
'''
s = replace_once(s, on_page_anchor, purge_block, "V45 onPageFinished purge insertion")

# Normalize build markers after prior V44 transforms. The existing native-ready
# dispatch remains intact and is simply relabeled V45.
s = s.replace("android-v44", "android-v45")
s = s.replace("NUBO-Android/44", "NUBO-Android/45")
main.write_text(s)

final_source = main.read_text()
for token in [
    "WebSettings.LOAD_NO_CACHE",
    "webView.clearCache(true)",
    "nubo_v45_bundle_flushed",
    "caches.delete",
    "getRegistrations",
    "bundle=v45",
    "android-v45",
    "NUBO-Android/45",
    "public boolean playYouTubeNoSetup",
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V45 fresh-bundle marker: {token}")

# Preserve the proven direct YouTube bridge: no accessibility/PiP/delay layers.
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
        raise SystemExit(f"forbidden layer in V45 YouTube bridge: {forbidden}")

print("Applied V45: force fresh nubo.ainubo.com bundle; preserve V9 YouTube + Google Home")
