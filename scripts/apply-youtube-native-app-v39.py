from pathlib import Path
import runpy

# V39 deliberately starts from V38 so current Google Home, Gemini voice/PiP,
# Sense/YAMNet, avatar/UI and exact-video resolver remain intact. It then removes
# the V37/V38 NUBO-owned IFrame player and restores the historically successful
# V15.6.41 native YouTube App ACTION_VIEW path. The only new behavior is runtime
# discovery of YouTube's actual deep-link handler so a second exact videoId is
# delivered to the URL dispatcher instead of merely resurrecting the old task.
runpy.run_path("scripts/apply-youtube-room-player-v38.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


def replace_java_method(text: str, signature: str, replacement: str, label: str) -> str:
    start = text.find(signature)
    if start < 0:
        raise SystemExit(f"missing Java method: {label}")
    brace = text.find("{", start)
    if brace < 0:
        raise SystemExit(f"missing Java method brace: {label}")
    depth = 0
    i = brace
    while i < len(text):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[:start] + replacement + text[i + 1:]
        i += 1
    raise SystemExit(f"unterminated Java method: {label}")


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 38", "versionCode 39", "V39 versionCode")
s = replace_once(
    s,
    'versionName "0.38.0-room-music-autoplay"',
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
        "V39 ComponentName import",
    )
if "import android.content.pm.ResolveInfo;" not in s:
    s = replace_once(
        s,
        "import android.content.pm.PackageManager;\n",
        "import android.content.pm.PackageManager;\nimport android.content.pm.ResolveInfo;\n",
        "V39 ResolveInfo import",
    )

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
                // Preserve the proven NUBO PiP voice keep-alive. A second song is
                // launched immediately from the already-visible PiP activity.
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
s = replace_java_method(
    s,
    "        @JavascriptInterface\n        public boolean playYouTubeNoSetup",
    bridge,
    "V39 playYouTubeNoSetup bridge",
)

helpers = r'''    private int scoreYouTubeDeepLinkActivity(
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

    private boolean launchResolvedYouTubeDeepLink(
        String packageName,
        Uri exactUri,
        String query
    ) {
        if (exactUri == null) return false;

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
            int score = scoreYouTubeDeepLinkActivity(
                info,
                launcherComponent,
                packageName
            );
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
        exactIntent.putExtra(
            "nubo_youtube_switch_build",
            "v39-runtime-deeplink-handler"
        );
        exactIntent.putExtra(
            "nubo_youtube_switch_query",
            query == null ? "" : query
        );

        // Intentionally NO NEW_TASK/CLEAR_TASK/MULTIPLE_TASK flags here. The old
        // V15.6.41 path worked by letting YouTube's own URL dispatcher consume the
        // watch URI. V39 explicitly addresses that dispatcher instead of reviving
        // YouTube's launcher/player task.
        return startYouTubeIntentNoSetup(exactIntent);
    }

    private boolean launchLegacyYouTubeAppLink(
        String packageName,
        Uri exactUri,
        String query
    ) {
        if (exactUri == null) return false;
        Intent legacyIntent = new Intent(Intent.ACTION_VIEW, exactUri);
        legacyIntent.setPackage(packageName);
        legacyIntent.addCategory(Intent.CATEGORY_BROWSABLE);
        legacyIntent.putExtra(
            "nubo_youtube_switch_build",
            "v39-v15-6-41-legacy-app-link"
        );
        legacyIntent.putExtra(
            "nubo_youtube_switch_query",
            query == null ? "" : query
        );
        // This is deliberately equivalent to the proven V15.6.41 bridge:
        // ACTION_VIEW + exact watch URI + package + CATEGORY_BROWSABLE, no task flags.
        return startYouTubeIntentNoSetup(legacyIntent);
    }

'''
launch_method = r'''    private boolean launchYouTubeNoSetup(
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
        if (target == null) return false;

        String videoId = extractYouTubeVideoId(target);
        Uri exactUri = target;
        if (videoId != null && videoId.matches("^[A-Za-z0-9_-]{11}$")) {
            exactUri = music
                ? Uri.parse("https://music.youtube.com/watch?v=" + Uri.encode(videoId))
                : Uri.parse(
                    "https://www.youtube.com/watch?v="
                        + Uri.encode(videoId)
                        + "&autoplay=1"
                );
        }

        // V39 primary path: resolve the CURRENT installed YouTube build's exported
        // watch/deep-link Activity at runtime and send the exact URI there. This is
        // designed for the second-song case where simply targeting the package can
        // bring the old player task back without consuming the new videoId.
        if (launchResolvedYouTubeDeepLink(packageName, exactUri, query)) {
            return true;
        }

        // Historical safety net: restore the V15.6.41 native bridge verbatim in
        // semantics. This was NUBO's known working zero-click YouTube App path.
        if (launchLegacyYouTubeAppLink(packageName, exactUri, query)) {
            return true;
        }

        return false;
    }
'''

s = replace_java_method(
    s,
    "    private boolean launchYouTubeNoSetup(",
    helpers + launch_method,
    "V39 native YouTube launcher",
)

s = s.replace("v38-room-music-autoplay", "v39-native-youtube-app-restored")
s = s.replace("android-v38", "android-v39")
s = s.replace("NUBO-Android/38", "NUBO-Android/39")
main.write_text(s)

manifest = Path("android-nubo/app/src/main/AndroidManifest.xml")
m = manifest.read_text()
player_activity = '''\n        <activity\n            android:name=".NuboYouTubePlayerActivity"\n            android:configChanges="orientation|screenSize|keyboardHidden|uiMode"\n            android:excludeFromRecents="false"\n            android:exported="false"\n            android:launchMode="singleTask"\n            android:screenOrientation="unspecified"\n            android:taskAffinity="com.ainubo.nubo.youtubeplayer"\n            android:windowSoftInputMode="adjustResize" />'''
if player_activity in m:
    m = m.replace(player_activity, "", 1)
manifest.write_text(m)

player = Path(
    "android-nubo/app/src/main/java/com/ainubo/nubo/NuboYouTubePlayerActivity.java"
)
if player.exists():
    player.unlink()

required = [
    "queryIntentActivities",
    "scoreYouTubeDeepLinkActivity",
    "v39-runtime-deeplink-handler",
    "v39-v15-6-41-legacy-app-link",
    "Intent.ACTION_VIEW",
    "Intent.CATEGORY_BROWSABLE",
    "com.google.android.youtube",
]
final_source = main.read_text()
for marker in required:
    if marker not in final_source:
        raise SystemExit(f"missing V39 native YouTube marker: {marker}")

for forbidden in [
    "NuboYouTubePlayerActivity.isRunning",
    "FLAG_ACTIVITY_MULTIPLE_TASK",
    "v38-room-music-autoplay",
]:
    if forbidden in final_source:
        raise SystemExit(f"forbidden V39 old-player/task marker remains: {forbidden}")

if "NuboYouTubePlayerActivity" in manifest.read_text():
    raise SystemExit("V39 manifest still contains NuboYouTubePlayerActivity")

print("Applied V39 restored native YouTube App bridge + runtime deep-link handler")
