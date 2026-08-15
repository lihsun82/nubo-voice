from pathlib import Path
import runpy

# Preserve V72 entirely, then add one direct Javascript bridge into the already-proven
# V64/V58 embedded YouTube bottom-banner implementation.
runpy.run_path("scripts/apply-v72-youtube-v64-banner.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 72", "versionCode 73", 1)
s = s.replace('versionName "0.72.0-youtube-v64-banner"', 'versionName "0.73.0-force-native-youtube-banner"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v72", "android-v73")
s = s.replace("NUBO-Android/72", "NUBO-Android/73")
s = s.replace("bundle=v72", "bundle=v73")
s = s.replace("nubo_v72_bundle_flushed", "nubo_v73_bundle_flushed")
s = s.replace("nubo-v72-hide-panels", "nubo-v73-hide-panels")

needle = '''        @JavascriptInterface
        public boolean openExternalApp(String targetUrl, String label) {
'''
bridge = '''        @JavascriptInterface
        public boolean playEmbeddedYouTube(String videoId) {
            if (videoId == null) return false;
            final String safeVideoId = videoId.trim();
            if (!safeVideoId.matches("[A-Za-z0-9_-]{11}")) return false;
            activity.runOnUiThread(() -> activity.showEmbeddedYouTubeV58(safeVideoId));
            return true;
        }

        @JavascriptInterface
        public boolean openExternalApp(String targetUrl, String label) {
'''
if "public boolean playEmbeddedYouTube(String videoId)" not in s:
    if needle not in s:
        raise SystemExit("missing NuboNativeBridge openExternalApp insertion point")
    s = s.replace(needle, bridge, 1)

main.write_text(s)

for token in ["versionCode 73", '0.73.0-force-native-youtube-banner']:
    if token not in app.read_text():
        raise SystemExit(f"missing V73 app marker: {token}")

final = main.read_text()
for token in [
    "NUBO-Android/73",
    "android-v73",
    "bundle=v73",
    "public boolean playEmbeddedYouTube(String videoId)",
    "showEmbeddedYouTubeV58(safeVideoId)",
    "embeddedYouTubeOverlayV58",
    "root.addView(overlay, overlayParams)",
    "Gravity.BOTTOM",
    "p.setVolume(72)",
    "beginExternalVoiceKeepAlive",
    "enterPictureInPictureMode",
    "createOnDeviceSpeechRecognizer",
]:
    if token not in final:
        raise SystemExit(f"missing V73 preserved/native marker: {token}")

home = Path("android-nubo/app/src/googleHome/java/com/ainubo/nubo/googlehome/GoogleHomeGatewayImpl.kt").read_text()
for token in [
    "nubo_google_home_permission_v61",
    "CACHED_GRANTED",
    "REUSED_EXISTING",
    'putBoolean("granted", true).commit()',
    'sdk", "1.10.0"',
]:
    if token not in home:
        raise SystemExit(f"missing preserved Google Home marker: {token}")

print("Applied V73 Android: direct JS bridge to proven V64/V58 bottom YouTube banner")
