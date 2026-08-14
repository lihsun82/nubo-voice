from pathlib import Path

# V39 is intentionally a SMALL patch applied directly after V28 + V29.
# It does NOT run V30-V38. This restores the proven native YouTube App bridge
# instead of carrying forward the failed task/IFrame/accessibility experiments.


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 29", "versionCode 39", "V39 versionCode")
s = replace_once(
    s,
    'versionName "0.29.0-googlehome"',
    'versionName "0.39.0-native-youtube-app-restored"',
    "V39 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

if "import android.content.ComponentName;" not in s:
    s = replace_once(
        s,
        "import android.content.ActivityNotFoundException;\n",
        "import android.content.ActivityNotFoundException;\nimport android.content.ComponentName;\n",
        "ComponentName import",
    )
if "import android.content.pm.ResolveInfo;" not in s:
    s = replace_once(
        s,
        "import android.content.pm.PackageManager;\n",
        "import android.content.pm.PackageManager;\nimport android.content.pm.ResolveInfo;\n",
        "ResolveInfo import",
    )

# Keep the historic openExternalApp bridge untouched. Add one dedicated YouTube
# method because the web layer already prefers playYouTubeNoSetup when available.
marker = '''        @JavascriptInterface\n        public boolean isExternalVoiceKeepAliveActive() {\n'''
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
                boolean alreadyInPip = activity.isNuboInPictureInPicture();
                if (!alreadyInPip) {
                    activity.beginExternalVoiceKeepAlive();
                } else {
                    activity.externalVoiceKeepAliveActive = true;
                    activity.activityForeground = true;
                    activity.webView.resumeTimers();
                }

                long delayMs = alreadyInPip ? 25L : 180L;
                activity.webView.postDelayed(
                    () -> activity.launchExactYouTubeVideo(
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
s = replace_once(s, marker, bridge + marker, "V39 JS bridge")

# Add runtime resolver immediately before the existing launchExternalTarget method.
marker = '''    private void launchExternalTarget(String targetUrl, String label) {\n'''
helpers = r'''    private String extractYouTubeVideoId(Uri uri) {
        if (uri == null) return null;
        String host = uri.getHost();
        if (host == null) return null;
        host = host.toLowerCase(Locale.ROOT);
        if (host.equals("youtu.be") || host.endsWith(".youtu.be")) {
            List<String> segments = uri.getPathSegments();
            return segments.isEmpty() ? null : segments.get(0);
        }
        if (host.equals("youtube.com") || host.endsWith(".youtube.com")) {
            String id = uri.getQueryParameter("v");
            if (id != null && !id.isEmpty()) return id;
            List<String> segments = uri.getPathSegments();
            if (segments.size() >= 2) {
                String first = segments.get(0);
                if ("shorts".equals(first) || "embed".equals(first) || "live".equals(first)) {
                    return segments.get(1);
                }
            }
        }
        return null;
    }

    private int scoreYouTubeDeepLinkActivity(
        ResolveInfo info,
        ComponentName launcherComponent,
        String packageName
    ) {
        if (info == null || info.activityInfo == null) return Integer.MIN_VALUE;
        if (!info.activityInfo.exported) return Integer.MIN_VALUE;
        if (!packageName.equals(info.activityInfo.packageName)) return Integer.MIN_VALUE;

        String activityName = info.activityInfo.name == null
            ? ""
            : info.activityInfo.name.toLowerCase(Locale.ROOT);
        ComponentName component = new ComponentName(
            info.activityInfo.packageName,
            info.activityInfo.name
        );

        int score = 1;
        if (launcherComponent == null || !component.equals(launcherComponent)) score += 100;
        if (activityName.contains("url")) score += 90;
        if (activityName.contains("deeplink") || activityName.contains("deep_link")) score += 85;
        if (activityName.contains("link")) score += 70;
        if (activityName.contains("dispatch")) score += 65;
        if (activityName.contains("router")) score += 55;
        if (activityName.contains("watch")) score += 45;
        if (activityName.contains("intent")) score += 35;
        if (activityName.contains("open")) score += 20;
        return score;
    }

    private boolean startYouTubeIntent(Intent intent) {
        if (intent == null) return false;
        try {
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException | SecurityException ignored) {
            return false;
        }
    }

    private boolean launchResolvedYouTubeDeepLink(
        String packageName,
        Uri exactUri,
        String query
    ) {
        Intent probe = new Intent(Intent.ACTION_VIEW, exactUri);
        probe.setPackage(packageName);
        probe.addCategory(Intent.CATEGORY_BROWSABLE);

        List<ResolveInfo> handlers;
        try {
            handlers = getPackageManager().queryIntentActivities(
                probe,
                PackageManager.MATCH_DEFAULT_ONLY
            );
        } catch (RuntimeException ignored) {
            return false;
        }
        if (handlers == null || handlers.isEmpty()) return false;

        Intent launcherIntent = getPackageManager().getLaunchIntentForPackage(packageName);
        ComponentName launcherComponent = launcherIntent == null
            ? null
            : launcherIntent.getComponent();

        ResolveInfo best = null;
        int bestScore = Integer.MIN_VALUE;
        for (ResolveInfo info : handlers) {
            int score = scoreYouTubeDeepLinkActivity(info, launcherComponent, packageName);
            if (score > bestScore) {
                best = info;
                bestScore = score;
            }
        }
        if (best == null || best.activityInfo == null) return false;

        Intent exactIntent = new Intent(Intent.ACTION_VIEW, exactUri);
        exactIntent.setComponent(new ComponentName(
            best.activityInfo.packageName,
            best.activityInfo.name
        ));
        exactIntent.addCategory(Intent.CATEGORY_BROWSABLE);
        exactIntent.putExtra("nubo_youtube_switch_build", "v39-runtime-deeplink-handler");
        exactIntent.putExtra("nubo_youtube_switch_query", query == null ? "" : query);

        // No task flags: address YouTube's URL dispatcher, not its old player task.
        return startYouTubeIntent(exactIntent);
    }

    private boolean launchLegacyYouTubeAppLink(
        String packageName,
        Uri exactUri,
        String query
    ) {
        Intent legacyIntent = new Intent(Intent.ACTION_VIEW, exactUri);
        legacyIntent.setPackage(packageName);
        legacyIntent.addCategory(Intent.CATEGORY_BROWSABLE);
        legacyIntent.putExtra("nubo_youtube_switch_build", "v39-v15-6-41-legacy-app-link");
        legacyIntent.putExtra("nubo_youtube_switch_query", query == null ? "" : query);

        // Exact semantic restore of V15.6.41: ACTION_VIEW + package + BROWSABLE,
        // deliberately with no NEW_TASK/CLEAR_TASK/MULTIPLE_TASK flags.
        return startYouTubeIntent(legacyIntent);
    }

    private void launchExactYouTubeVideo(
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

        Uri target = Uri.parse(targetUrl);
        String videoId = extractYouTubeVideoId(target);
        Uri exactUri = target;
        if (videoId != null && videoId.matches("^[A-Za-z0-9_-]{11}$")) {
            exactUri = music
                ? Uri.parse("https://music.youtube.com/watch?v=" + Uri.encode(videoId))
                : Uri.parse("https://www.youtube.com/watch?v=" + Uri.encode(videoId) + "&autoplay=1");
        }

        // First choice adapts to the user's currently installed YouTube build.
        if (launchResolvedYouTubeDeepLink(packageName, exactUri, query)) return;

        // Safety net is the known-good V15.6.41 launch behavior.
        if (launchLegacyYouTubeAppLink(packageName, exactUri, query)) return;

        launchGenericUri(exactUri);
    }

'''
s = replace_once(s, marker, helpers + marker, "V39 YouTube helpers")

s = s.replace("android-v28", "android-v39")
s = s.replace("NUBO-Android/28", "NUBO-Android/39")
main.write_text(s)

# Assertions make this patch fail closed if the historical baseline changes.
final_source = main.read_text()
required = [
    "public boolean playYouTubeNoSetup",
    "queryIntentActivities",
    "scoreYouTubeDeepLinkActivity",
    "v39-runtime-deeplink-handler",
    "v39-v15-6-41-legacy-app-link",
    "Intent.ACTION_VIEW",
    "Intent.CATEGORY_BROWSABLE",
    "com.google.android.youtube",
]
for token in required:
    if token not in final_source:
        raise SystemExit(f"missing V39 native YouTube marker: {token}")

# These only existed in the failed V30-V38 native experiments and must never be
# materialized by this direct-from-V29 build.
for forbidden in [
    "NuboYouTubePlayerActivity",
    "FLAG_ACTIVITY_MULTIPLE_TASK",
    "v38-room-music-autoplay",
    "v37-nubo-youtube-playback-agent",
    "NuboYouTubeAccessibilityService",
]:
    if forbidden in final_source:
        raise SystemExit(f"forbidden old YouTube architecture remains: {forbidden}")

print("Applied V39 directly over V29: restored native YouTube App bridge + runtime deep-link handler")
