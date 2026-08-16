import fs from 'node:fs';

const path = 'components/GeminiVoiceConsole.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('NUBO_STABLE_2_NATIVE_WAKE')) {
  // When Gemini Live is truly connected and WebView microphone has started,
  // arm the native foreground service while the Activity is visible. The
  // service stays alive across app switches but does NOT capture audio yet.
  const connected = '            setState("connected");';
  const connectedPatch = `            setState("connected");\n            // NUBO_STABLE_2_NATIVE_WAKE\n            try {\n              const nativeWake = (window as typeof window & {\n                NuboNative?: {\n                  armNativeWakeService?: () => boolean;\n                  markCloudVoiceActive?: () => boolean;\n                };\n              }).NuboNative;\n              nativeWake?.armNativeWakeService?.();\n              nativeWake?.markCloudVoiceActive?.();\n            } catch {}`;
  if (!s.includes(connected)) throw new Error('Stable 2: connected anchor missing');
  s = s.replace(connected, connectedPatch);

  // Eco sleep: cloud/WebView releases microphone first, then native Vosk owns
  // it. This avoids two AudioRecord/getUserMedia clients fighting each other.
  const ecoAnchor = `    microphoneRef.current = null;\n    playbackRef.current = null;\n\n    setState("idle");`;
  const ecoPatch = `    microphoneRef.current = null;\n    playbackRef.current = null;\n\n    try {\n      const nativeWake = (window as typeof window & {\n        NuboNative?: { enterNativeWakeMode?: () => boolean };\n      }).NuboNative;\n      nativeWake?.enterNativeWakeMode?.();\n    } catch {}\n\n    setState("idle");`;
  if (!s.includes(ecoAnchor)) throw new Error('Stable 2: eco anchor missing');
  s = s.replace(ecoAnchor, ecoPatch);

  // Replace the mobile message: user no longer taps Start NUBO. The native
  // offline recognizer remains awake without Gemini token usage.
  const oldMobile = `        ? "NUBO智慧節約待命中。雲端語音已停止；為避免手機系統提示音，請點『啟動NUBO』重新開始。"\n        : "NUBO智慧節約待命中。雲端語音已停止，請說 nubo、嗨 nubo、兄弟或有人嗎喚醒。",`;
  const newMobile = `        ? "NUBO本機喚醒待命中。Gemini雲端語音已停止，不消耗Token；請直接說 NUBO、嗨 NUBO、兄弟或有人嗎喚醒。"\n        : "NUBO智慧節約待命中。雲端語音已停止，請說 nubo、嗨 nubo、兄弟或有人嗎喚醒。",`;
  if (!s.includes(oldMobile)) throw new Error('Stable 2: mobile eco message anchor missing');
  s = s.replace(oldMobile, newMobile);

  // The old browser/native SpeechRecognizer wake loop is no longer allowed to
  // compete with Vosk. Stable 2 wake comes only from nubo:native-wake event.
  const oldStart = `    startEcoWakeListener();\n  };`;
  if (!s.includes(oldStart)) throw new Error('Stable 2: old eco wake start anchor missing');
  s = s.replace(oldStart, `    // Stable 2: native Vosk service owns wake detection.\n  };`);
}

fs.writeFileSync(path, s);
console.log('Applied NUBO Stable 2 web bridge: cloud mic -> offline native Vosk -> native wake -> Gemini reconnect');
