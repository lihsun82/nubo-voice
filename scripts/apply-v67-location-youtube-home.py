from pathlib import Path
import runpy

# V67 keeps the validated V66 voice loop and fixes three independent areas:
# geo-locked nearby web search, YouTube renderer contention, and Google Home persistence.
runpy.run_path("scripts/apply-v66-voice-stability.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 66", "versionCode 67", 1)
s = s.replace('versionName "0.66.0-voice-stability"', 'versionName "0.67.0-geo-youtube-home-stable"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v66", "android-v67")
s = s.replace("NUBO-Android/66", "NUBO-Android/67")
s = s.replace("bundle=v66", "bundle=v67")
s = s.replace("nubo_v66_bundle_flushed", "nubo_v67_bundle_flushed")
s = s.replace("nubo-v66-hide-panels", "nubo-v67-hide-panels")

# Keep the NUBO renderer and the native embedded YouTube renderer GPU-backed and important.
# This avoids renderer deprioritization/frame starvation when WebAudio starts producing NUBO speech.
main_player = '''        webView = new WebView(this);\n        webView.setBackgroundColor(Color.rgb(7, 9, 13));\n'''
main_player_new = '''        webView = new WebView(this);\n        webView.setBackgroundColor(Color.rgb(7, 9, 13));\n        webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);\n        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {\n            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);\n        }\n'''
if main_player in s and "RENDERER_PRIORITY_IMPORTANT" not in s:
    s = s.replace(main_player, main_player_new, 1)

embedded = '''            player.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);\n            player.getSettings().setJavaScriptEnabled(true);\n'''
embedded_new = '''            player.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);\n            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {\n                player.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);\n            }\n            player.getSettings().setOffscreenPreRaster(true);\n            player.getSettings().setJavaScriptEnabled(true);\n'''
if embedded in s:
    s = s.replace(embedded, embedded_new, 1)

# Never pause/reload the YouTube player merely because the NUBO voice phase changes.
# V58 already made phase mixing a no-op; keep that contract explicit for V67.
if "private void applyYouTubeVoiceMixV58(String phase)" in s:
    old = '''    private void applyYouTubeVoiceMixV58(String phase) {\n        // V58 intentionally keeps YouTube volume stable while NUBO talks.\n        // Re-routing or ducking on every voice phase caused audible pumping in V57.\n    }\n'''
    new = '''    private void applyYouTubeVoiceMixV58(String phase) {\n        // V67 performance contract: NUBO speech must not touch player state,\n        // seek/play/pause, media routing or volume. The video renderer stays independent.\n    }\n'''
    if old in s:
        s = s.replace(old, new, 1)

main.write_text(s)

# Google Home: a transient listDevices failure during process/activity recreation must not
# erase the persisted authorization flag. Also commit successful grants synchronously so
# Android process removal immediately after setup cannot lose the preference.
home_path = Path("android-nubo/app/src/googleHome/java/com/ainubo/nubo/googlehome/GoogleHomeGatewayImpl.kt")
h = home_path.read_text()
h = h.replace('permissionPrefs.edit().putBoolean("granted", true).apply()', 'permissionPrefs.edit().putBoolean("granted", true).commit()')
h = h.replace('                permissionPrefs.edit().remove("granted").apply()\n                callback.onResult(errorPayload(error))', '                // V67: preserve persisted authorization on transient SDK/process errors.\n                callback.onResult(errorPayload(error))')
home_path.write_text(h)

manifest = Path("android-nubo/app/src/main/AndroidManifest.xml")
if manifest.exists():
    m = manifest.read_text()
    if '<application' in m and 'android:hardwareAccelerated=' not in m:
        m = m.replace('<application', '<application android:hardwareAccelerated="true"', 1)
    manifest.write_text(m)

for token in ["versionCode 67", '0.67.0-geo-youtube-home-stable']:
    if token not in app.read_text():
        raise SystemExit(f"missing V67 app marker: {token}")

main_final = main.read_text()
for token in [
    "NUBO-Android/67",
    "android-v67",
    "bundle=v67",
    "RENDERER_PRIORITY_IMPORTANT",
    "setOffscreenPreRaster(true)",
    "p.setVolume(72)",
    "createOnDeviceSpeechRecognizer",
]:
    if token not in main_final:
        raise SystemExit(f"missing V67 Android marker: {token}")

home_final = home_path.read_text()
for token in [
    "nubo_google_home_permission_v61",
    "CACHED_GRANTED",
    "REUSED_EXISTING",
    'putBoolean("granted", true).commit()',
    'sdk", "1.10.0"',
    "V67: preserve persisted authorization",
]:
    if token not in home_final:
        raise SystemExit(f"missing V67 Google Home persistence marker: {token}")
if 'remove("granted")' in home_final:
    raise SystemExit("V67 must not clear Google Home grant on transient device-list failure")

print("Applied V67 Android: renderer-priority YouTube + durable Google Home authorization")
