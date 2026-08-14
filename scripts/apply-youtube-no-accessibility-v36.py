from pathlib import Path
import runpy

# V36 deliberately starts from the last no-accessibility baseline (V34), not V35.
# It keeps V28 voice/PiP/UI, V29 Google Home, V33 transcript fast-route and V34
# Android 14 BAL fallback intact, but replaces the repeated-song launch strategy.
# No AccessibilityService, notification-listener, overlay or other user setup is used.
runpy.run_path("scripts/apply-youtube-switch-v34-pendingintent-bal.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 34", "versionCode 36", "V36 versionCode")
s = replace_once(
    s,
    'versionName "0.34.0-youtube-bal-pendingintent"',
    'versionName "0.36.0-youtube-no-accessibility"',
    "V36 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

s = replace_once(
    s,
    "import android.app.PendingIntent;\nimport android.app.PictureInPictureParams;",
    "import android.app.PendingIntent;\nimport android.app.PictureInPictureParams;\nimport android.app.SearchManager;",
    "V36 SearchManager import",
)
s = replace_once(
    s,
    "import android.os.Looper;\nimport android.speech.RecognitionListener;",
    "import android.os.Looper;\nimport android.provider.MediaStore;\nimport android.speech.RecognitionListener;",
    "V36 MediaStore import",
)

bridge_marker = '''        @JavascriptInterface
        public boolean startWakeListener() {
'''
bridge = r'''        @JavascriptInterface
        public boolean playYouTubeNoSetup(String query, String targetUrl, String label) {
            if (targetUrl == null || label == null) return false;

            String safeQuery = query == null ? "" : query.trim();
            String safeTarget = targetUrl.trim();
            String safeLabel = label.trim();
            if (safeTarget.isEmpty() || safeLabel.isEmpty()) return false;
            if (!activity.isAllowedBridgeTarget(safeTarget, safeLabel)) return false;

            activity.runOnUiThread(() -> {
                // Critical V36 fix: on a second song request NUBO is already in PiP.
                // Do NOT ask Android to enter PiP again; launch the replacement track
                // immediately from the already-visible PiP activity.
                boolean alreadyInPip = activity.isNuboInPictureInPicture();
                if (!alreadyInPip) {
                    activity.beginExternalVoiceKeepAlive();
                } else {
                    activity.externalVoiceKeepAliveActive = true;
                    activity.activityForeground = true;
                    activity.webView.resumeTimers();
                }

                long delayMs = alreadyInPip ? 40L : 180L;
                activity.webView.postDelayed(
                    () -> activity.launchYouTubeNoSetup(
                        safeQuery,
                        safeTarget,
                        safeLabel
                    ),
                    delayMs
                );
            });
            return true;
        }

'''
if "public boolean playYouTubeNoSetup" not in s:
    s = replace_once(s, bridge_marker, bridge + bridge_marker, "V36 no-setup JS bridge")

launch_marker = '''    private void launchExternalTarget(String targetUrl, String label) {
'''
helpers = r'''    private boolean startYouTubeIntentNoSetup(Intent intent) {
        if (intent == null) return false;
        try {
            startActivity(intent);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.ECLAIR) {
                overridePendingTransition(0, 0);
            }
            return true;
        } catch (ActivityNotFoundException | SecurityException | RuntimeException ignored) {
            return false;
        }
    }

    private void makeFreshYouTubeTask(Intent intent) {
        if (intent == null) return;
        // FLAG_ACTIVITY_NEW_TASK alone can simply resurrect YouTube's old player.
        // MULTIPLE_TASK explicitly skips matching existing tasks and creates a fresh
        // target task for the requested video. EXCLUDE_FROM_RECENTS prevents one
        // voice song switch from creating a pile of YouTube cards in Recents.
        intent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_MULTIPLE_TASK
                | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
                | Intent.FLAG_ACTIVITY_NO_ANIMATION
        );
        intent.putExtra("nubo_youtube_switch_build", "v36-no-setup-fresh-task");
    }

    private boolean launchYouTubeVoiceSearchNoSetup(
        String packageName,
        String query,
        boolean music
    ) {
        if (query == null || query.trim().isEmpty()) return false;

        String safeQuery = query.trim();
        Intent searchIntent = new Intent(
            music
                ? MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH
                : MediaStore.INTENT_ACTION_VIDEO_PLAY_FROM_SEARCH
        );
        searchIntent.setPackage(packageName);
        searchIntent.addCategory(Intent.CATEGORY_DEFAULT);
        searchIntent.putExtra(SearchManager.QUERY, safeQuery);

        if (music) {
            searchIntent.putExtra(
                MediaStore.EXTRA_MEDIA_FOCUS,
                "vnd.android.cursor.item/audio"
            );
            searchIntent.putExtra(MediaStore.EXTRA_MEDIA_TITLE, safeQuery);
        }

        makeFreshYouTubeTask(searchIntent);
        if (searchIntent.resolveActivity(getPackageManager()) == null) {
            return false;
        }
        return startYouTubeIntentNoSetup(searchIntent);
    }

    private boolean launchYouTubeNoSetup(
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

        // Primary path for normal YouTube: NUBO already resolved the exact video ID.
        // Launch that exact video in a genuinely fresh YouTube task instead of
        // bringing the old player task back to the foreground.
        if (!music && target != null) {
            Intent exactIntent = buildExactYouTubeVideoIntent(target, packageName);
            if (exactIntent != null) {
                makeFreshYouTubeTask(exactIntent);
                exactIntent.putExtra("nubo_youtube_switch_query", query == null ? "" : query);
                if (startYouTubeIntentNoSetup(exactIntent)) {
                    return true;
                }
            }
        }

        // Official Android voice-media intent fallback. Apps that implement this
        // action search their own catalogue and automatically play a matching item.
        if (launchYouTubeVoiceSearchNoSetup(packageName, query, music)) {
            return true;
        }

        // Final package-scoped HTTPS fallback, still forced into a fresh task so an
        // existing YouTube player cannot swallow the new request.
        if (target != null) {
            Intent viewIntent = new Intent(Intent.ACTION_VIEW, target);
            viewIntent.setPackage(packageName);
            viewIntent.addCategory(Intent.CATEGORY_BROWSABLE);
            makeFreshYouTubeTask(viewIntent);
            if (startYouTubeIntentNoSetup(viewIntent)) {
                return true;
            }
        }

        return false;
    }

'''
if "private boolean launchYouTubeNoSetup" not in s:
    s = replace_once(s, launch_marker, helpers + launch_marker, "V36 no-setup helpers")

s = s.replace('"v34-bal-pendingintent"', '"v36-no-accessibility-fresh-task"', 1)
s = s.replace("android-v34", "android-v36")
s = s.replace("NUBO-Android/34", "NUBO-Android/36")
main.write_text(s)

print("Applied V36 YouTube no-accessibility fresh-task + media-search path")
