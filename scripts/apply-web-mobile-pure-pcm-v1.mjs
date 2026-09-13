import fs from 'node:fs';

const marker = 'NUBO_MOBILE_PURE_PCM_V1';

// 1) Mobile capture: use MediaStreamTrackProcessor when Chrome exposes it.
// This reads AudioData directly from the microphone track and avoids creating
// a capture AudioContext/output audio session. Desktop keeps the proven fallback.
const audioPath = 'lib/browser-audio.ts';
let audio = fs.readFileSync(audioPath, 'utf8');

if (!audio.includes(marker)) {
  const fieldAnchor = '  private preRoll: string[] = [];';
  const fieldPatch = `${fieldAnchor}\n  // ${marker}\n  private trackReader: ReadableStreamDefaultReader<any> | null = null;\n  private trackPumpStopped = false;\n  private usingTrackProcessor = false;`;
  if (!audio.includes(fieldAnchor)) throw new Error('pure pcm: field anchor missing');
  audio = audio.replace(fieldAnchor, fieldPatch);

  const methodAnchor = '  async start(onAudio: (base64: string) => void) {';
  const methodPatch = `  private handlePcmInput(\n    input: Float32Array,\n    inputRate: number,\n    onAudio: (base64: string) => void,\n  ) {\n    const rms = calculateRms(input);\n    const threshold = Math.max(0.02, this.noiseFloor * 2.6);\n    const now = Date.now();\n\n    if (rms < threshold * 0.8) {\n      this.noiseFloor = this.noiseFloor * 0.985 + rms * 0.015;\n    }\n\n    if (rms >= threshold) this.hotFrames += 1;\n    else this.hotFrames = Math.max(0, this.hotFrames - 1);\n\n    const voiceDetected = this.hotFrames >= 2;\n    if (voiceDetected) this.lastVoiceAt = now;\n\n    const pcm = floatToPcm16(downsample(input, inputRate, 16000));\n    forwardPcmToNativeSense(pcm);\n    if (typeof forwardPcmToWebSense === \"function\") {\n      forwardPcmToWebSense(pcm);\n    }\n    const base64 = toBase64(pcm);\n\n    if (\n      document.visibilityState !== \"visible\" &&\n      !nativeExternalVoiceKeepAliveActive()\n    ) {\n      this.ecoSleeping = true;\n      this.preRoll = [];\n      return;\n    }\n\n    if (!this.ecoSleeping && now - this.lastVoiceAt >= NUBO_AUDIO_ECO_IDLE_MS) {\n      this.ecoSleeping = true;\n      this.preRoll = [];\n    }\n\n    if (this.ecoSleeping) {\n      this.preRoll.push(base64);\n      if (this.preRoll.length > NUBO_AUDIO_ECO_PREROLL_CHUNKS) {\n        this.preRoll.shift();\n      }\n\n      if (!voiceDetected) return;\n\n      this.ecoSleeping = false;\n      this.lastVoiceAt = now;\n      const buffered = this.preRoll;\n      this.preRoll = [];\n      for (const chunk of buffered) onAudio(chunk);\n      return;\n    }\n\n    onAudio(base64);\n  }\n\n  private async pumpTrackProcessor(\n    reader: ReadableStreamDefaultReader<any>,\n    onAudio: (base64: string) => void,\n  ) {\n    while (!this.trackPumpStopped) {\n      let result: ReadableStreamReadResult<any>;\n      try {\n        result = await reader.read();\n      } catch {\n        break;\n      }\n      if (result.done || !result.value) break;\n\n      const frame = result.value;\n      try {\n        const frames = Math.max(0, Number(frame.numberOfFrames ?? 0));\n        const sampleRate = Math.max(8000, Number(frame.sampleRate ?? 48000));\n        if (frames > 0) {\n          const input = new Float32Array(frames);\n          try {\n            frame.copyTo(input, { planeIndex: 0, format: \"f32-planar\" });\n          } catch {\n            frame.copyTo(input, { planeIndex: 0 });\n          }\n          this.handlePcmInput(input, sampleRate, onAudio);\n        }\n      } catch {\n        // A malformed frame is dropped without disturbing the live session.\n      } finally {\n        try { frame.close?.(); } catch {}\n      }\n    }\n\n    if (this.trackReader === reader) this.trackReader = null;\n  }\n\n${methodAnchor}`;
  if (!audio.includes(methodAnchor)) throw new Error('pure pcm: start method anchor missing');
  audio = audio.replace(methodAnchor, methodPatch);

  audio = audio.replace(
    '    if (this.stream || this.context) {',
    '    if (this.stream || this.context || this.trackReader) {',
  );

  const resetAnchor = `    this.preRoll = [];\n    resetNativeSenseBuffer();`;
  const resetPatch = `    this.preRoll = [];\n    this.trackPumpStopped = false;\n    this.usingTrackProcessor = false;\n    resetNativeSenseBuffer();`;
  if (!audio.includes(resetAnchor)) throw new Error('pure pcm: reset anchor missing');
  audio = audio.replace(resetAnchor, resetPatch);

  const contextAnchor = `    this.context = new AudioContext({ latencyHint: \"interactive\" });`;
  const contextPatch = `    const purePcmTarget =\n      /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent) ||\n      window.navigator.maxTouchPoints > 0 ||\n      window.matchMedia?.(\"(pointer: coarse)\")?.matches === true;\n    const TrackProcessor = (globalThis as any).MediaStreamTrackProcessor as\n      | (new (options: { track: MediaStreamTrack }) => { readable: ReadableStream<any> })\n      | undefined;\n    const inputTrack = this.stream.getAudioTracks()[0] ?? null;\n\n    if (purePcmTarget && TrackProcessor && inputTrack) {\n      try {\n        const trackProcessor = new TrackProcessor({ track: inputTrack });\n        const reader = trackProcessor.readable.getReader();\n        this.usingTrackProcessor = true;\n        this.trackReader = reader;\n        this.attachForegroundListeners();\n        window.dispatchEvent(\n          new CustomEvent(\"nubo:audio-capture-mode\", {\n            detail: { mode: \"media-stream-track-processor\" },\n          }),\n        );\n        void this.pumpTrackProcessor(reader, onAudio);\n        return;\n      } catch {\n        this.usingTrackProcessor = false;\n        this.trackReader = null;\n      }\n    }\n\n    // Compatibility fallback for browsers without audio TrackProcessor.\n    window.dispatchEvent(\n      new CustomEvent(\"nubo:audio-capture-mode\", { detail: { mode: \"webaudio-fallback\" } }),\n    );\n    this.context = new AudioContext({ latencyHint: \"interactive\" });`;
  if (!audio.includes(contextAnchor)) throw new Error('pure pcm: context anchor missing');
  audio = audio.replace(contextAnchor, contextPatch);

  const processPattern = /    this\.processor\.onaudioprocess = \(event\) => \{[\s\S]*?\n    \};\n\n    this\.source\.connect\(this\.processor\);/;
  if (!processPattern.test(audio)) throw new Error('pure pcm: onaudioprocess block missing');
  audio = audio.replace(
    processPattern,
    `    this.processor.onaudioprocess = (event) => {\n      this.handlePcmInput(\n        event.inputBuffer.getChannelData(0),\n        event.inputBuffer.sampleRate,\n        onAudio,\n      );\n    };\n\n    this.source.connect(this.processor);`,
  );

  const resumeAnchor = `  async resume() {\n    if (!this.context || !this.stream) return false;\n\n    for (const track of this.stream.getAudioTracks()) {\n      track.enabled = true;\n    }\n\n    await disableHardwareOutputForCaptureContext(this.context);`;
  const resumePatch = `  async resume() {\n    if (!this.stream) return false;\n\n    for (const track of this.stream.getAudioTracks()) {\n      track.enabled = true;\n    }\n\n    if (this.usingTrackProcessor) return true;\n    if (!this.context) return false;\n\n    await disableHardwareOutputForCaptureContext(this.context);`;
  if (!audio.includes(resumeAnchor)) throw new Error('pure pcm: resume anchor missing');
  audio = audio.replace(resumeAnchor, resumePatch);

  const stopAnchor = `  async stop() {\n    this.detachForegroundListeners();\n    if (this.processor) this.processor.onaudioprocess = null;`;
  const stopPatch = `  async stop() {\n    this.detachForegroundListeners();\n    this.trackPumpStopped = true;\n    const trackReader = this.trackReader;\n    this.trackReader = null;\n    if (trackReader) {\n      await trackReader.cancel().catch(() => undefined);\n      try { trackReader.releaseLock(); } catch {}\n    }\n    this.usingTrackProcessor = false;\n    if (this.processor) this.processor.onaudioprocess = null;`;
  if (!audio.includes(stopAnchor)) throw new Error('pure pcm: stop anchor missing');
  audio = audio.replace(stopAnchor, stopPatch);

  fs.writeFileSync(audioPath, audio);
}

// 2) Mobile web audio priming must not create an idle AudioContext. A user click
// on Start NUBO is already the gesture that unlocks playback. Keep YouTube preload.
const primePath = 'components/NuboAudioPrimeGuard.tsx';
let prime = fs.readFileSync(primePath, 'utf8');
if (!prime.includes(marker)) {
  const anchor = `async function primeNuboAudioSession() {\n  const host = window as NuboAudioWindow;`;
  const replacement = `async function primeNuboAudioSession() {\n  const host = window as NuboAudioWindow;\n\n  // ${marker}: mobile web uses pure PCM capture and must not keep a spare\n  // AudioContext alive while listening.\n  const purePcmTarget =\n    /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent) ||\n    window.navigator.maxTouchPoints > 0 ||\n    window.matchMedia?.(\"(pointer: coarse)\")?.matches === true;\n  if (purePcmTarget) {\n    host.__nuboAudioPrimed = true;\n    preloadYouTubeApi();\n    window.dispatchEvent(new CustomEvent(\"nubo-audio-primed\"));\n    return;\n  }`;
  if (!prime.includes(anchor)) throw new Error('pure pcm: prime anchor missing');
  prime = prime.replace(anchor, replacement);
  fs.writeFileSync(primePath, prime);
}

// 3) The lookup filler patch injects browser speechSynthesis during build. On
// mobile web use text-only acknowledgement; Gemini remains the only speaking path.
const voicePath = 'components/GeminiVoiceConsole.tsx';
let voice = fs.readFileSync(voicePath, 'utf8');
if (!voice.includes(marker)) {
  const anchor = `    // Browser fallback is retained for desktop/web, but Android should not\n    // depend on speechSynthesis because WebView may expose it without audio.`;
  const replacement = `    // ${marker}: no browser TTS on phones/touch devices. Keeping Gemini as\n    // the only audio producer prevents capture/playback/TTS audio-focus churn.\n    if (\n      /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent) ||\n      window.navigator.maxTouchPoints > 0 ||\n      window.matchMedia?.(\"(pointer: coarse)\")?.matches === true\n    ) {\n      return;\n    }\n\n${anchor}`;
  if (!voice.includes(anchor)) throw new Error('pure pcm: lookup filler anchor missing');
  voice = voice.replace(anchor, replacement);
  fs.writeFileSync(voicePath, voice);
}

for (const path of [audioPath, primePath, voicePath]) {
  if (!fs.readFileSync(path, 'utf8').includes(marker)) {
    throw new Error(`pure pcm verification failed: ${path}`);
  }
}

console.log('Applied mobile Pure PCM single-audio-path mode');
