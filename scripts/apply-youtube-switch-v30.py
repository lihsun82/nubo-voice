from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


# V30 is intentionally isolated to Android YouTube / YouTube Music switching.
# It does NOT modify NUBO voice, Sense, PiP lifecycle, avatar/UI or Google Home.

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 29", "versionCode 30", "V30 versionCode")
s = replace_once(
    s,
    'versionName "0.29.0-googlehome"',
    'versionName "0.30.0-youtube-switch"',
    "V30 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

old = '''    private void launchPackageOrFallback(\n        String packageName,\n        Uri preferredUri,\n        Uri fallbackUri\n    ) {\n        if (preferredUri != null) {\n            Intent explicitIntent = new Intent(Intent.ACTION_VIEW, preferredUri);\n            explicitIntent.setPackage(packageName);\n            explicitIntent.addCategory(Intent.CATEGORY_BROWSABLE);\n\n            try {\n                startActivity(explicitIntent);\n                return;\n            } catch (ActivityNotFoundException ignored) {\n                // Try the package launcher or browser fallback below.\n            }\n        }\n\n        Intent launchIntent = getPackageManager()\n            .getLaunchIntentForPackage(packageName);\n        if (launchIntent != null) {\n            try {\n                startActivity(launchIntent);\n                return;\n            } catch (ActivityNotFoundException ignored) {\n                // Continue to the browser fallback.\n            }\n        }\n\n        if (fallbackUri != null) {\n            launchGenericUri(fallbackUri);\n        }\n    }\n'''

new = '''    private boolean isYouTubeMediaPackage(String packageName) {\n        return "com.google.android.youtube".equals(packageName)\n            || "com.google.android.apps.youtube.music".equals(packageName);\n    }\n\n    private void prepareYouTubeSwitchIntent(Intent intent, String packageName) {\n        if (intent == null || !isYouTubeMediaPackage(packageName)) return;\n\n        // Reuse the existing YouTube task/player instead of stacking another\n        // ACTION_VIEW activity behind the song that is already on screen.\n        // This makes a voice request for a different song replace the current\n        // track immediately instead of waiting for the user to swipe the old one away.\n        intent.addFlags(\n            Intent.FLAG_ACTIVITY_NEW_TASK\n                | Intent.FLAG_ACTIVITY_CLEAR_TOP\n                | Intent.FLAG_ACTIVITY_SINGLE_TOP\n        );\n        intent.putExtra("nubo_youtube_switch_build", "v30-instant-switch");\n    }\n\n    private void launchPackageOrFallback(\n        String packageName,\n        Uri preferredUri,\n        Uri fallbackUri\n    ) {\n        if (preferredUri != null) {\n            Intent explicitIntent = new Intent(Intent.ACTION_VIEW, preferredUri);\n            explicitIntent.setPackage(packageName);\n            explicitIntent.addCategory(Intent.CATEGORY_BROWSABLE);\n            prepareYouTubeSwitchIntent(explicitIntent, packageName);\n\n            try {\n                startActivity(explicitIntent);\n                return;\n            } catch (ActivityNotFoundException ignored) {\n                // Try the package launcher or browser fallback below.\n            }\n        }\n\n        Intent launchIntent = getPackageManager()\n            .getLaunchIntentForPackage(packageName);\n        if (launchIntent != null) {\n            prepareYouTubeSwitchIntent(launchIntent, packageName);\n            try {\n                startActivity(launchIntent);\n                return;\n            } catch (ActivityNotFoundException ignored) {\n                // Continue to the browser fallback.\n            }\n        }\n\n        if (fallbackUri != null) {\n            launchGenericUri(fallbackUri);\n        }\n    }\n'''

s = replace_once(s, old, new, "YouTube package launch task reuse")
main.write_text(s)
