from pathlib import Path
import runpy

# V41 starts from the validated V40 hybrid switch build. The only architectural
# change is how NUBO leaves the foreground for the FIRST YouTube launch.
#
# Root cause on Android 14-16 / ColorOS-class devices:
# V28-V40 called enterPictureInPictureMode() BEFORE startActivity(YouTube). That
# can demote NUBO from a fully resumed foreground Activity before the external
# Activity launch, making the subsequent launch vulnerable to Android Background
# Activity Launch restrictions. V41 arms Android's official auto-enter PiP while
# NUBO is still foreground, then launches YouTube. Android performs the PiP
# transition as NUBO loses foreground to YouTube.
runpy.run_path("scripts/apply-youtube-hybrid-v40.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 40", "versionCode 41", "V41 versionCode")
s = replace_once(
    s,
    'versionName "0.40.0-hybrid-youtube-ui-switch"',
    'versionName "0.41.0-youtube-foreground-auto-pip"',
    "V41 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

old = r'''    private void beginExternalVoiceKeepAlive() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            externalVoiceKeepAliveActive = false;
            return;
        }
        try {
            PictureInPictureParams params = new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(9, 16))
                .build();
            externalVoiceKeepAliveActive = enterPictureInPictureMode(params);
            if (externalVoiceKeepAliveActive) {
                activityForeground = true;
                webView.resumeTimers();
            }
        } catch (RuntimeException ignored) {
            externalVoiceKeepAliveActive = false;
        }
    }
'''

new = r'''    private void beginExternalVoiceKeepAlive() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            externalVoiceKeepAliveActive = false;
            return;
        }

        try {
            PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(9, 16));

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // V41: do NOT enter PiP before startActivity(YouTube).
                // Keep NUBO as the fully resumed foreground Activity, arm Android's
                // official auto-PiP transition, then let the upcoming YouTube launch
                // naturally move NUBO into PiP as it loses foreground.
                builder.setAutoEnterEnabled(true);
                setPictureInPictureParams(builder.build());
                externalVoiceKeepAliveActive = true;
                activityForeground = true;
                webView.resumeTimers();
                return;
            }

            // Android 8-11 do not support auto-enter PiP. Preserve the historic
            // behavior only on those older releases.
            externalVoiceKeepAliveActive = enterPictureInPictureMode(builder.build());
            if (externalVoiceKeepAliveActive) {
                activityForeground = true;
                webView.resumeTimers();
            }
        } catch (RuntimeException ignored) {
            // Fail open: YouTube should still be allowed to launch even if PiP setup
            // is unavailable on an OEM build.
            externalVoiceKeepAliveActive = false;
        }
    }
'''

s = replace_once(s, old, new, "V41 auto-PiP foreground launch")

# When NUBO returns to full foreground, explicitly disarm auto-enter PiP so a
# later unrelated navigation cannot unexpectedly shrink the app.
old_resume = r'''        if (!isNuboInPictureInPicture()) {
            externalVoiceKeepAliveActive = false;
        }
        webView.onResume();
'''
new_resume = r'''        if (!isNuboInPictureInPicture()) {
            externalVoiceKeepAliveActive = false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    setPictureInPictureParams(
                        new PictureInPictureParams.Builder()
                            .setAspectRatio(new Rational(9, 16))
                            .setAutoEnterEnabled(false)
                            .build()
                    );
                } catch (RuntimeException ignored) {
                    // OEM PiP implementations vary; foreground recovery must continue.
                }
            }
        }
        webView.onResume();
'''
s = replace_once(s, old_resume, new_resume, "V41 disarm auto-PiP on foreground return")

# Make the native build marker unambiguous for field diagnostics.
s = s.replace("android-v40", "android-v41")
s = s.replace("NUBO-Android/40", "NUBO-Android/41")
main.write_text(s)

final_source = main.read_text()
required = [
    "setAutoEnterEnabled(true)",
    "setAutoEnterEnabled(false)",
    "versionName",  # sanity marker lives in build.gradle; source generation must finish
    "NuboYouTubeAccessibilityService.requestSongSwitch(uiQuery)",
    "v39-runtime-deeplink-handler",
]
for token in required:
    if token == "versionName":
        continue
    if token not in final_source:
        raise SystemExit(f"missing V41 launch marker: {token}")

# Critical regression guard: Android 12+ path must not synchronously call
# enterPictureInPictureMode before launching YouTube.
start = final_source.index("    private void beginExternalVoiceKeepAlive()")
end = final_source.index("    private void endExternalVoiceKeepAlive()", start)
block = final_source[start:end]
assert "setAutoEnterEnabled(true)" in block
assert "Build.VERSION.SDK_INT >= Build.VERSION_CODES.S" in block

print("Applied V41: launch YouTube from resumed foreground, auto-enter NUBO PiP on handoff")
