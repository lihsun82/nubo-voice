from pathlib import Path
import re

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
app = Path("android-nubo/app/build.gradle")

s = main.read_text()

# 1) Give the native shell a new route marker, but do not rely on this alone.
s, count = re.subn(
    r'private static final String NUBO_URL\s*=\s*"https://nubo\.ainubo\.com/\?native=[^"]+";',
    'private static final String NUBO_URL_BASE = "https://nubo.ainubo.com/?native=android-v25";',
    s,
    count=1,
)
if count != 1:
    raise SystemExit("V25 fresh webview: NUBO_URL anchor missing")

const_anchor = '    private static final int MICROPHONE_PERMISSION_REQUEST = 8111;\n'
helper = '''    private static final int MICROPHONE_PERMISSION_REQUEST = 8111;\n\n    private static String freshNuboUrl() {\n        return NUBO_URL_BASE + "&v=" + System.currentTimeMillis();\n    }\n'''
if const_anchor not in s:
    raise SystemExit("V25 fresh webview: permission constant anchor missing")
s = s.replace(const_anchor, helper, 1)

# 2) Never restore a stale WebView navigation tree. Always load a fresh URL.
restore_pattern = re.compile(
    r'''        if \(savedInstanceState == null\) \{\n            webView\.loadUrl\([^\n]+\);\n        \} else \{\n            webView\.restoreState\(savedInstanceState\);\n        \}'''
)
replacement = '''        webView.clearCache(true);\n        webView.clearHistory();\n        webView.loadUrl(\n            freshNuboUrl(),\n            java.util.Collections.singletonMap("Cache-Control", "no-cache")\n        );'''
s, count = restore_pattern.subn(replacement, s, count=1)
if count != 1:
    raise SystemExit("V25 fresh webview: restoreState block missing")

# 3) Disable WebView cache for navigation/static bundle fetches.
cache_anchor = '        settings.setDatabaseEnabled(true);\n'
if cache_anchor not in s:
    raise SystemExit("V25 fresh webview: WebSettings anchor missing")
if 'settings.setCacheMode(WebSettings.LOAD_NO_CACHE);' not in s:
    s = s.replace(
        cache_anchor,
        cache_anchor + '        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);\n',
        1,
    )

# 4) Do not persist WebView state back into Activity saved state.
s, count = re.subn(
    r'''    @Override\n    protected void onSaveInstanceState\(Bundle outState\) \{\n(?:        .*\n)*?    \}''',
    '''    @Override\n    protected void onSaveInstanceState(Bundle outState) {\n        // V25: do not persist WebView navigation/JS bundle state.\n        super.onSaveInstanceState(outState);\n    }''',
    s,
    count=1,
)
if count != 1:
    raise SystemExit("V25 fresh webview: onSaveInstanceState anchor missing")

# 5) Surface native version so the page can confirm the shell revision.
s = re.sub(
    r'''public String getNativeVersion\(\) \{\n            return "[^"]+";\n        \}''',
    '''public String getNativeVersion() {\n            return "android-v25";\n        }''',
    s,
    count=1,
)
s = re.sub(
    r"dataset\.nuboNative='[^']+'",
    "dataset.nuboNative='android-v25'",
    s,
    count=1,
)
s = re.sub(
    r"version:'[^']+'",
    "version:'android-v25'",
    s,
    count=1,
)

main.write_text(s)

# Native package version bump after Stable 3.3 materialization.
g = app.read_text()
if "versionCode 3300" not in g or 'versionName "3.3.0-youtube-background-nosetup"' not in g:
    raise SystemExit("V25 fresh webview: expected Stable 3.3 version markers missing")
g = g.replace("versionCode 3300", "versionCode 3301", 1)
g = g.replace(
    'versionName "3.3.0-youtube-background-nosetup"',
    'versionName "22.2.3-googlehome-nativewake-webviewfresh"',
    1,
)
app.write_text(g)

final_main = main.read_text()
final_app = app.read_text()
for token in [
    'NUBO_URL_BASE = "https://nubo.ainubo.com/?native=android-v25"',
    'System.currentTimeMillis()',
    'settings.setCacheMode(WebSettings.LOAD_NO_CACHE);',
    'webView.clearCache(true);',
    'java.util.Collections.singletonMap("Cache-Control", "no-cache")',
    'return "android-v25";',
]:
    if token not in final_main:
        raise SystemExit("V25 fresh webview marker missing: " + token)
if 'webView.restoreState(savedInstanceState)' in final_main:
    raise SystemExit("V25 fresh webview must not restore stale WebView state")
if 'webView.saveState(outState)' in final_main:
    raise SystemExit("V25 fresh webview must not persist stale WebView state")
for token in ["versionCode 3301", 'versionName "22.2.3-googlehome-nativewake-webviewfresh"']:
    if token not in final_app:
        raise SystemExit("V25 app version marker missing: " + token)

print("Applied Android V25 fresh-WebView shell: dynamic URL, no cache, no saved-state restore")
