from pathlib import Path


def must_replace(text: str, old: str, new: str, label: str, count: int = 1) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, count)


# Android version bump.
p = Path("android-nubo/app/build.gradle")
s = p.read_text()
s = s.replace("versionCode 23", "versionCode 24")
s = s.replace('versionName "0.23.0"', 'versionName "0.24.0"')
p.write_text(s)

# MainActivity V24 + live PCM bridge.
p = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = p.read_text()
s = s.replace("https://nubo.ainubo.com/?native=android-v23", "https://nubo.ainubo.com/?native=android-v24")
s = s.replace("NUBO-Android/23", "NUBO-Android/24")
s = s.replace("android-v23", "android-v24")
old = '''        @JavascriptInterface
        public boolean isSenseReady() {
            return activity.senseDetector != null && activity.senseDetector.isReady();
        }
'''
new = '''        @JavascriptInterface
        public boolean isSenseReady() {
            return activity.senseDetector != null && activity.senseDetector.isReady();
        }

        @JavascriptInterface
        public boolean pushSensePcm16Base64(String pcmBase64) {
            if (pcmBase64 == null || pcmBase64.isEmpty() || pcmBase64.length() > 100_000) {
                return false;
            }
            activity.runOnUiThread(() -> activity.pushSensePcm16Base64(pcmBase64));
            return true;
        }
'''
if "pushSensePcm16Base64" not in s:
    s = must_replace(s, old, new, "native bridge")

old = '''    private void handleSenseEvent(NuboSenseAudioDetector.SenseEvent event) {
        if (event == null || !canRunSenseAmbient()) return;

        dispatchSenseEventToWeb(event);
'''
new = '''    private void pushSensePcm16Base64(String pcmBase64) {
        if (!activityForeground || !"listening".equals(voicePhase)) return;
        try {
            byte[] pcm = android.util.Base64.decode(pcmBase64, android.util.Base64.DEFAULT);
            ensureSenseDetector();
            if (senseDetector != null) senseDetector.classifyPcm16(pcm);
        } catch (RuntimeException ignored) {
            // Gemini audio must continue even if Sense diagnostics fail.
        }
    }

    private void handleSenseEvent(NuboSenseAudioDetector.SenseEvent event) {
        if (event == null || !activityForeground) return;
        if (!("idle".equals(voicePhase)
            || "error".equals(voicePhase)
            || "listening".equals(voicePhase))) return;

        dispatchSenseEventToWeb(event);
'''
if "private void pushSensePcm16Base64" not in s:
    s = must_replace(s, old, new, "sense event gate")
p.write_text(s)

# Detector: classify shared live PCM and use test-friendly thresholds.
p = Path("android-nubo/app/src/main/java/com/ainubo/nubo/NuboSenseAudioDetector.java")
s = p.read_text()
s = s.replace(".setScoreThreshold(0.20f)", ".setScoreThreshold(0.05f)")
s = s.replace(".setMaxResults(12)", ".setMaxResults(30)")
s = s.replace("if (!ambientRunning || result == null) return;", "if (result == null) return;")
marker = '''    public boolean isReady() {
        return classifier != null;
    }
'''
insert = '''    public synchronized boolean classifyPcm16(byte[] pcmLittleEndian) {
        if (pcmLittleEndian == null || pcmLittleEndian.length < 2) return false;
        if (classifier == null) {
            initializeClassifier();
            if (classifier == null) return false;
        }
        int availableSamples = pcmLittleEndian.length / 2;
        int copySamples = Math.min(availableSamples, SAMPLE_RATE_HZ);
        int sourceSampleOffset = Math.max(0, availableSamples - copySamples);
        short[] samples = new short[SAMPLE_RATE_HZ];
        int destinationOffset = SAMPLE_RATE_HZ - copySamples;
        for (int i = 0; i < copySamples; i++) {
            int byteIndex = (sourceSampleOffset + i) * 2;
            int lo = pcmLittleEndian[byteIndex] & 0xff;
            int hi = pcmLittleEndian[byteIndex + 1];
            samples[destinationOffset + i] = (short) (lo | (hi << 8));
        }
        try {
            AudioData.AudioDataFormat format = AudioData.AudioDataFormat.builder()
                .setNumOfChannels(1)
                .setSampleRate(SAMPLE_RATE_HZ)
                .build();
            AudioData audioData = AudioData.create(format, SAMPLE_RATE_HZ);
            audioData.load(samples);
            classifier.classifyAsync(audioData, SystemClock.uptimeMillis());
            return true;
        } catch (RuntimeException error) {
            Log.w(TAG, "Live PCM classification failed", error);
            return false;
        }
    }

    public boolean isReady() {
        return classifier != null;
    }
'''
if "classifyPcm16(byte[]" not in s:
    s = must_replace(s, marker, insert, "classifyPcm16")
for old_value, new_value in [
    ("new DetectionRule(0.45f, 1, 20_000L)", "new DetectionRule(0.18f, 1, 15_000L)"),
    ("new DetectionRule(0.50f, 1, 30_000L)", "new DetectionRule(0.20f, 1, 20_000L)"),
    ("new DetectionRule(0.42f, 2, 50_000L)", "new DetectionRule(0.16f, 1, 30_000L)"),
    ('float threshold = normalized.contains("gasp") ? 0.70f : 0.58f;', 'float threshold = normalized.contains("gasp") ? 0.26f : 0.20f;'),
    ("new DetectionRule(threshold, 2, 40_000L)", "new DetectionRule(threshold, 1, 25_000L)"),
    ("new DetectionRule(0.62f, 1, 15_000L)", "new DetectionRule(0.22f, 1, 10_000L)"),
    ("new DetectionRule(0.54f, 2, 25_000L)", "new DetectionRule(0.18f, 1, 15_000L)"),
    ("new DetectionRule(0.60f, 2, 40_000L)", "new DetectionRule(0.22f, 1, 25_000L)"),
]:
    s = s.replace(old_value, new_value)
p.write_text(s)

# Reuse Gemini's already captured PCM and mirror one ~1-second frame to native Sense.
p = Path("lib/browser-audio.ts")
s = p.read_text()
marker = "function fromBase64(value: string): Uint8Array {\n"
helper = '''let nativeSenseChunks: Uint8Array[] = [];
let nativeSenseBytes = 0;
const NUBO_NATIVE_SENSE_FRAME_BYTES = 32_000;

function resetNativeSenseBuffer() {
  nativeSenseChunks = [];
  nativeSenseBytes = 0;
}

function forwardPcmToNativeSense(pcm: Uint8Array) {
  if (typeof window === "undefined") return;
  const bridge = (window as typeof window & {
    NuboNative?: { pushSensePcm16Base64?: (pcmBase64: string) => boolean };
  }).NuboNative;
  if (!bridge?.pushSensePcm16Base64) return;
  nativeSenseChunks.push(pcm.slice());
  nativeSenseBytes += pcm.length;
  if (nativeSenseBytes < NUBO_NATIVE_SENSE_FRAME_BYTES) return;
  const merged = new Uint8Array(nativeSenseBytes);
  let offset = 0;
  for (const chunk of nativeSenseChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  const frame = merged.slice(0, NUBO_NATIVE_SENSE_FRAME_BYTES);
  const remainder = merged.slice(NUBO_NATIVE_SENSE_FRAME_BYTES);
  resetNativeSenseBuffer();
  if (remainder.length) {
    nativeSenseChunks = [remainder];
    nativeSenseBytes = remainder.length;
  }
  try { bridge.pushSensePcm16Base64(toBase64(frame)); } catch {}
}

function fromBase64(value: string): Uint8Array {
'''
if "NUBO_NATIVE_SENSE_FRAME_BYTES" not in s:
    s = must_replace(s, marker, helper, "browser audio helper")
old = '''      const pcm = floatToPcm16(
        downsample(input, event.inputBuffer.sampleRate, 16000),
      );
      const base64 = toBase64(pcm);
'''
new = '''      const pcm = floatToPcm16(
        downsample(input, event.inputBuffer.sampleRate, 16000),
      );
      forwardPcmToNativeSense(pcm);
      const base64 = toBase64(pcm);
'''
if "forwardPcmToNativeSense(pcm);" not in s:
    s = must_replace(s, old, new, "forward PCM")
s = s.replace(
    '''    this.preRoll = [];

    this.stream = await navigator.mediaDevices.getUserMedia({
''',
    '''    this.preRoll = [];
    resetNativeSenseBuffer();

    this.stream = await navigator.mediaDevices.getUserMedia({
''',
    1,
)
p.write_text(s)

# Show detections in NUBO transcript immediately.
p = Path("components/GeminiVoiceConsole.tsx")
s = p.read_text()
marker = '''  useEffect(() => {
    if (state === "idle") notifyNuboVoicePhase("idle");
'''
telemetry = '''  useEffect(() => {
    const handleSenseEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; confidence?: number }>).detail;
      if (!detail?.type) return;
      const names: Record<string, string> = {
        cough: "咳嗽",
        sneeze: "打噴嚏",
        yawn: "打哈欠",
        breathing: "喘息／嘆氣",
        scream: "叫聲／尖叫",
        laughter: "笑聲",
        crying: "哭聲",
      };
      const confidence = typeof detail.confidence === "number"
        ? ` ${Math.round(detail.confidence * 100)}%`
        : "";
      setTranscript(`NUBO Sense 偵測：${names[detail.type] ?? detail.type}${confidence}`);
    };
    window.addEventListener("nubo:sense-event", handleSenseEvent);
    return () => window.removeEventListener("nubo:sense-event", handleSenseEvent);
  }, []);

  useEffect(() => {
    if (state === "idle") notifyNuboVoicePhase("idle");
'''
if "NUBO Sense 偵測：" not in s:
    s = must_replace(s, marker, telemetry, "Sense UI telemetry")
p.write_text(s)

# V24 Android workflow naming / publication checks.
p = Path(".github/workflows/android-debug.yml")
s = p.read_text()
s = s.replace("V23", "V24").replace("v23", "v24").replace("versionCode='23'", "versionCode='24'")
p.write_text(s)

# Remove branch-local non-running one-shot file if present.
q = Path(".github/workflows/one-shot-nubo-sense-v24-hotfix.yml")
if q.exists():
    q.unlink()
