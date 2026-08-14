from pathlib import Path
import runpy


# V32 keeps the complete validated V31/V30/V29/V28 chain intact and changes
# only the Android YouTube launch path. Google Home, Gemini voice, Sense, PiP,
# avatar/UI and YouTube search/ranking are not modified here.
runpy.run_path("scripts/apply-youtube-switch-v31-force-reset.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 31", "versionCode 32", "V32 versionCode")
s = replace_once(
    s,
    'versionName "0.31.0-youtube-force-reset"',
    'versionName "0.32.0-youtube-exact-video"',
    "V32 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

old_flags = '''        // V31: YouTube can ignore CLEAR_TOP/SINGLE_TOP while its current player\n        // task remains active. CLEAR_TASK + NEW_TASK makes Android finish the\n        // existing task associated with the target activity before starting the\n        // requested track as the new root. This mirrors the user's successful\n        // manual workaround (swiping away the old YouTube task) automatically,\n        // without touching NUBO's own task or voice session.\n        intent.setFlags(\n            Intent.FLAG_ACTIVITY_NEW_TASK\n                | Intent.FLAG_ACTIVITY_CLEAR_TASK\n        );\n        intent.putExtra("nubo_youtube_switch_build", "v31-force-task-reset");\n'''

new_flags = '''        // V32: never use NEW_TASK/CLEAR_TASK for an in-session song switch.\n        // NEW_TASK may simply bring YouTube's existing task back with its old\n        // player state. REORDER_TO_FRONT instead brings the resolved YouTube\n        // activity to the front and SINGLE_TOP allows the exact-video intent to\n        // be delivered to an already-top activity without stacking another task.\n        intent.setFlags(\n            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT\n                | Intent.FLAG_ACTIVITY_SINGLE_TOP\n                | Intent.FLAG_ACTIVITY_NO_ANIMATION\n        );\n        intent.putExtra("nubo_youtube_switch_build", "v32-exact-video");\n'''

s = replace_once(s, old_flags, new_flags, "V32 task flags")

marker = '''    private void launchPackageOrFallback(\n        String packageName,\n        Uri preferredUri,\n        Uri fallbackUri\n    ) {\n'''

helpers = r'''    private String extractYouTubeVideoId(Uri uri) {
        if (uri == null) return "";
        String host = uri.getHost();
        if (host == null) return "";
        String normalizedHost = host.toLowerCase(Locale.ROOT);

        if (normalizedHost.equals("youtu.be") || normalizedHost.endsWith(".youtu.be")) {
            List<String> segments = uri.getPathSegments();
            return segments.isEmpty() ? "" : segments.get(0).trim();
        }

        if (normalizedHost.equals("youtube.com")
            || normalizedHost.endsWith(".youtube.com")) {
            String videoId = uri.getQueryParameter("v");
            return videoId == null ? "" : videoId.trim();
        }

        return "";
    }

    private Intent buildExactYouTubeVideoIntent(Uri preferredUri, String packageName) {
        if (!"com.google.android.youtube".equals(packageName)) return null;
        String videoId = extractYouTubeVideoId(preferredUri);
        if (videoId.isEmpty()) return null;

        // Address the requested video itself instead of asking Android to reopen
        // the YouTube task. This is the critical V32 difference from V30/V31.
        Intent exactIntent = new Intent(
            Intent.ACTION_VIEW,
            Uri.parse("vnd.youtube:" + Uri.encode(videoId))
        );
        exactIntent.setPackage(packageName);
        exactIntent.addCategory(Intent.CATEGORY_BROWSABLE);
        prepareYouTubeSwitchIntent(exactIntent, packageName);
        exactIntent.putExtra("nubo_youtube_exact_video_id", videoId);
        return exactIntent;
    }

'''

if "private Intent buildExactYouTubeVideoIntent" not in s:
    s = replace_once(s, marker, helpers + marker, "V32 exact-video helpers")

old_launch = '''    private void launchPackageOrFallback(\n        String packageName,\n        Uri preferredUri,\n        Uri fallbackUri\n    ) {\n        if (preferredUri != null) {\n            Intent explicitIntent = new Intent(Intent.ACTION_VIEW, preferredUri);\n            explicitIntent.setPackage(packageName);\n            explicitIntent.addCategory(Intent.CATEGORY_BROWSABLE);\n            prepareYouTubeSwitchIntent(explicitIntent, packageName);\n\n            try {\n                startActivity(explicitIntent);\n                return;\n            } catch (ActivityNotFoundException ignored) {\n                // Try the package launcher or browser fallback below.\n            }\n        }\n'''

new_launch = '''    private void launchPackageOrFallback(\n        String packageName,\n        Uri preferredUri,\n        Uri fallbackUri\n    ) {\n        Intent exactYouTubeIntent = buildExactYouTubeVideoIntent(preferredUri, packageName);\n        if (exactYouTubeIntent != null) {\n            try {\n                startActivity(exactYouTubeIntent);\n                return;\n            } catch (ActivityNotFoundException ignored) {\n                // Older/variant YouTube builds may not expose the exact-video URI.\n                // Fall through to the normal HTTPS app link below.\n            }\n        }\n\n        if (preferredUri != null) {\n            Intent explicitIntent = new Intent(Intent.ACTION_VIEW, preferredUri);\n            explicitIntent.setPackage(packageName);\n            explicitIntent.addCategory(Intent.CATEGORY_BROWSABLE);\n            prepareYouTubeSwitchIntent(explicitIntent, packageName);\n\n            try {\n                startActivity(explicitIntent);\n                return;\n            } catch (ActivityNotFoundException ignored) {\n                // Try the package launcher or browser fallback below.\n            }\n        }\n'''

s = replace_once(s, old_launch, new_launch, "V32 exact-video first launch")
main.write_text(s)
