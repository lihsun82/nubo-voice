from pathlib import Path
import re
import subprocess

# NUBO 3.2 — combine the proven pieces instead of trading one regression for another:
# - Stable/V9 first-song direct YouTube launch remains the base
# - 3.1 native AudioRecord -> Gemini Live background PCM remains active
# - V40 YouTube-only AccessibilityService is restored for repeated song switches
# - Google Home files are not touched here


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"3.2 missing pattern: {label}")
    return text.replace(old, new, 1)

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 3100", "versionCode 3200", "versionCode")
s = replace_once(
    s,
    'versionName "3.1.0-youtube-background-cloud-mic"',
    'versionName "3.2.0-youtube-background-voice-switch"',
    "versionName",
)
app.write_text(s)

# Stable materialization intentionally deletes the old YouTube UI controller.
# Restore the already-reviewed YouTube-only controller from repository HEAD.
def restore_from_head(repo_path: str):
    payload = subprocess.check_output(["git", "show", f"HEAD:{repo_path}"])
    path = Path(repo_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)

restore_from_head("android-nubo/app/src/main/java/com/ainubo/nubo/NuboYouTubeAccessibilityService.java")
restore_from_head("android-nubo/app/src/main/res/xml/nubo_youtube_accessibility_service.xml")

manifest = Path("android-nubo/app/src/main/AndroidManifest.xml")
ms = manifest.read_text()
service_decl = '''
        <service
            android:name=".NuboYouTubeAccessibilityService"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
            android:exported="true"
            android:label="NUBO YouTube Control">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/nubo_youtube_accessibility_service" />
        </service>
'''
if "NuboYouTubeAccessibilityService" not in ms:
    ms = ms.replace("</application>", service_decl + "</application>", 1)
manifest.write_text(ms)

service = Path("android-nubo/app/src/main/java/com/ainubo/nubo/NuboNativeWakeService.java")
ss = service.read_text()
getter_anchor = '    public static boolean isWakeMode() { return running && wakeMode; }\n'
if "isBackgroundCloudMode()" not in ss:
    if getter_anchor not in ss:
        raise SystemExit("3.2 native background mode getter anchor missing")
    ss = ss.replace(
        getter_anchor,
        getter_anchor + '    public static boolean isBackgroundCloudMode() { return running && backgroundCloudMode; }\n',
        1,
    )
service.write_text(ss)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

# Dedicated handoff for YouTube. The V9 bridge previously launched YouTube directly,
# bypassing beginExternalVoiceKeepAlive(), so 3.1 background PCM never actually started.
helper_anchor = '    private boolean isNuboInPictureInPicture() {\n'
helper = '''    private void prepareYouTubeBackgroundCloud() {
        if (webView == null || !NuboNativeWakeService.isRunning()) return;
        // Release WebView getUserMedia first, then let the foreground microphone
        // service acquire AudioRecord while this Activity is still visible.
        webView.evaluateJavascript(
            "window.dispatchEvent(new Event('nubo:native-background-audio-start'));",
            null
        );
        webView.postDelayed(
            () -> sendNativeWakeAction(NuboNativeWakeService.ACTION_BACKGROUND_CLOUD),
            180L
        );
    }

'''
if "prepareYouTubeBackgroundCloud()" not in s:
    if helper_anchor not in s:
        raise SystemExit("3.2 PiP/helper anchor missing")
    s = s.replace(helper_anchor, helper + helper_anchor, 1)

# Replace the Stable/V9 bridge. First song: hand microphone to native background PCM,
# then launch YouTube. Repeated song: while YouTube owns foreground, use the V40
# YouTube-only UI controller, because a second ACTION_VIEW is frequently swallowed.
pattern = re.compile(r'''        @JavascriptInterface\n        public boolean playYouTubeNoSetup\(\n            String query,\n            String targetUrl,\n            String label\n        \) \{.*?\n        \}\n\n''', re.S)
match = pattern.search(s)
if not match:
    raise SystemExit("3.2 playYouTubeNoSetup method not found")
new_bridge = '''        @JavascriptInterface
        public boolean playYouTubeNoSetup(
            String query,
            String targetUrl,
            String label
        ) {
            if (targetUrl == null || label == null) return false;
            String safeTarget = targetUrl.trim();
            String safeLabel = label.trim();
            String safeQuery = query == null ? "" : query.trim();
            if (safeTarget.isEmpty() || safeLabel.isEmpty()) return false;
            if (!activity.isAllowedBridgeTarget(safeTarget, safeLabel)) return false;

            final boolean repeatedWhileYouTubeForeground =
                NuboNativeWakeService.isBackgroundCloudMode();

            if (repeatedWhileYouTubeForeground && NuboYouTubeAccessibilityService.isReady()) {
                String uiQuery = safeQuery.isEmpty() ? safeLabel : safeQuery;
                if (NuboYouTubeAccessibilityService.requestSongSwitch(uiQuery)) {
                    return true;
                }
            }

            activity.runOnUiThread(() -> {
                if (!repeatedWhileYouTubeForeground) {
                    // 3.2 critical fix: V9 first-song launch now hands the live mic to
                    // Android BEFORE YouTube takes foreground. 3.1 never reached this path.
                    activity.prepareYouTubeBackgroundCloud();
                    activity.webView.postDelayed(
                        () -> activity.launchExternalTarget(safeTarget, safeLabel),
                        460L
                    );
                } else {
                    // Fallback only when the YouTube UI agent has not been enabled yet.
                    // The primary repeat-switch path above does not relaunch YouTube.
                    activity.launchExternalTarget(safeTarget, safeLabel);
                }
            });
            return true;
        }

        @JavascriptInterface
        public boolean isYouTubeUiAgentReady() {
            return NuboYouTubeAccessibilityService.isReady();
        }

        @JavascriptInterface
        public boolean openYouTubeControlSettings() {
            activity.runOnUiThread(() -> {
                try {
                    activity.startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
                } catch (RuntimeException ignored) {}
            });
            return true;
        }

'''
s = s[:match.start()] + new_bridge + s[match.end():]
main.write_text(s)

# Build-time regression guards.
app_final = app.read_text()
main_final = main.read_text()
manifest_final = manifest.read_text()
native_final = service.read_text()
yt_service = Path("android-nubo/app/src/main/java/com/ainubo/nubo/NuboYouTubeAccessibilityService.java").read_text()
yt_xml = Path("android-nubo/app/src/main/res/xml/nubo_youtube_accessibility_service.xml").read_text()

for token in ["versionCode 3200", "3.2.0-youtube-background-voice-switch"]:
    if token not in app_final: raise SystemExit("3.2 app marker missing: " + token)
for token in [
    "prepareYouTubeBackgroundCloud()",
    "NuboNativeWakeService.isBackgroundCloudMode()",
    "NuboYouTubeAccessibilityService.isReady()",
    "NuboYouTubeAccessibilityService.requestSongSwitch(uiQuery)",
    "openYouTubeControlSettings()",
    "ACTION_BACKGROUND_CLOUD",
    "dispatchBackgroundPcmFromService",
    "public boolean googleHomeControl",
]:
    if token not in main_final: raise SystemExit("3.2 MainActivity marker missing: " + token)
for token in [
    "NuboYouTubeAccessibilityService",
    "android.permission.BIND_ACCESSIBILITY_SERVICE",
    "@xml/nubo_youtube_accessibility_service",
    'foregroundServiceType="microphone"',
]:
    if token not in manifest_final: raise SystemExit("3.2 manifest marker missing: " + token)
for token in ["isBackgroundCloudMode()", "backgroundCloudCaptureLoop", "AudioRecord"]:
    if token not in native_final: raise SystemExit("3.2 native mic marker missing: " + token)
for token in ["requestSongSwitch", "ACTION_SET_TEXT", "dispatchGesture"]:
    if token not in yt_service: raise SystemExit("3.2 YouTube controller marker missing: " + token)
if 'packageNames="com.google.android.youtube"' not in yt_xml:
    raise SystemExit("3.2 YouTube controller must remain package-scoped")

print("Applied NUBO 3.2: real background Gemini mic handoff + YouTube foreground song switching")
