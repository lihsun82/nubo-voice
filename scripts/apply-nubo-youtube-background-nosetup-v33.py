from pathlib import Path
import re

# NUBO 3.3 — no-extra-setting YouTube background voice/switching.
# Runs AFTER Stable 3 + Google Home + V3.1 native background PCM materialization.
# Keeps the V3.1 Android AudioRecord -> Gemini Live bridge, but replaces the
# Stable/V9 direct YouTube bridge with a no-accessibility route that starts
# background microphone ownership BEFORE YouTube takes foreground and uses a
# fresh package-scoped task for repeated song/video requests.

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 3100", "versionCode 3300", 1)
s = s.replace(
    'versionName "3.1.0-youtube-background-cloud-mic"',
    'versionName "3.3.0-youtube-background-nosetup"',
    1,
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

# Replace the V9 bridge. Critical ordering: beginExternalVoiceKeepAlive() first;
# V3.1 then asks WebView to release getUserMedia and starts native AudioRecord.
# YouTube launches only after that handoff window.
pattern = re.compile(
    r'''        @JavascriptInterface\n        public boolean playYouTubeNoSetup\(.*?\n        \}\n\n(?=        @JavascriptInterface\n        public boolean isExternalVoiceKeepAliveActive\(\))''',
    re.S,
)
match = pattern.search(s)
if not match:
    raise SystemExit("3.3: playYouTubeNoSetup bridge not found")

bridge = r'''        @JavascriptInterface
        public boolean playYouTubeNoSetup(
            String query,
            String targetUrl,
            String label
        ) {
            if (targetUrl == null || label == null) return false;
            String safeQuery = query == null ? "" : query.trim();
            String safeTarget = targetUrl.trim();
            String safeLabel = label.trim();
            if (safeTarget.isEmpty() || safeLabel.isEmpty()) return false;
            if (!activity.isAllowedBridgeTarget(safeTarget, safeLabel)) return false;

            activity.runOnUiThread(() -> {
                // NUBO 3.3: this MUST happen while NUBO is still visible.
                // V3.1 background PCM ownership is armed here before YouTube starts.
                activity.beginExternalVoiceKeepAlive();

                activity.webView.postDelayed(
                    () -> activity.launchYouTubeNoSetupV33(
                        safeQuery,
                        safeTarget,
                        safeLabel
                    ),
                    650L
                );
            });
            return true;
        }

'''
s = s[:match.start()] + bridge + s[match.end():]

launch_anchor = "    private void launchExternalTarget(String targetUrl, String label) {\n"
if launch_anchor not in s:
    raise SystemExit("3.3: launchExternalTarget anchor missing")

helpers = r'''    private boolean startYouTubeIntentV33(Intent intent) {
        if (intent == null) return false;
        try {
            startActivity(intent);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.ECLAIR) {
                overridePendingTransition(0, 0);
            }
            return true;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private void makeFreshYouTubeTaskV33(Intent intent) {
        if (intent == null) return;
        intent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_MULTIPLE_TASK
                | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
                | Intent.FLAG_ACTIVITY_NO_ANIMATION
        );
        intent.putExtra("nubo_youtube_switch_build", "v33-background-nosetup");
    }

    private boolean launchYouTubeVoiceSearchV33(
        String packageName,
        String query,
        boolean music
    ) {
        if (query == null || query.trim().isEmpty()) return false;
        String safeQuery = query.trim();

        Intent searchIntent = new Intent(
            music
                ? android.provider.MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH
                : android.provider.MediaStore.INTENT_ACTION_VIDEO_PLAY_FROM_SEARCH
        );
        searchIntent.setPackage(packageName);
        searchIntent.addCategory(Intent.CATEGORY_DEFAULT);
        searchIntent.putExtra(android.app.SearchManager.QUERY, safeQuery);
        searchIntent.putExtra(
            android.provider.MediaStore.EXTRA_MEDIA_FOCUS,
            music ? "vnd.android.cursor.item/audio" : "vnd.android.cursor.item/video"
        );
        searchIntent.putExtra(android.provider.MediaStore.EXTRA_MEDIA_TITLE, safeQuery);
        makeFreshYouTubeTaskV33(searchIntent);

        if (searchIntent.resolveActivity(getPackageManager()) == null) return false;
        return startYouTubeIntentV33(searchIntent);
    }

    private boolean launchYouTubeNoSetupV33(
        String query,
        String targetUrl,
        String label
    ) {
        String normalizedLabel = label == null
            ? ""
            : label.trim().toLowerCase(Locale.ROOT);
        boolean music = normalizedLabel.equals("youtube music")
            || (targetUrl != null && targetUrl.contains("music.youtube.com"));
        String packageName = music
            ? "com.google.android.apps.youtube.music"
            : "com.google.android.youtube";
        Uri target = targetUrl == null || targetUrl.trim().isEmpty()
            ? null
            : Uri.parse(targetUrl.trim());

        // Exact resolved video ID is authoritative for normal YouTube.
        if (!music && target != null) {
            Intent exactIntent = new Intent(Intent.ACTION_VIEW, target);
            exactIntent.setPackage(packageName);
            exactIntent.addCategory(Intent.CATEGORY_BROWSABLE);
            makeFreshYouTubeTaskV33(exactIntent);
            exactIntent.putExtra("nubo_youtube_switch_query", query == null ? "" : query);
            if (startYouTubeIntentV33(exactIntent)) return true;
        }

        // Android's official voice media-search contract is the no-setup fallback.
        if (launchYouTubeVoiceSearchV33(packageName, query, music)) return true;

        // Final package-scoped exact URL fallback, still in a fresh task.
        if (target != null) {
            Intent viewIntent = new Intent(Intent.ACTION_VIEW, target);
            viewIntent.setPackage(packageName);
            viewIntent.addCategory(Intent.CATEGORY_BROWSABLE);
            makeFreshYouTubeTaskV33(viewIntent);
            if (startYouTubeIntentV33(viewIntent)) return true;
        }
        return false;
    }

'''
if "launchYouTubeNoSetupV33" not in s:
    s = s.replace(launch_anchor, helpers + launch_anchor, 1)

# Remove any accidental accessibility controller from this materialized build.
manifest = Path("android-nubo/app/src/main/AndroidManifest.xml")
ms = manifest.read_text()
ms = re.sub(
    r'\n\s*<service\b(?=[^>]*android:name="\.NuboYouTubeAccessibilityService")[^>]*/>\s*',
    "\n",
    ms,
    flags=re.S,
)
ms = re.sub(
    r'\n\s*<service\b(?=[^>]*android:name="\.NuboYouTubeAccessibilityService")[^>]*>.*?</service>\s*',
    "\n",
    ms,
    flags=re.S,
)
manifest.write_text(ms)
java_dir = Path("android-nubo/app/src/main/java/com/ainubo/nubo")
accessibility = java_dir / "NuboYouTubeAccessibilityService.java"
if accessibility.exists(): accessibility.unlink()
accessibility_xml = Path("android-nubo/app/src/main/res/xml/nubo_youtube_accessibility_service.xml")
if accessibility_xml.exists(): accessibility_xml.unlink()

main.write_text(s)

# Regression/architecture guards.
final_app = app.read_text(); final_main = main.read_text(); final_manifest = manifest.read_text()
for token in ["versionCode 3300", "3.3.0-youtube-background-nosetup"]:
    if token not in final_app: raise SystemExit("3.3 app marker missing: " + token)
for token in [
    "beginExternalVoiceKeepAlive();",
    "launchYouTubeNoSetupV33",
    "FLAG_ACTIVITY_MULTIPLE_TASK",
    "INTENT_ACTION_VIDEO_PLAY_FROM_SEARCH",
    "INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH",
    "650L",
    "public boolean googleHomeControl",
    "dispatchBackgroundPcmFromService",
]:
    if token not in final_main: raise SystemExit("3.3 MainActivity marker missing: " + token)
if "NuboYouTubeAccessibilityService" in final_manifest:
    raise SystemExit("3.3 must not require AccessibilityService")
if accessibility.exists() or accessibility_xml.exists():
    raise SystemExit("3.3 accessibility files must be absent")

# Ensure the background audio handoff precedes external launch in the bridge.
a = final_main.index("public boolean playYouTubeNoSetup(")
b = final_main.index("public boolean isExternalVoiceKeepAliveActive()", a)
block = final_main[a:b]
if block.index("beginExternalVoiceKeepAlive();") > block.index("launchYouTubeNoSetupV33"):
    raise SystemExit("3.3 invalid ordering: YouTube may launch before background mic handoff")

print("Applied NUBO 3.3: V3.1 native background PCM + no-accessibility fresh-task YouTube switching")
