from pathlib import Path
import runpy

# V76 preserves the verified V75 Android baseline and adds one narrow bridge:
# WebView can ask Android's existing Taiwan TextToSpeech engine to speak a short
# lookup filler while backend tools fetch data. This avoids unreliable
# window.speechSynthesis behavior inside Android WebView.
runpy.run_path("scripts/apply-v75-external-command-relay.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 75", "versionCode 76", 1)
s = s.replace('versionName "0.75.0-external-command-relay"', 'versionName "0.76.0-native-lookup-filler"', 1)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v75", "android-v76")
s = s.replace("NUBO-Android/75", "NUBO-Android/76")
s = s.replace("bundle=v75", "bundle=v76")
s = s.replace("nubo_v75_bundle_flushed", "nubo_v76_bundle_flushed")
s = s.replace("nubo-v75-hide-panels", "nubo-v76-hide-panels")

bridge_anchor = '''        @JavascriptInterface
        public boolean isExternalVoiceKeepAliveActive() {'''
bridge_patch = '''        @JavascriptInterface
        public boolean speakLookupFiller(String text) {
            if (text == null) return false;
            String safe = text.trim();
            if (safe.isEmpty() || safe.length() > 80) return false;
            activity.runOnUiThread(() -> activity.speakLookupFillerNative(safe));
            return true;
        }

        @JavascriptInterface
        public boolean stopLookupFiller() {
            activity.runOnUiThread(activity::stopLookupFillerNative);
            return true;
        }

'''
if "speakLookupFiller(String text)" not in s:
    if bridge_anchor not in s:
        raise SystemExit("V76: native bridge anchor missing")
    s = s.replace(bridge_anchor, bridge_patch + bridge_anchor, 1)

method_anchor = "    private boolean isNuboInPictureInPicture() {"
method_patch = '''    private void speakLookupFillerNative(String text) {
        if (!senseTtsReady || senseTts == null || text == null) return;
        String safe = text.trim();
        if (safe.isEmpty() || safe.length() > 80) return;
        try {
            senseTts.stop();
            senseTts.setSpeechRate(1.02f);
            senseTts.setPitch(1.0f);
            senseTts.speak(
                safe,
                TextToSpeech.QUEUE_FLUSH,
                null,
                "nubo-native-lookup-filler"
            );
        } catch (RuntimeException ignored) {}
    }

    private void stopLookupFillerNative() {
        try {
            if (senseTts != null) senseTts.stop();
        } catch (RuntimeException ignored) {}
    }

'''
if "speakLookupFillerNative(String text)" not in s:
    if method_anchor not in s:
        raise SystemExit("V76: MainActivity method anchor missing")
    s = s.replace(method_anchor, method_patch + method_anchor, 1)

main.write_text(s)

for token in ["versionCode 76", '0.76.0-native-lookup-filler']:
    if token not in app.read_text():
        raise SystemExit(f"missing V76 app marker: {token}")

final = main.read_text()
for token in [
    "NUBO-Android/76",
    "android-v76",
    "speakLookupFiller(String text)",
    "stopLookupFiller()",
    "nubo-native-lookup-filler",
    "TextToSpeech.QUEUE_FLUSH",
    "openExternalApp",
    "playYouTubeNoSetup",
]:
    if token not in final:
        raise SystemExit(f"missing V76 preserved/native filler marker: {token}")

print("Applied V76 Android: native Taiwan TTS lookup filler bridge on verified V75 baseline")
