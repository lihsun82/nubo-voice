from pathlib import Path
import runpy

# Exact V60 baseline, then add one isolated native capability:
# a full-screen Google Maps WebView overlay inside the same Activity.
# NUBO remains alive underneath, so no PiP and no external Maps app is needed.
runpy.run_path("scripts/apply-ui-v60-hide-capabilities.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 60", "versionCode 602", 1)
s = s.replace('versionName "0.60.0-native-hide-panels-capabilities"', 'versionName "0.60.2-maps-web-overlay-voice"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v60", "android-v60-2")
s = s.replace("NUBO-Android/60", "NUBO-Android/60.2")
s = s.replace("bundle=v60", "bundle=v60-2")
s = s.replace("nubo_v60_bundle_flushed", "nubo_v60_2_bundle_flushed")
s = s.replace("nubo-v60-hide-panels", "nubo-v60-2-hide-panels")

field_anchor = "    private WebView webView;\n"
if "mapsOverlayWebView" not in s:
    s = s.replace(field_anchor, field_anchor + "    private WebView mapsOverlayWebView;\n", 1)

bridge_anchor = '''        @JavascriptInterface\n        public boolean isExternalVoiceKeepAliveActive() {'''
bridge_method = '''        // NUBO_V60_2_MAPS_WEB_OVERLAY\n        @JavascriptInterface\n        public boolean showMapsWeb(String targetUrl) {\n            if (targetUrl == null) return false;\n            String safeTarget = targetUrl.trim();\n            if (safeTarget.isEmpty() || !activity.isAllowedMapsWebUrl(safeTarget)) return false;\n            activity.runOnUiThread(() -> activity.showMapsWebOverlay(safeTarget));\n            return true;\n        }\n\n'''
if "NUBO_V60_2_MAPS_WEB_OVERLAY" not in s:
    s = s.replace(bridge_anchor, bridge_method + bridge_anchor, 1)

method_anchor = '''    private boolean isNuboInPictureInPicture() {'''
methods = '''    private boolean isAllowedMapsWebUrl(String targetUrl) {\n        try {\n            Uri uri = Uri.parse(targetUrl);\n            String scheme = uri.getScheme();\n            String host = uri.getHost();\n            if (!"https".equalsIgnoreCase(scheme) || host == null) return false;\n            String h = host.toLowerCase(Locale.ROOT);\n            return (h.equals("google.com") || h.endsWith(".google.com"))\n                && uri.getPath() != null\n                && uri.getPath().startsWith("/maps");\n        } catch (RuntimeException ignored) {\n            return false;\n        }\n    }\n\n    private void showMapsWebOverlay(String targetUrl) {\n        if (!isAllowedMapsWebUrl(targetUrl)) return;\n\n        if (mapsOverlayWebView == null) {\n            mapsOverlayWebView = new WebView(this);\n            mapsOverlayWebView.setBackgroundColor(Color.WHITE);\n            WebSettings mapSettings = mapsOverlayWebView.getSettings();\n            mapSettings.setJavaScriptEnabled(true);\n            mapSettings.setDomStorageEnabled(true);\n            mapSettings.setDatabaseEnabled(true);\n            mapSettings.setMediaPlaybackRequiresUserGesture(true);\n            mapSettings.setAllowFileAccess(false);\n            mapSettings.setAllowContentAccess(false);\n            mapSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);\n            mapSettings.setSafeBrowsingEnabled(true);\n            CookieManager.getInstance().setAcceptCookie(true);\n            CookieManager.getInstance().setAcceptThirdPartyCookies(mapsOverlayWebView, true);\n            mapsOverlayWebView.setWebChromeClient(new WebChromeClient());\n            mapsOverlayWebView.setWebViewClient(new WebViewClient() {\n                @Override\n                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {\n                    Uri uri = request.getUrl();\n                    if (uri != null && "https".equalsIgnoreCase(uri.getScheme())) return false;\n                    return true;\n                }\n            });\n            addContentView(\n                mapsOverlayWebView,\n                new FrameLayout.LayoutParams(\n                    FrameLayout.LayoutParams.MATCH_PARENT,\n                    FrameLayout.LayoutParams.MATCH_PARENT\n                )\n            );\n        }\n\n        // Keep the original NUBO WebView fully active underneath the map.\n        // The Activity never backgrounds, so Gemini microphone/timers remain alive.\n        activityForeground = true;\n        webView.onResume();\n        webView.resumeTimers();\n        mapsOverlayWebView.setVisibility(android.view.View.VISIBLE);\n        mapsOverlayWebView.onResume();\n        mapsOverlayWebView.resumeTimers();\n        mapsOverlayWebView.loadUrl(targetUrl);\n    }\n\n    private boolean closeMapsWebOverlay() {\n        if (mapsOverlayWebView == null || mapsOverlayWebView.getVisibility() != android.view.View.VISIBLE) {\n            return false;\n        }\n        mapsOverlayWebView.setVisibility(android.view.View.GONE);\n        mapsOverlayWebView.onPause();\n        return true;\n    }\n\n'''
if "private boolean isAllowedMapsWebUrl" not in s:
    s = s.replace(method_anchor, methods + method_anchor, 1)

back_old = '''    @Override\n    public void onBackPressed() {\n        if (webView.canGoBack()) {'''
back_new = '''    @Override\n    public void onBackPressed() {\n        if (closeMapsWebOverlay()) {\n            return;\n        }\n        if (webView.canGoBack()) {'''
if back_old in s:
    s = s.replace(back_old, back_new, 1)

main.write_text(s)

final = main.read_text()
for token in [
    "versionCode 602",
    '0.60.2-maps-web-overlay-voice',
]:
    if token not in app.read_text():
        raise SystemExit(f"missing V60.2 app marker: {token}")
for token in [
    "NUBO-Android/60.2",
    "android-v60-2",
    "bundle=v60-2",
    "NUBO_V60_2_MAPS_WEB_OVERLAY",
    "showMapsWeb(String targetUrl)",
    "showMapsWebOverlay",
    "mapsOverlayWebView.loadUrl(targetUrl)",
    "webView.resumeTimers()",
    "closeMapsWebOverlay()",
    "createOnDeviceSpeechRecognizer",
    "p.setVolume(72)",
    ".question-history,.task-center,.capabilities{display:none!important}",
]:
    if token not in final:
        raise SystemExit(f"missing V60.2 marker: {token}")

home = Path("android-nubo/app/src/googleHome/java/com/ainubo/nubo/googlehome/GoogleHomeGatewayImpl.kt").read_text()
if 'sdk", "1.10.0"' not in home:
    raise SystemExit("missing preserved Google Home 1.10.0 marker")

print("Applied V60.2: exact V60 + full-screen Maps WebView overlay with NUBO voice underneath")
