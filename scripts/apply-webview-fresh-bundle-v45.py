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

# V45 build-specific URL prevents intermediary/browser cache reuse.
s = s.replace(
    'private static final String NUBO_URL = "https://nubo.ainubo.com/?native=android-v24";',
    'private static final String NUBO_URL = "https://nubo.ainubo.com/?native=android-v45&bundle=v45";',
)
# apply-v28 may already have rewritten the URL marker before we run.
s = s.replace(
    'private static final String NUBO_URL = "https://nubo.ainubo.com/?native=android-v44";',
    'private static final String NUBO_URL = "https://nubo.ainubo.com/?native=android-v45&bundle=v45";',
)

# On the first trusted page load, purge CacheStorage + unregister any Service Worker,
# then reload once. sessionStorage prevents a reload loop and does not persist across app restarts.
old = '''            if (isTrustedNuboUri(Uri.parse(url))) {\n                view.evaluateJavascript(\n                    "document.documentElement.dataset.nuboNative='android-v44';window.dispatchEvent(new CustomEvent('nubo-native-ready',{detail:{version:'android-v44',sense:'v1'}}));",\n                    null\n                );\n            }\n'''
new = '''            if (isTrustedNuboUri(Uri.parse(url))) {\n                view.evaluateJavascript(\n                    "(async()=>{"\n                    + "try{"\n                    + "if(!sessionStorage.getItem('nubo_v45_bundle_flushed')){"\n                    + "sessionStorage.setItem('nubo_v45_bundle_flushed','1');"\n                    + "if(window.caches&&caches.keys){const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));}"\n                    + "if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){const rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(r=>r.unregister()));}"\n                    + "location.replace('/?native=android-v45&bundle=v45&fresh=1');return;"\n                    + "}"\n                    + "}catch(e){}"\n                    + "document.documentElement.dataset.nuboNative='android-v45';"\n                    + "window.dispatchEvent(new CustomEvent('nubo-native-ready',{detail:{version:'android-v45',sense:'v1',freshBundle:true}}));"\n                    + "})();",\n                    null\n                );\n            }\n'''
if old in s:
    s = replace_once(s, old, new, "V45 service-worker purge")
else:
    # Build-chain source may still expose the baseline v28 marker at this stage.
    old28 = old.replace("android-v44", "android-v28")
    s = replace_once(s, old28, new, "V45 service-worker purge baseline")

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
