import fs from "node:fs";

const marker = "NUBO_BARGE_IN_V1";
const path = "lib/browser-audio.ts";
let source = fs.readFileSync(path, "utf8");

if (!source.includes(marker)) {
  if (!source.includes("NUBO_GUEST_VOICE_ECHO_GUARD_V1")) {
    throw new Error("barge-in v1: guest voice echo guard must run first");
  }

  const guardAnchor = `function isNuboAssistantCaptureBlocked(now = Date.now()) {\n  return nuboAssistantPlaybackActive || now < nuboAssistantCaptureGuardUntil;\n}`;
  const guardPatch = `${guardAnchor}\n\n// ${marker}: restore natural barge-in without reopening the phantom LINE path.\n// Assistant playback remains gated by default. Only sustained, near-field speech\n// that clears a stronger local threshold is allowed to break the gate.\nconst NUBO_BARGE_IN_MIN_RMS = 0.032;\nconst NUBO_BARGE_IN_THRESHOLD_MULTIPLIER = 1.45;\nconst NUBO_BARGE_IN_REQUIRED_FRAMES = 2;\n\nfunction releaseNuboAssistantCaptureForBargeIn() {\n  // Stop queued NUBO speech immediately. interrupt() dispatches playback=false, which\n  // normally starts the echo-tail guard; clear that tail afterwards so the same user\n  // utterance reaches Gemini Live instead of losing its first second.\n  nuboAssistantPlaybackActive = false;\n  nuboAssistantCaptureGuardUntil = 0;\n  try {\n    activePlaybackQueue?.interrupt();\n  } catch {\n    // Best effort: capture is still released below even if playback teardown races.\n  }\n  nuboAssistantPlaybackActive = false;\n  nuboAssistantCaptureGuardUntil = 0;\n\n  if (typeof window !== "undefined") {\n    window.dispatchEvent(new CustomEvent("nubo:barge-in"));\n  }\n}`;
  if (!source.includes(guardAnchor)) {
    throw new Error("barge-in v1: assistant capture guard anchor missing");
  }
  source = source.replace(guardAnchor, guardPatch);

  const fieldAnchor = `  private guestAudioAnalysisInFlight = false;`;
  const fieldPatch = `${fieldAnchor}\n  private nuboBargeInHotFrames = 0;`;
  if (!source.includes(fieldAnchor)) {
    throw new Error("barge-in v1: analysis field anchor missing");
  }
  source = source.replace(fieldAnchor, fieldPatch);

  const oldGate = `    // Never forward assistant playback/echo back into Gemini Live or the guest-alert\n    // second pass. Reset VAD and all guest buffers so an assistant sentence cannot\n    // survive until turnComplete and become a phantom LINE notification.\n    if (isNuboAssistantCaptureBlocked(now)) {\n      this.hotFrames = 0;\n      this.lastVoiceAt = now;\n      this.preRoll = [];\n      this.guestAudioPreRoll = [];\n      this.guestAudioChunks = [];\n      this.guestAudioBytes = 0;\n      this.guestAudioActive = false;\n      this.guestAudioLastVoiceAt = 0;\n      resetNativeSenseBuffer();\n      resetWebSenseBuffer();\n      return;\n    }`;

  const newGate = `    // ${marker}: keep NUBO protected from its own speaker echo, but allow a real\n    // nearby speaker to interrupt. The independent guest-audio buffers stay empty\n    // until the stronger barge-in VAD has positively fired.\n    if (isNuboAssistantCaptureBlocked(now)) {\n      const bargeInThreshold = Math.max(\n        NUBO_BARGE_IN_MIN_RMS,\n        threshold * NUBO_BARGE_IN_THRESHOLD_MULTIPLIER,\n      );\n\n      if (rms >= bargeInThreshold) this.nuboBargeInHotFrames += 1;\n      else this.nuboBargeInHotFrames = Math.max(0, this.nuboBargeInHotFrames - 1);\n\n      const bargeInDetected =\n        this.nuboBargeInHotFrames >= NUBO_BARGE_IN_REQUIRED_FRAMES;\n\n      this.hotFrames = 0;\n      this.lastVoiceAt = now;\n      this.preRoll = [];\n      this.guestAudioPreRoll = [];\n      this.guestAudioChunks = [];\n      this.guestAudioBytes = 0;\n      this.guestAudioActive = false;\n      this.guestAudioLastVoiceAt = 0;\n      resetNativeSenseBuffer();\n      resetWebSenseBuffer();\n\n      if (!bargeInDetected) return;\n\n      this.nuboBargeInHotFrames = 0;\n      releaseNuboAssistantCaptureForBargeIn();\n    } else {\n      this.nuboBargeInHotFrames = 0;\n    }`;

  if (!source.includes(oldGate)) {
    throw new Error("barge-in v1: half-duplex microphone gate anchor missing");
  }
  source = source.replace(oldGate, newGate);

  fs.writeFileSync(path, source);
}

if (!fs.readFileSync(path, "utf8").includes(marker)) {
  throw new Error("barge-in v1 verification failed");
}

console.log("Applied NUBO barge-in v1 hotfix");
