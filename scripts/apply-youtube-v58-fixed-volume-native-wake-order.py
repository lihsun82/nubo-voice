from pathlib import Path
import runpy

# V58 builds on V57 but fixes two confirmed regressions only:
# 1) V57 changed YouTube volume on every voice phase (24/55/100), causing audible pumping.
#    V58 keeps embedded YouTube at a stable fixed volume and does not reassert audio routing
#    on every NUBO voice phase.
# 2) GeminiVoiceConsole returned early on Android/mobile BEFORE calling NuboNative.startWakeListener().
#    V58 calls the native bridge first, then only skips browser SpeechRecognition on mobile.
runpy.run_path("scripts/apply-youtube-v57-audio-mix-wake.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 57", "versionCode 58", "V58 versionCode")
s = replace_once(
    s,
    'versionName "0.57.0-youtube-audio-mix-native-wake"',
    'versionName "0.58.0-youtube-stable-audio-native-wake-order"',
    "V58 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v57", "android-v58")
s = s.replace("NUBO-Android/57", "NUBO-Android/58")
s = s.replace("bundle=v57", "bundle=v58")
s = s.replace("nubo_v57_bundle_flushed", "nubo_v58_bundle_flushed")
s = s.replace("nubo_youtube_v57", "nubo_youtube_v58")
s = s.replace("handleYouTubeIntentV57", "handleYouTubeIntentV58")
s = s.replace("isDuplicateYouTubeLaunchV57", "isDuplicateYouTubeLaunchV58")
s = s.replace("startYouTubeIntentV57", "startYouTubeIntentV58")
s = s.replace("prepareYouTubeMediaRouteV57", "prepareYouTubeMediaRouteV58")
s = s.replace("EmbeddedYouTubeBridgeV57", "EmbeddedYouTubeBridgeV58")
s = s.replace("embeddedYouTubeOverlayV57", "embeddedYouTubeOverlayV58")
s = s.replace("embeddedYouTubeWebViewV57", "embeddedYouTubeWebViewV58")
s = s.replace("embeddedYouTubeVideoIdV57", "embeddedYouTubeVideoIdV58")
s = s.replace("dismissEmbeddedYouTubeV57", "dismissEmbeddedYouTubeV58")
s = s.replace("showEmbeddedYouTubeV57", "showEmbeddedYouTubeV58")
s = s.replace("recreateWakeRecognizerV57", "recreateWakeRecognizerV58")
s = s.replace("scheduleWakeRestartV57", "scheduleWakeRestartV58")
s = s.replace("wakeGenerationV57", "wakeGenerationV58")
s = s.replace("wakeStartPendingV57", "wakeStartPendingV58")
s = s.replace("applyYouTubeVoiceMixV57", "applyYouTubeVoiceMixV58")
s = s.replace("v57-embed-error-fallback-", "v58-embed-error-fallback-")
s = s.replace("v57-external-fallback-exact", "v58-external-fallback-exact")
s = s.replace("v57-external-fallback-search", "v58-external-fallback-search")
s = s.replace("v57-external-fallback-url", "v58-external-fallback-url")

# Do not alter player volume or Android audio routing on every voice phase.
old_mix = r'''    private void applyYouTubeVoiceMixV58(String phase) {
        if (embeddedYouTubeWebViewV58 == null) return;
        prepareYouTubeMediaRouteV58();
        int volume = 100;
        if ("speaking".equals(phase)) volume = 24;
        else if ("thinking".equals(phase) || "connecting".equals(phase)) volume = 55;
        final int target = volume;
        try {
            embeddedYouTubeWebViewV58.evaluateJavascript(
                "try{if(window.p&&p.setVolume){p.setVolume(" + target + ");if(p.getPlayerState&&p.getPlayerState()===2){p.playVideo();}}}catch(e){}",
                null
            );
        } catch (RuntimeException ignored) {}
    }

'''
new_mix = r'''    private void applyYouTubeVoiceMixV58(String phase) {
        // V58 intentionally keeps YouTube volume stable while NUBO talks.
        // Re-routing or ducking on every voice phase caused audible pumping in V57.
    }

'''
s = replace_once(s, old_mix, new_mix, "remove V57 dynamic duck")

# Keep the embedded player at a constant volume. This is applied only when a video starts/changes.
s = replace_once(
    s,
    "p.loadVideoById('" + '" + videoId + "' + "');p.playVideo();",
    "p.loadVideoById('" + '" + videoId + "' + "');if(p.setVolume){p.setVolume(72);}p.playVideo();",
    "fixed volume on change",
)
s = replace_once(
    s,
    "onReady:function(e){try{e.target.playVideo()}catch(x){}}",
    "onReady:function(e){try{if(e.target.setVolume){e.target.setVolume(72);}e.target.playVideo()}catch(x){}}",
    "fixed volume on ready",
)

main.write_text(s)

# Fix the confirmed mobile wake-order bug in the live web console.
console = Path("components/GeminiVoiceConsole.tsx")
c = console.read_text()
old_order = '''    // Android/iOS speech recognizers emit system start/restart chimes in
    // background/eco mode. Keep mobile eco truly silent: cloud voice stays
    // stopped and the user taps the existing Start NUBO button to reconnect.
    const userAgent = window.navigator.userAgent;
    const isIpadOs =
      /Macintosh/i.test(userAgent) && window.navigator.maxTouchPoints > 1;
    const isMobileBrowser =
      /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || isIpadOs;
    if (isMobileBrowser) return;

    try {
      const nativeBridge = (window as typeof window & {
        NuboNative?: { startWakeListener?: () => boolean };
      }).NuboNative;
      if (nativeBridge?.startWakeListener?.()) return;
    } catch {}
'''
new_order = '''    // Native Android must get first chance to run the silent local wake listener.
    // V57 returned early for every Android/mobile UA before this bridge call,
    // so the native wake recognizer was never actually started.
    try {
      const nativeBridge = (window as typeof window & {
        NuboNative?: { startWakeListener?: () => boolean };
      }).NuboNative;
      if (nativeBridge?.startWakeListener?.()) return;
    } catch {}

    // Plain mobile browsers (without NuboNative) should stay silent in eco mode;
    // avoid the system Web Speech start/restart chimes there.
    const userAgent = window.navigator.userAgent;
    const isIpadOs =
      /Macintosh/i.test(userAgent) && window.navigator.maxTouchPoints > 1;
    const isMobileBrowser =
      /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || isIpadOs;
    if (isMobileBrowser) return;
'''
c = replace_once(c, old_order, new_order, "native wake before mobile return")
console.write_text(c)

final_source = main.read_text()
for token in [
    "NUBO-Android/58",
    "android-v58",
    "p.setVolume(72)",
    "createOnDeviceSpeechRecognizer",
    "recreateWakeRecognizerV58",
    "wakeGenerationV58",
    "AudioManager.MODE_NORMAL",
    "YOUTUBE_RELAUNCH_GUARD_MS = 60_000L",
    '"com.google.android.youtube"',
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V58 marker: {token}")

if "volume = 24" in final_source or "volume = 55" in final_source:
    raise SystemExit("V57 dynamic duck still present")

console_source = console.read_text()
native_pos = console_source.find("nativeBridge?.startWakeListener?.()")
mobile_pos = console_source.find("if (isMobileBrowser) return;", native_pos)
if native_pos < 0 or mobile_pos < 0 or native_pos > mobile_pos:
    raise SystemExit("native wake is not before mobile return")

print("Applied V58: stable YouTube volume + real Android native wake startup")
