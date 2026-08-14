from pathlib import Path
import runpy


# V34 keeps the validated V33 transcript fast-route + V32 exact-video path,
# but changes HOW the exact YouTube activity is launched while NUBO is in PiP.
# Android 14+ background-activity-launch rules require an explicit opt-in when
# a PendingIntent is used to start an activity from a background/PiP context.
# Google Home, Gemini voice, Sense, PiP lifecycle and avatar/UI are unchanged.
runpy.run_path("scripts/apply-youtube-fast-route-v33-build.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 33", "versionCode 34", "V34 versionCode")
s = replace_once(
    s,
    'versionName "0.33.0-youtube-local-fast-route"',
    'versionName "0.34.0-youtube-bal-pendingintent"',
    "V34 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

s = replace_once(
    s,
    "import android.app.Activity;\nimport android.app.PictureInPictureParams;",
    "import android.app.Activity;\nimport android.app.ActivityOptions;\nimport android.app.PendingIntent;\nimport android.app.PictureInPictureParams;",
    "V34 PendingIntent imports",
)

marker = '''    private Intent buildExactYouTubeVideoIntent(Uri preferredUri, String packageName) {\n'''
helpers = r'''    private boolean launchYouTubeWithBalPendingIntent(
        Intent intent,
        String packageName
    ) {
        if (intent == null || !"com.google.android.youtube".equals(packageName)) {
            return false;
        }

        try {
            // V34: NUBO is intentionally still visible as PiP while YouTube owns
            // the main foreground window. On Android 14+ a second activity start
            // can be treated as a background activity launch. Use a PendingIntent
            // and explicitly grant BAL privileges on both creator and sender side
            // so the new exact-video request is dispatched immediately instead of
            // remaining deferred until the user dismisses the current YouTube task.
            int pendingFlags = PendingIntent.FLAG_CANCEL_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
            }

            String dataKey = intent.getDataString();
            int requestCode = 34000 ^ (dataKey == null ? 0 : dataKey.hashCode());

            Bundle creatorBundle = null;
            if (Build.VERSION.SDK_INT >= 34) {
                ActivityOptions creatorOptions = ActivityOptions.makeBasic();
                creatorOptions.setPendingIntentCreatorBackgroundActivityStartMode(
                    ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
                );
                creatorBundle = creatorOptions.toBundle();
            }

            PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                requestCode,
                intent,
                pendingFlags,
                creatorBundle
            );

            if (Build.VERSION.SDK_INT >= 34) {
                ActivityOptions senderOptions = ActivityOptions.makeBasic();
                senderOptions.setPendingIntentBackgroundActivityStartMode(
                    ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
                );
                pendingIntent.send(
                    this,
                    0,
                    null,
                    null,
                    null,
                    null,
                    senderOptions.toBundle()
                );
            } else {
                pendingIntent.send();
            }
            return true;
        } catch (PendingIntent.CanceledException | RuntimeException ignored) {
            return false;
        }
    }

'''

if "private boolean launchYouTubeWithBalPendingIntent" not in s:
    s = replace_once(s, marker, helpers + marker, "V34 BAL PendingIntent helper")

old_exact_launch = '''        if (exactYouTubeIntent != null) {\n            try {\n                startActivity(exactYouTubeIntent);\n                return;\n            } catch (ActivityNotFoundException ignored) {\n                // Older/variant YouTube builds may not expose the exact-video URI.\n                // Fall through to the normal HTTPS app link below.\n            }\n        }\n'''

new_exact_launch = '''        if (exactYouTubeIntent != null) {\n            if (launchYouTubeWithBalPendingIntent(exactYouTubeIntent, packageName)) {\n                return;\n            }\n            try {\n                // Fail-open fallback for devices below Android 14 or OEM builds\n                // that reject the PendingIntent path for their YouTube activity.\n                startActivity(exactYouTubeIntent);\n                return;\n            } catch (ActivityNotFoundException ignored) {\n                // Older/variant YouTube builds may not expose the exact-video URI.\n                // Fall through to the normal HTTPS app link below.\n            }\n        }\n'''

s = replace_once(s, old_exact_launch, new_exact_launch, "V34 exact-video PendingIntent launch")
s = s.replace('"v33-local-fast-route"', '"v34-bal-pendingintent"', 1)
s = s.replace("android-v33", "android-v34")
s = s.replace("NUBO-Android/33", "NUBO-Android/34")
main.write_text(s)

print("Applied V34 YouTube exact-video PendingIntent BAL launch path")
