from pathlib import Path
import runpy

# Apply V58 confirmed fixes first.
runpy.run_path("scripts/apply-youtube-v58-fixed-volume-native-wake-order.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

old = '''        syncSenseForVoicePhase();
        applyYouTubeVoiceMixV58(voicePhase);
    }

    private void ensureSenseDetector() {
'''
new = '''        syncSenseForVoicePhase();
        applyYouTubeVoiceMixV58(voicePhase);
        // APK-side safety net: when the 30s eco transition makes NUBO idle while
        // embedded YouTube is still visible, start native wake even if an older
        // remote web bundle fails to invoke NuboNative.startWakeListener().
        if ("idle".equals(voicePhase)
            && embeddedYouTubeOverlayV58 != null
            && embeddedYouTubeOverlayV58.getParent() != null) {
            wakeHandler.removeCallbacksAndMessages(null);
            wakeHandler.postDelayed(() -> {
                if ("idle".equals(voicePhase)
                    && embeddedYouTubeOverlayV58 != null
                    && embeddedYouTubeOverlayV58.getParent() != null) {
                    startNativeWakeListener();
                }
            }, 1500L);
        }
    }

    private void ensureSenseDetector() {
'''
s = replace_once(s, old, new, "V58 APK-side idle wake fallback")
main.write_text(s)

final_source = main.read_text()
for token in [
    '"idle".equals(voicePhase)',
    "embeddedYouTubeOverlayV58.getParent() != null",
    "startNativeWakeListener();",
    "1500L",
    "NUBO-Android/58",
]:
    if token not in final_source:
        raise SystemExit(f"missing V58 fallback marker: {token}")

print("Applied V58 APK-side idle native wake fallback")
