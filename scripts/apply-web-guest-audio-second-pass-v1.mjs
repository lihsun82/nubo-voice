import fs from "node:fs";

const marker = "NUBO_GUEST_AUDIO_SECOND_PASS_V1";
const path = "lib/browser-audio.ts";
let s = fs.readFileSync(path, "utf8");

if (!s.includes(marker)) {
  const constantsAnchor = `const NUBO_AUDIO_ECO_PREROLL_CHUNKS = 8;`;
  const constantsPatch = `${constantsAnchor}\n// ${marker}: independent raw-audio hotel guest-service detector.\nconst NUBO_GUEST_AUDIO_SILENCE_MS = 900;\nconst NUBO_GUEST_AUDIO_PREROLL_CHUNKS = 4;\nconst NUBO_GUEST_AUDIO_MIN_BYTES = 16_000;\nconst NUBO_GUEST_AUDIO_MAX_BYTES = 320_000;`;
  if (!s.includes(constantsAnchor)) throw new Error("guest audio second pass: constants anchor missing");
  s = s.replace(constantsAnchor, constantsPatch);

  const fieldsAnchor = `  private preRoll: string[] = [];`;
  const fieldsPatch = `${fieldsAnchor}\n  private guestAudioPreRoll: Uint8Array[] = [];\n  private guestAudioChunks: Uint8Array[] = [];\n  private guestAudioBytes = 0;\n  private guestAudioActive = false;\n  private guestAudioLastVoiceAt = 0;`;
  if (!s.includes(fieldsAnchor)) throw new Error("guest audio second pass: fields anchor missing");
  s = s.replace(fieldsAnchor, fieldsPatch);

  const startAnchor = `    resetNativeSenseBuffer();`;
  const startPatch = `${startAnchor}\n    this.guestAudioPreRoll = [];\n    this.guestAudioChunks = [];\n    this.guestAudioBytes = 0;\n    this.guestAudioActive = false;\n    this.guestAudioLastVoiceAt = 0;`;
  if (!s.includes(startAnchor)) throw new Error("guest audio second pass: start reset anchor missing");
  s = s.replace(startAnchor, startPatch);

  const base64Anchor = `    const base64 = toBase64(pcm);`;
  const base64Patch = `${base64Anchor}\n    this.captureGuestAudioSecondPass(pcm, voiceDetected, now);`;
  if (!s.includes(base64Anchor)) throw new Error("guest audio second pass: PCM anchor missing");
  s = s.replace(base64Anchor, base64Patch);

  const resumeAnchor = `  async resume() {`;
  const helper = `  private captureGuestAudioSecondPass(pcm: Uint8Array, voiceDetected: boolean, now: number) {\n    const copy = pcm.slice();\n\n    if (!this.guestAudioActive) {\n      this.guestAudioPreRoll.push(copy);\n      while (this.guestAudioPreRoll.length > NUBO_GUEST_AUDIO_PREROLL_CHUNKS) {\n        this.guestAudioPreRoll.shift();\n      }\n      if (!voiceDetected) return;\n\n      this.guestAudioActive = true;\n      this.guestAudioChunks = this.guestAudioPreRoll;\n      this.guestAudioBytes = this.guestAudioChunks.reduce((total, chunk) => total + chunk.length, 0);\n      this.guestAudioPreRoll = [];\n      this.guestAudioLastVoiceAt = now;\n      return;\n    }\n\n    this.guestAudioChunks.push(copy);\n    this.guestAudioBytes += copy.length;\n    while (this.guestAudioBytes > NUBO_GUEST_AUDIO_MAX_BYTES && this.guestAudioChunks.length > 1) {\n      const removed = this.guestAudioChunks.shift();\n      if (removed) this.guestAudioBytes -= removed.length;\n    }\n\n    if (voiceDetected) {\n      this.guestAudioLastVoiceAt = now;\n      return;\n    }\n\n    if (this.guestAudioLastVoiceAt > 0 && now - this.guestAudioLastVoiceAt >= NUBO_GUEST_AUDIO_SILENCE_MS) {\n      this.flushGuestAudioSecondPass();\n    }\n  }\n\n  private flushGuestAudioSecondPass() {\n    const chunks = this.guestAudioChunks;\n    const totalBytes = this.guestAudioBytes;\n    this.guestAudioChunks = [];\n    this.guestAudioBytes = 0;\n    this.guestAudioActive = false;\n    this.guestAudioLastVoiceAt = 0;\n    this.guestAudioPreRoll = [];\n\n    if (totalBytes < NUBO_GUEST_AUDIO_MIN_BYTES || chunks.length === 0) return;\n\n    const merged = new Uint8Array(totalBytes);\n    let offset = 0;\n    for (const chunk of chunks) {\n      merged.set(chunk, offset);\n      offset += chunk.length;\n    }\n\n    void fetch(\"/api/notify/guest-service-audio\", {\n      method: \"POST\",\n      headers: { \"Content-Type\": \"application/json\" },\n      body: JSON.stringify({\n        pcmBase64: toBase64(merged),\n        sampleRate: 16_000,\n        source: \"browser-mic-raw-second-pass-v1\",\n      }),\n      cache: \"no-store\",\n    })\n      .then(async (response) => {\n        const payload = await response.json().catch(() => ({}));\n        if (!response.ok) {\n          throw new Error(payload?.error ?? \`guest audio second pass failed: \${response.status}\`);\n        }\n        if (payload?.sent === true || payload?.duplicate === true) {\n          console.info(\"[guest-audio-second-pass] LINE guest alert delivered\", {\n            roomNumber: payload?.decision?.roomNumber ?? null,\n            confidence: payload?.decision?.confidence ?? null,\n          });\n        }\n      })\n      .catch((error) => {\n        console.warn(\"[guest-audio-second-pass] analysis failed\", error);\n      });\n  }\n\n`;
  if (!s.includes(resumeAnchor)) throw new Error("guest audio second pass: resume anchor missing");
  s = s.replace(resumeAnchor, `${helper}${resumeAnchor}`);

  const stopAnchor = `  async stop() {\n    this.detachForegroundListeners();`;
  const stopPatch = `  async stop() {\n    if (this.guestAudioActive) this.flushGuestAudioSecondPass();\n    this.detachForegroundListeners();`;
  if (!s.includes(stopAnchor)) throw new Error("guest audio second pass: stop anchor missing");
  s = s.replace(stopAnchor, stopPatch);

  fs.writeFileSync(path, s);
}

console.log("Applied independent raw-audio guest-service second pass");
