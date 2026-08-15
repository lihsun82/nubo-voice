from pathlib import Path
import runpy

runpy.run_path("scripts/apply-youtube-v49-exact-once.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 49", "versionCode 50", "V50 versionCode")
s = replace_once(s, 'versionName "0.49.0-youtube-exact-once"', 'versionName "0.50.0-youtube-native-autoplay-guard"', "V50 versionName")
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v49", "android-v50")
s = s.replace("NUBO-Android/49", "NUBO-Android/50")
s = s.replace("bundle=v49", "bundle=v50")
s = s.replace("nubo_v49_bundle_flushed", "nubo_v50_bundle_flushed")

if "import android.app.SearchManager;" not in s:
    s = replace_once(s, "import android.app.PictureInPictureParams;\n", "import android.app.PictureInPictureParams;\nimport android.app.SearchManager;\n", "SearchManager import")
if "import android.provider.MediaStore;" not in s:
    s = replace_once(s, "import android.provider.Settings;\n", "import android.provider.Settings;\nimport android.provider.MediaStore;\n", "MediaStore import")

field_marker = '    private static final int MICROPHONE_PERMISSION_REQUEST = 8111;\n'
fields = '''    private static final int MICROPHONE_PERMISSION_REQUEST = 8111;\n    private static final String YOUTUBE_PREFS = "nubo_youtube_v50";\n    private static final String YOUTUBE_LAST_SIGNATURE = "last_signature";\n    private static final String YOUTUBE_LAST_AT = "last_at";\n    private static final long YOUTUBE_RELAUNCH_GUARD_MS = 60_000L;\n'''
s = replace_once(s, field_marker, fields, "persistent dedupe fields")

old_override = '''            Uri uri = request.getUrl();\n            if (isTrustedNuboUri(uri)) {\n                return false;\n            }\n\n            launchGenericUri(uri);\n            return true;\n'''
new_override = '''            Uri uri = request.getUrl();\n            if (isTrustedNuboUri(uri)) {\n                return false;\n            }\n\n            if (handleYouTubeIntentV50(uri)) {\n                return true;\n            }\n\n            launchGenericUri(uri);\n            return true;\n'''
s = replace_once(s, old_override, new_override, "YouTube WebView interception")

marker = '    private static final class NuboNativeBridge {\n'
helpers = r'''    private boolean isDuplicateYouTubeLaunchV50(String signature) {
        if (signature == null || signature.trim().isEmpty()) return false;
        long now = System.currentTimeMillis();
        android.content.SharedPreferences prefs = getSharedPreferences(YOUTUBE_PREFS, MODE_PRIVATE);
        String previous = prefs.getString(YOUTUBE_LAST_SIGNATURE, "");
        long previousAt = prefs.getLong(YOUTUBE_LAST_AT, 0L);
        if (signature.equals(previous) && now - previousAt < YOUTUBE_RELAUNCH_GUARD_MS) return true;
        prefs.edit().putString(YOUTUBE_LAST_SIGNATURE, signature).putLong(YOUTUBE_LAST_AT, now).apply();
        return false;
    }

    private boolean startYouTubeIntentV50(Intent intent) {
        if (intent == null) return false;
        try {
            startActivity(intent);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.ECLAIR) overridePendingTransition(0, 0);
            return true;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private boolean handleYouTubeIntentV50(Uri rawUri) {
        if (rawUri == null || !"intent".equalsIgnoreCase(rawUri.getScheme())) return false;
        final Intent parsed;
        try {
            parsed = Intent.parseUri(rawUri.toString(), Intent.URI_INTENT_SCHEME);
        } catch (Exception ignored) {
            return false;
        }

        if (!"com.google.android.youtube".equals(parsed.getPackage())) return false;
        Uri data = parsed.getData();
        if (data == null) return false;
        String host = data.getHost() == null ? "" : data.getHost().toLowerCase(Locale.ROOT);
        if (!(host.contains("youtube.com") || host.equals("youtu.be"))) return false;

        String videoId = data.getQueryParameter("v");
        if ((videoId == null || videoId.trim().isEmpty()) && host.equals("youtu.be")) {
            List<String> segments = data.getPathSegments();
            if (!segments.isEmpty()) videoId = segments.get(0);
        }

        if (videoId != null && videoId.matches("[A-Za-z0-9_-]{11}")) {
            String signature = "video:" + videoId;
            if (isDuplicateYouTubeLaunchV50(signature)) return true;
            Uri exact = Uri.parse("https://www.youtube.com/watch?v=" + videoId);
            Intent exactIntent = new Intent(Intent.ACTION_VIEW, exact);
            exactIntent.setPackage("com.google.android.youtube");
            exactIntent.addCategory(Intent.CATEGORY_BROWSABLE);
            exactIntent.putExtra("nubo_youtube_build", "v50-native-exact");
            if (startYouTubeIntentV50(exactIntent)) return true;
        }

        String query = data.getQueryParameter("search_query");
        if (query != null && !query.trim().isEmpty()) {
            String safeQuery = query.trim();
            String signature = "search:" + safeQuery.toLowerCase(Locale.ROOT);
            if (isDuplicateYouTubeLaunchV50(signature)) return true;
            Intent playFromSearch = new Intent(MediaStore.INTENT_ACTION_VIDEO_PLAY_FROM_SEARCH);
            playFromSearch.setPackage("com.google.android.youtube");
            playFromSearch.addCategory(Intent.CATEGORY_DEFAULT);
            playFromSearch.putExtra(SearchManager.QUERY, safeQuery);
            playFromSearch.putExtra(MediaStore.EXTRA_MEDIA_FOCUS, "vnd.android.cursor.item/video");
            playFromSearch.putExtra(MediaStore.EXTRA_MEDIA_TITLE, safeQuery);
            playFromSearch.putExtra("nubo_youtube_build", "v50-native-play-from-search");
            if (playFromSearch.resolveActivity(getPackageManager()) != null && startYouTubeIntentV50(playFromSearch)) return true;
        }

        String signature = "url:" + data.toString();
        if (isDuplicateYouTubeLaunchV50(signature)) return true;
        Intent fallback = new Intent(Intent.ACTION_VIEW, data);
        fallback.setPackage("com.google.android.youtube");
        fallback.addCategory(Intent.CATEGORY_BROWSABLE);
        fallback.putExtra("nubo_youtube_build", "v50-native-url-fallback");
        return startYouTubeIntentV50(fallback);
    }

'''
s = replace_once(s, marker, helpers + marker, "native YouTube helpers")
main.write_text(s)

final_source = main.read_text()
for token in ["NUBO-Android/50", "android-v50", "nubo_v50_bundle_flushed", "YOUTUBE_RELAUNCH_GUARD_MS = 60_000L", "handleYouTubeIntentV50", "MediaStore.INTENT_ACTION_VIDEO_PLAY_FROM_SEARCH", "SearchManager.QUERY", '"com.google.android.youtube"', "public boolean googleHomeControl"]:
    if token not in final_source:
        raise SystemExit(f"missing V50 marker: {token}")

print("Applied V50 native YouTube autoplay + persistent relaunch guard")
