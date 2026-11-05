#!/usr/bin/env python3
"""Apply JJ1-only display fixes after the proven NUBO 3.3 build materializers.

Only used in the isolated JJ1 Android test build. Production APK remains untouched.
"""
from pathlib import Path
import json

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
app = Path("android-nubo/app/build.gradle")
source = main.read_text(encoding="utf-8")

if "NUBO-JJ1/1" in source:
    raise SystemExit("JJ1 native profile appears to have been applied already")

# Apply JJ1-specific viewport settings before the first page navigation.
ua_anchor = "        CookieManager cookieManager = CookieManager.getInstance();"
if source.count(ua_anchor) != 1:
    raise SystemExit("JJ1 WebView User-Agent anchor mismatch")
native_settings = """        // JJ1 wall-display optimization. Do not alter non-JJ1 phones.
        if (Build.MODEL != null && "JJ1".equalsIgnoreCase(Build.MODEL.trim())) {
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(false);
            settings.setTextZoom(100);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setUserAgentString(settings.getUserAgentString() + " NUBO-JJ1/1");
        }

"""
source = source.replace(ua_anchor, native_settings + ua_anchor, 1)

# Add safe layout repair to the APK itself: it also works BEFORE web changes deploy.
# It runs only after a trusted HTTPS page finishes loading and only on real JJ1 hardware.
native_css = """
.orb-wrap{display:grid!important;place-items:center!important;width:100%!important}
.nubo-energy-orb{position:relative!important;left:auto!important;right:auto!important;
transform:none!important;margin-inline:auto!important;width:min(100%,560px)!important;
max-width:560px!important;filter:none!important}
.nubo-energy-orb canvas{display:block!important;width:100%!important;
max-width:100%!important;height:auto!important;aspect-ratio:560/620!important;
filter:none!important}
.console{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
.nubo-space-grid,.nubo-space-horizon{animation:none!important}
"""
native_css = " ".join(native_css.split())
js = (
    "(function(){"
    "var root=document.documentElement;"
    "root.dataset.nuboDevice='jj1';"
    "if(document.getElementById('nubo-jj1-native-style'))return;"
    "var st=document.createElement('style');"
    "st.id='nubo-jj1-native-style';"
    "st.textContent=" + json.dumps(native_css) + ";"
    "(document.head||document.documentElement).appendChild(st);"
    "window.dispatchEvent(new Event('nubo:jj1-ready'));"
    "})();"
)
java_js = json.dumps(js, ensure_ascii=True)

method_start = "public void onPageFinished(WebView view, String url) {"
start = source.find(method_start)
if start < 0:
    raise SystemExit("TrustedNuboWebViewClient.onPageFinished missing")
end = source.find("\n        }\n    }", start)
if end < 0:
    raise SystemExit("TrustedNuboWebViewClient end marker missing")
method = source[start:end]
if method.count("if (isTrustedNuboUri(Uri.parse(url))) {") != 1:
    raise SystemExit("Trusted HTTPS onPageFinished guard missing or ambiguous")
guard = "if (isTrustedNuboUri(Uri.parse(url))) {"
injection = (
    guard + "\n"
    '                if (Build.MODEL != null && "JJ1".equalsIgnoreCase(Build.MODEL.trim())) {\n'
    f"                    view.evaluateJavascript({java_js}, null);\n"
    "                }"
)
method = method.replace(guard, injection, 1)
source = source[:start] + method + source[end:]
main.write_text(source, encoding="utf-8")

# A side-by-side installation cannot overwrite existing NUBO production state.
build = app.read_text(encoding="utf-8")
expect = [
    'versionCode 3300',
    'versionName "3.3.0-youtube-background-nosetup"',
    'applicationIdSuffix ".debug"',
]
for marker in expect:
    if build.count(marker) != 1:
        raise SystemExit(f"Gradle build anchor missing or ambiguous: {marker}")
build = build.replace('versionCode 3300', 'versionCode 3302', 1)
build = build.replace(
    'versionName "3.3.0-youtube-background-nosetup"',
    'versionName "3.3.1-jj1-preview"',
    1,
)
build = build.replace('applicationIdSuffix ".debug"', 'applicationIdSuffix ".jj1test"', 1)
app.write_text(build, encoding="utf-8")

# Explicit contracts; never affect user phones, guest-service or native wake logic.
for token in [
    "NUBO-JJ1/1",
    "settings.setUseWideViewPort(true)",
    "settings.setLoadWithOverviewMode(false)",
    "settings.setTextZoom(100)",
    "nubo-jj1-native-style",
    "isTrustedNuboUri(Uri.parse(url))",
    "googleHomeControl",
]:
    if token not in source:
        raise SystemExit(f"Missing JJ1 or preserved native marker: {token}")
if "applicationIdSuffix \".jj1test\"" not in build:
    raise SystemExit("Side-by-side package suffix not found")
print("JJ1 Android patch applied: package side-by-side, native bridges preserved.")
