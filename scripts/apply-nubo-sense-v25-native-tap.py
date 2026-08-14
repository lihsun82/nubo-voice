from pathlib import Path


def must_replace(text: str, old: str, new: str, label: str, count: int = 1) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, count)


# Build this diagnostic APK as V25 without depending on the remote web bundle being current.
p = Path("android-nubo/app/build.gradle")
s = p.read_text()
s = s.replace("versionCode 24", "versionCode 25")
s = s.replace('versionName "0.24.0"', 'versionName "0.25.0"')
p.write_text(s)


# Android native layer: inject a JS audio tap into the loaded WebView. The tap hooks the
# SAME ScriptProcessorNode that NUBO/Gemini already uses, so it does not open a second mic.
p = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = p.read_text()
s = s.replace("https://nubo.ainubo.com/?native=android-v24", "https://nubo.ainubo.com/?native=android-v25")
s = s.replace("NUBO-Android/24", "NUBO-Android/25")
s = s.replace("android-v24", "android-v25")

field_marker = '''    private boolean activityForeground = false;\n    private String voicePhase = "idle";\n'''
field_insert = '''    private boolean activityForeground = false;\n    private String voicePhase = "idle";\n    private long sensePcmFrames = 0L;\n    private long lastSensePcmAcceptedAtMs = 0L;\n'''
if "sensePcmFrames" not in s:
    s = must_replace(s, field_marker, field_insert, "V25 PCM fields")

page_marker = '''                view.evaluateJavascript(\n                    "document.documentElement.dataset.nuboNative='android-v25';window.dispatchEvent(new CustomEvent('nubo-native-ready',{detail:{version:'android-v25',sense:'v1'}}));",\n                    null\n                );\n'''
page_insert = page_marker + '''                installNativeSenseTap(view);\n'''
if "installNativeSenseTap(view);" not in s:
    s = must_replace(s, page_marker, page_insert, "install native tap")

bridge_marker = '''    private static final class NuboNativeBridge {\n'''
bridge_insert = r'''    private void installNativeSenseTap(WebView view) {
        if (view == null) return;
        String script = """
            (() => {
              try {
                if (window.__nuboSenseV25Installed) return 'already-installed';
                window.__nuboSenseV25Installed = true;

                const FRAME_BYTES = 31200; // 15,600 mono PCM16 samples = YAMNet 0.975 s window.
                let chunks = [];
                let totalBytes = 0;
                let sentFrames = 0;

                function badge(text) {
                  try {
                    let el = document.getElementById('nubo-sense-v25-diag');
                    if (!el) {
                      el = document.createElement('div');
                      el.id = 'nubo-sense-v25-diag';
                      el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;max-width:92vw;padding:5px 8px;border-radius:7px;background:rgba(0,0,0,.72);color:#fff;font:11px/1.35 sans-serif;pointer-events:none;white-space:normal;';
                      document.documentElement.appendChild(el);
                    }
                    el.textContent = text;
                  } catch (_) {}
                }

                function toBase64(bytes) {
                  let binary = '';
                  const step = 0x4000;
                  for (let i = 0; i < bytes.length; i += step) {
                    binary += String.fromCharCode(...bytes.subarray(i, i + step));
                  }
                  return btoa(binary);
                }

                function pushBytes(bytes) {
                  chunks.push(bytes);
                  totalBytes += bytes.length;
                  if (totalBytes < FRAME_BYTES) return;

                  const merged = new Uint8Array(totalBytes);
                  let offset = 0;
                  for (const chunk of chunks) {
                    merged.set(chunk, offset);
                    offset += chunk.length;
                  }

                  const frame = merged.slice(0, FRAME_BYTES);
                  const remainder = merged.slice(FRAME_BYTES);
                  chunks = remainder.length ? [remainder] : [];
                  totalBytes = remainder.length;
                  sentFrames += 1;

                  try {
                    const ok = window.NuboNative?.pushSensePcm16Base64?.(toBase64(frame));
                    badge(`Sense V25：PCM #${sentFrames} → Android ${ok === false ? '拒絕' : '送出'}`);
                  } catch (error) {
                    badge(`Sense V25：Bridge 失敗 ${String(error).slice(0, 80)}`);
                  }
                }

                function downsampleAndEncode(input, inputRate) {
                  const outputRate = 16000;
                  const ratio = Math.max(1, inputRate / outputRate);
                  const outLength = Math.max(1, Math.floor(input.length / ratio));
                  const buffer = new ArrayBuffer(outLength * 2);
                  const view = new DataView(buffer);
                  for (let i = 0; i < outLength; i++) {
                    const start = Math.floor(i * ratio);
                    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
                    let sum = 0;
                    for (let j = start; j < end; j++) sum += input[j];
                    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
                    const value = sample < 0 ? sample * 32768 : sample * 32767;
                    view.setInt16(i * 2, value, true);
                  }
                  return new Uint8Array(buffer);
                }

                function patchContext(ContextCtor) {
                  if (!ContextCtor?.prototype?.createScriptProcessor) return false;
                  const proto = ContextCtor.prototype;
                  if (proto.__nuboSenseV25Patched) return true;
                  const original = proto.createScriptProcessor;
                  Object.defineProperty(proto, '__nuboSenseV25Patched', { value: true, configurable: true });
                  proto.createScriptProcessor = function(...args) {
                    const context = this;
                    const node = original.apply(context, args);
                    try {
                      node.addEventListener('audioprocess', (event) => {
                        try {
                          const input = event.inputBuffer?.getChannelData?.(0);
                          if (!input?.length) return;
                          let energy = 0;
                          for (let i = 0; i < input.length; i += 8) energy += input[i] * input[i];
                          if (energy <= 0.000001) return;
                          pushBytes(downsampleAndEncode(input, event.inputBuffer.sampleRate || context.sampleRate || 48000));
                        } catch (_) {}
                      });
                    } catch (_) {}
                    return node;
                  };
                  return true;
                }

                const a = patchContext(window.AudioContext);
                const b = patchContext(window.webkitAudioContext);
                badge(`Sense V25：原生 Tap 已安裝 (${a || b ? 'AudioContext OK' : '找不到 AudioContext'})`);
                return 'installed';
              } catch (error) {
                return 'install-error:' + String(error);
              }
            })();
            """;
        view.evaluateJavascript(script, result -> {
            if (result == null) return;
            android.util.Log.i("NuboSense", "V25 tap install result: " + result);
        });
    }

    private void dispatchSenseDebugToWeb(String message) {
        if (webView == null || message == null) return;
        try {
            JSONObject detail = new JSONObject();
            detail.put("message", message);
            webView.evaluateJavascript(
                "(() => {"
                    + "const d=" + detail.toString() + ";"
                    + "window.dispatchEvent(new CustomEvent('nubo:sense-debug',{detail:d}));"
                    + "let e=document.getElementById('nubo-sense-v25-diag');"
                    + "if(!e){e=document.createElement('div');e.id='nubo-sense-v25-diag';e.style.cssText='position:fixed;left:8px;bottom:8px;z-index:2147483647;max-width:92vw;padding:5px 8px;border-radius:7px;background:rgba(0,0,0,.72);color:#fff;font:11px/1.35 sans-serif;pointer-events:none;white-space:normal;';document.documentElement.appendChild(e);}"
                    + "e.textContent='Sense V25：'+d.message;"
                    + "})();",
                null
            );
        } catch (Exception ignored) {}
    }

'''
if "private void installNativeSenseTap" not in s:
    s = must_replace(s, bridge_marker, bridge_insert + bridge_marker, "V25 tap methods")

listener_old = '''                @Override\n                public void onSenseError(String message) {\n                    // Keep this fail-open: Gemini and the existing NUBO UI must continue\n                    // working even if local audio classification is unavailable.\n                }\n'''
listener_new = '''                @Override\n                public void onSenseError(String message) {\n                    runOnUiThread(() -> dispatchSenseDebugToWeb("錯誤：" + message));\n                }\n\n                @Override\n                public void onSenseDebug(String message) {\n                    runOnUiThread(() -> dispatchSenseDebugToWeb(message));\n                }\n'''
if "public void onSenseDebug" not in s:
    s = must_replace(s, listener_old, listener_new, "Sense debug listener")

pcm_old = '''    private void pushSensePcm16Base64(String pcmBase64) {\n        if (!activityForeground || !"listening".equals(voicePhase)) return;\n        try {\n            byte[] pcm = android.util.Base64.decode(pcmBase64, android.util.Base64.DEFAULT);\n            ensureSenseDetector();\n            if (senseDetector != null) senseDetector.classifyPcm16(pcm);\n        } catch (RuntimeException ignored) {\n            // Gemini audio must continue even if Sense diagnostics fail.\n        }\n    }\n'''
pcm_new = '''    private void pushSensePcm16Base64(String pcmBase64) {\n        if (!activityForeground) return;\n        if ("connecting".equals(voicePhase) || "thinking".equals(voicePhase) || "speaking".equals(voicePhase)) return;\n        long now = android.os.SystemClock.elapsedRealtime();\n        if (now - lastSensePcmAcceptedAtMs < 700L) return;\n        lastSensePcmAcceptedAtMs = now;\n        try {\n            byte[] pcm = android.util.Base64.decode(pcmBase64, android.util.Base64.DEFAULT);\n            sensePcmFrames += 1L;\n            ensureSenseDetector();\n            boolean accepted = senseDetector != null && senseDetector.classifyPcm16(pcm);\n            dispatchSenseDebugToWeb(\n                "PCM #" + sensePcmFrames + " / " + pcm.length + " bytes / classifier=" + (accepted ? "OK" : "NO")\n            );\n        } catch (RuntimeException error) {\n            dispatchSenseDebugToWeb("PCM bridge 錯誤：" + error.getClass().getSimpleName());\n        }\n    }\n'''
s = must_replace(s, pcm_old, pcm_new, "V25 PCM bridge")
p.write_text(s)


# Detector: expose Top-5 diagnostics and feed YAMNet exactly its 0.975-second window.
p = Path("android-nubo/app/src/main/java/com/ainubo/nubo/NuboSenseAudioDetector.java")
s = p.read_text()
s = s.replace("import java.util.HashMap;", "import java.util.ArrayList;\nimport java.util.Comparator;\nimport java.util.HashMap;")
s = s.replace('''    public interface Listener {\n        void onSenseEvent(SenseEvent event);\n        void onSenseError(String message);\n    }\n''', '''    public interface Listener {\n        void onSenseEvent(SenseEvent event);\n        void onSenseError(String message);\n        void onSenseDebug(String message);\n    }\n''')
s = s.replace('''    private volatile boolean ambientRunning;\n''', '''    private volatile boolean ambientRunning;\n    private long lastClassifierTimestampMs = 0L;\n''')

ready_old = '''            classifier = AudioClassifier.createFromOptions(context, options);\n        } catch (RuntimeException error) {\n'''
ready_new = '''            classifier = AudioClassifier.createFromOptions(context, options);\n            if (listener != null) listener.onSenseDebug("YAMNet 模型已載入");\n        } catch (RuntimeException error) {\n'''
s = must_replace(s, ready_old, ready_new, "classifier ready debug")

method_old = '''    public synchronized boolean classifyPcm16(byte[] pcmLittleEndian) {\n        if (pcmLittleEndian == null || pcmLittleEndian.length < 2) return false;\n        if (classifier == null) {\n            initializeClassifier();\n            if (classifier == null) return false;\n        }\n        int availableSamples = pcmLittleEndian.length / 2;\n        int copySamples = Math.min(availableSamples, SAMPLE_RATE_HZ);\n        int sourceSampleOffset = Math.max(0, availableSamples - copySamples);\n        short[] samples = new short[SAMPLE_RATE_HZ];\n        int destinationOffset = SAMPLE_RATE_HZ - copySamples;\n        for (int i = 0; i < copySamples; i++) {\n            int byteIndex = (sourceSampleOffset + i) * 2;\n            int lo = pcmLittleEndian[byteIndex] & 0xff;\n            int hi = pcmLittleEndian[byteIndex + 1];\n            samples[destinationOffset + i] = (short) (lo | (hi << 8));\n        }\n        try {\n            AudioData.AudioDataFormat format = AudioData.AudioDataFormat.builder()\n                .setNumOfChannels(1)\n                .setSampleRate(SAMPLE_RATE_HZ)\n                .build();\n            AudioData audioData = AudioData.create(format, SAMPLE_RATE_HZ);\n            audioData.load(samples);\n            classifier.classifyAsync(audioData, SystemClock.uptimeMillis());\n            return true;\n        } catch (RuntimeException error) {\n            Log.w(TAG, "Live PCM classification failed", error);\n            return false;\n        }\n    }\n'''
method_new = '''    private synchronized long nextClassifierTimestampMs() {\n        long now = SystemClock.uptimeMillis();\n        if (now <= lastClassifierTimestampMs) now = lastClassifierTimestampMs + 1L;\n        lastClassifierTimestampMs = now;\n        return now;\n    }\n\n    public synchronized boolean classifyPcm16(byte[] pcmLittleEndian) {\n        if (pcmLittleEndian == null || pcmLittleEndian.length < 2) return false;\n        if (classifier == null) {\n            initializeClassifier();\n            if (classifier == null) return false;\n        }\n        int availableSamples = pcmLittleEndian.length / 2;\n        int copySamples = Math.min(availableSamples, MODEL_SAMPLE_COUNT);\n        int sourceSampleOffset = Math.max(0, availableSamples - copySamples);\n        short[] samples = new short[MODEL_SAMPLE_COUNT];\n        int destinationOffset = MODEL_SAMPLE_COUNT - copySamples;\n        for (int i = 0; i < copySamples; i++) {\n            int byteIndex = (sourceSampleOffset + i) * 2;\n            int lo = pcmLittleEndian[byteIndex] & 0xff;\n            int hi = pcmLittleEndian[byteIndex + 1];\n            samples[destinationOffset + i] = (short) (lo | (hi << 8));\n        }\n        try {\n            AudioData.AudioDataFormat format = AudioData.AudioDataFormat.builder()\n                .setNumOfChannels(1)\n                .setSampleRate(SAMPLE_RATE_HZ)\n                .build();\n            AudioData audioData = AudioData.create(format, MODEL_SAMPLE_COUNT);\n            audioData.load(samples);\n            classifier.classifyAsync(audioData, nextClassifierTimestampMs());\n            return true;\n        } catch (RuntimeException error) {\n            Log.w(TAG, "Live PCM classification failed", error);\n            if (listener != null) listener.onSenseDebug("classifyAsync 失敗：" + safeMessage(error));\n            return false;\n        }\n    }\n'''
s = must_replace(s, method_old, method_new, "V25 exact YAMNet window")
s = s.replace("currentClassifier.classifyAsync(audioData, SystemClock.uptimeMillis());", "currentClassifier.classifyAsync(audioData, nextClassifierTimestampMs());")

result_old = '''        Map<String, BestMatch> bestByType = new HashMap<>();\n        List<ClassificationResult> resultBlocks = result.classificationResults();\n'''
result_new = '''        Map<String, BestMatch> bestByType = new HashMap<>();\n        List<Category> allCategories = new ArrayList<>();\n        List<ClassificationResult> resultBlocks = result.classificationResults();\n'''
s = must_replace(s, result_old, result_new, "collect diagnostic categories")
s = s.replace('''                    if (category == null || category.categoryName() == null) continue;\n                    String eventType = mapLabelToEventType(category.categoryName());\n''', '''                    if (category == null || category.categoryName() == null) continue;\n                    allCategories.add(category);\n                    String eventType = mapLabelToEventType(category.categoryName());\n''')
loop_marker = '''        long now = SystemClock.elapsedRealtime();\n        for (Map.Entry<String, BestMatch> entry : bestByType.entrySet()) {\n'''
loop_insert = '''        if (!allCategories.isEmpty() && listener != null) {\n            allCategories.sort(Comparator.comparing(Category::score).reversed());\n            StringBuilder debug = new StringBuilder("Top：");\n            int limit = Math.min(5, allCategories.size());\n            for (int i = 0; i < limit; i++) {\n                Category category = allCategories.get(i);\n                if (i > 0) debug.append(" | ");\n                debug.append(category.categoryName())\n                    .append(' ')\n                    .append(Math.round(category.score() * 100f))\n                    .append('%');\n            }\n            listener.onSenseDebug(debug.toString());\n        }\n\n        long now = SystemClock.elapsedRealtime();\n        for (Map.Entry<String, BestMatch> entry : bestByType.entrySet()) {\n'''
s = must_replace(s, loop_marker, loop_insert, "Top-5 debug")

# Diagnostic thresholds: low enough to prove recognition first; we'll retune after real-device Top-5 data.
s = s.replace("new DetectionRule(0.18f, 1, 15_000L)", "new DetectionRule(0.08f, 1, 12_000L)")
s = s.replace("new DetectionRule(0.20f, 1, 20_000L)", "new DetectionRule(0.08f, 1, 15_000L)")
s = s.replace("new DetectionRule(0.16f, 1, 30_000L)", "new DetectionRule(0.08f, 1, 20_000L)")
s = s.replace('float threshold = normalized.contains("gasp") ? 0.26f : 0.20f;', 'float threshold = normalized.contains("gasp") ? 0.12f : 0.10f;')
s = s.replace("new DetectionRule(0.22f, 1, 10_000L)", "new DetectionRule(0.10f, 1, 8_000L)")
s = s.replace("new DetectionRule(0.18f, 1, 15_000L)", "new DetectionRule(0.10f, 1, 12_000L)")
s = s.replace("new DetectionRule(0.22f, 1, 25_000L)", "new DetectionRule(0.12f, 1, 18_000L)")
p.write_text(s)
