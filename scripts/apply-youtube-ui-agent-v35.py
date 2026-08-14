from pathlib import Path
import runpy

# Preserve V34 BAL fallback + all validated V33/V32/V29/V28 behavior.
runpy.run_path("scripts/apply-youtube-switch-v34-pendingintent-bal.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 34", "versionCode 35", "V35 versionCode")
s = replace_once(
    s,
    'versionName "0.34.0-youtube-bal-pendingintent"',
    'versionName "0.35.0-youtube-ui-control-agent"',
    "V35 versionName",
)
app.write_text(s)

manifest = Path("android-nubo/app/src/main/AndroidManifest.xml")
s = manifest.read_text()
service = '''
        <service
            android:name=".NuboYouTubeAccessibilityService"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
            android:exported="true"
            android:label="NUBO YouTube Control Agent">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/nubo_youtube_accessibility_service" />
        </service>
'''
if ".NuboYouTubeAccessibilityService" not in s:
    s = replace_once(s, "    </application>\n", service + "    </application>\n", "V35 accessibility service manifest")
manifest.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
needle = '''        @JavascriptInterface
        public boolean startWakeListener() {
'''
bridge = '''        @JavascriptInterface
        public boolean isYouTubeUiAgentReady() {
            return NuboYouTubeAccessibilityService.isReady();
        }

        @JavascriptInterface
        public boolean switchYouTubeSong(String query) {
            if (query == null || query.trim().isEmpty()) return false;
            return NuboYouTubeAccessibilityService.requestSongSwitch(query.trim());
        }

        @JavascriptInterface
        public boolean openYouTubeAgentSettings() {
            activity.runOnUiThread(() -> {
                Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                activity.startActivity(intent);
            });
            return true;
        }

'''
if "public boolean switchYouTubeSong" not in s:
    s = replace_once(s, needle, bridge + needle, "V35 JS bridge")
s = s.replace('"v34-bal-pendingintent"', '"v35-ui-control-agent"', 1)
s = s.replace("android-v34", "android-v35")
s = s.replace("NUBO-Android/34", "NUBO-Android/35")
main.write_text(s)

print("Applied V35 YouTube UI accessibility control agent")
