from pathlib import Path
import runpy

# V42 keeps V41 foreground/auto-PiP ordering, but removes the false-positive
# launch contract that made the web UI report success before Android had even
# attempted to start YouTube. It also prefers YouTube's native vnd.youtube: URI
# for exact video IDs before falling back to HTTPS deep-link handlers.
runpy.run_path("scripts/apply-youtube-launch-v41.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 41", "versionCode 42", "V42 versionCode")
s = replace_once(
    s,
    'versionName "0.41.0-youtube-foreground-auto-pip"',
    'versionName "0.42.0-youtube-verified-launch"',
    "V42 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

# JavascriptInterface calls normally arrive on WebView's bridge thread. Wait for
# the actual UI-thread startActivity attempt instead of returning true merely
# because a Runnable was queued.
if "import java.util.concurrent.CountDownLatch;" not in s:
    s = replace_once(
        s,
        "import java.util.Locale;\n",
        "import java.util.Locale;\nimport java.util.concurrent.CountDownLatch;\nimport java.util.concurrent.TimeUnit;\nimport java.util.concurrent.atomic.AtomicBoolean;\n",
        "V42 concurrency imports",
    )

old_launch_block = '''            activity.runOnUiThread(() -> {
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
'''
new_launch_block = '''            AtomicBoolean launchAccepted = new AtomicBoolean(false);
            CountDownLatch launchLatch = new CountDownLatch(1);

            Runnable launchTask = () -> {
                boolean alreadyInPip = activity.isNuboInPictureInPicture();
                if (!alreadyInPip) {
                    activity.beginExternalVoiceKeepAlive();
                } else {
                    activity.externalVoiceKeepAliveActive = true;
                    activity.activityForeground = true;
                    activity.webView.resumeTimers();
                }

                Runnable actualLaunch = () -> {
                    launchAccepted.set(
                        activity.launchExactYouTubeVideo(
                            safeQuery,
                            safeTarget,
                            safeLabel
                        )
                    );
                    launchLatch.countDown();
                };

                // V41 already keeps Android 12+ fully foreground. Do not add an
                // artificial 180ms gap before the external Activity request.
                if (alreadyInPip) {
                    activity.webView.postDelayed(actualLaunch, 25L);
                } else {
                    actualLaunch.run();
                }
            };

            if (Looper.myLooper() == Looper.getMainLooper()) {
                launchTask.run();
            } else {
                activity.runOnUiThread(launchTask);
                try {
                    launchLatch.await(1500L, TimeUnit.MILLISECONDS);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return false;
                }
            }
            return launchAccepted.get();
'''
s = replace_once(s, old_launch_block, new_launch_block, "V42 truthful JS launch ACK")

# Turn the exact-video launcher into a boolean contract and try the native
# vnd.youtube:<videoId> route first. This bypasses OEM/App-Link routing layers that
# may accept an HTTPS intent yet keep NUBO in the foreground.
s = replace_once(
    s,
    "    private void launchExactYouTubeVideo(\n",
    "    private boolean launchExactYouTubeVideo(\n",
    "V42 boolean exact launcher",
)

vendor_marker = '''        // First choice adapts to the user's currently installed YouTube build.
        if (launchResolvedYouTubeDeepLink(packageName, exactUri, query)) return;
'''
vendor_replacement = '''        // V42 first choice: address the native YouTube video scheme directly.
        // This is intentionally package-scoped and only used for a validated
        // 11-character YouTube video ID.
        if (!music && videoId != null && videoId.matches("^[A-Za-z0-9_-]{11}$")) {
            Intent vendorIntent = new Intent(
                Intent.ACTION_VIEW,
                Uri.parse("vnd.youtube:" + videoId)
            );
            vendorIntent.setPackage(packageName);
            vendorIntent.putExtra("nubo_youtube_switch_build", "v42-vnd-youtube-direct");
            vendorIntent.putExtra("nubo_youtube_switch_query", query == null ? "" : query);
            if (startYouTubeIntent(vendorIntent)) return true;
        }

        // Second choice adapts to the user's currently installed YouTube build.
        if (launchResolvedYouTubeDeepLink(packageName, exactUri, query)) return true;
'''
s = replace_once(s, vendor_marker, vendor_replacement, "V42 vnd.youtube direct route")

s = replace_once(
    s,
    "        if (launchLegacyYouTubeAppLink(packageName, exactUri, query)) return;\n\n        launchGenericUri(exactUri);\n",
    '''        if (launchLegacyYouTubeAppLink(packageName, exactUri, query)) return true;

        Intent genericIntent = new Intent(Intent.ACTION_VIEW, exactUri);
        genericIntent.addCategory(Intent.CATEGORY_BROWSABLE);
        return startYouTubeIntent(genericIntent);
''',
    "V42 boolean launcher fallbacks",
)

s = s.replace("android-v41", "android-v42")
s = s.replace("NUBO-Android/41", "NUBO-Android/42")
main.write_text(s)

final_source = main.read_text()
for token in [
    "AtomicBoolean launchAccepted",
    "CountDownLatch launchLatch",
    "launchLatch.await(1500L, TimeUnit.MILLISECONDS)",
    "private boolean launchExactYouTubeVideo",
    "vnd.youtube:",
    "v42-vnd-youtube-direct",
    "return launchAccepted.get()",
    "setAutoEnterEnabled(true)",
    "NuboYouTubeAccessibilityService.requestSongSwitch(uiQuery)",
    "android-v42",
    "NUBO-Android/42",
]:
    if token not in final_source:
        raise SystemExit(f"missing V42 verified-launch marker: {token}")

print("Applied V42: foreground launch + native vnd.youtube + truthful bridge ACK")
