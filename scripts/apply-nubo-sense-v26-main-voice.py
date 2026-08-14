from pathlib import Path
import runpy

# First apply the already validated V25 native PCM tap + YAMNet diagnostics.
runpy.run_path("scripts/apply-nubo-sense-v25-native-tap.py", run_name="__main__")

# Promote the generated diagnostic build to V26.
p = Path("android-nubo/app/build.gradle")
s = p.read_text().replace("versionCode 25", "versionCode 26").replace('versionName "0.25.0"', 'versionName "0.26.0"')
p.write_text(s)

p = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = p.read_text()
s = s.replace("android-v25", "android-v26").replace("NUBO-Android/25", "NUBO-Android/26")

# V26: Sense detects only. The selected/main NUBO voice owns all spoken reactions.
old = '''        dispatchSenseEventToWeb(event);\n        String phrase = localSenseResponse(event);\n        if (phrase == null || phrase.isEmpty()) return;\n\n        if (senseTtsReady && senseTts != null) {\n            senseTts.speak(\n                phrase,\n                TextToSpeech.QUEUE_FLUSH,\n                null,\n                "nubo-sense-" + event.timestampMs\n            );\n        }\n'''
new = '''        // V26: never speak through Android TextToSpeech here.\n        // The same active Gemini Live session / selected NUBO voice handles the reaction.\n        dispatchSenseEventToWeb(event);\n'''
if old not in s:
    raise SystemExit("V26 local TTS block not found")
s = s.replace(old, new, 1)

# Extend the V25 injected JS tap with a Gemini Live socket capture and main-voice handoff.
needle = '''                window.__nuboSenseV25Installed = true;\n\n                const FRAME_BYTES = 31200;'''
insert = r'''                window.__nuboSenseV25Installed = true;

                // Capture the Gemini Live WebSocket without changing the remote website bundle.
                // This lets a local Sense event trigger the SAME configured NUBO voice.
                try {
                  const proto = window.WebSocket?.prototype;
                  if (proto && !proto.__nuboSenseV26SocketPatched) {
                    const originalSend = proto.send;
                    Object.defineProperty(proto, '__nuboSenseV26SocketPatched', { value: true, configurable: true });
                    proto.send = function(data) {
                      try {
                        if (typeof data === 'string' && data.includes('"setup"') && data.includes('"generationConfig"')) {
                          window.__nuboGeminiLiveSocket = this;
                        }
                      } catch (_) {}
                      return originalSend.call(this, data);
                    };
                  }
                } catch (_) {}

                window.__nuboSenseAskMain = function(type, label, confidence) {
                  try {
                    const socket = window.__nuboGeminiLiveSocket;
                    if (!socket || socket.readyState !== WebSocket.OPEN) {
                      badge('Sense V26：已辨識，但主要 NUBO 尚未連線');
                      return false;
                    }
                    const prompts = {
                      cough: '【NUBO Sense 本機事件】使用者剛剛咳嗽。請用你目前的 NUBO 人格與目前選定的聲音，自然簡短關心一句，例如問要不要喝口水。不要提到系統、模型、辨識率或事件偵測。',
                      sneeze: '【NUBO Sense 本機事件】使用者剛剛打噴嚏。請用你目前的 NUBO 人格與目前選定的聲音，自然簡短回應一句，例如說保重。不要提到系統、模型、辨識率或事件偵測。',
                      yawn: '【NUBO Sense 本機事件】使用者剛剛打哈欠。請用你目前的 NUBO 人格與目前選定的聲音，自然簡短關心是不是累了。不要提到系統或事件偵測。',
                      breathing: '【NUBO Sense 本機事件】使用者剛剛有明顯喘息、嘆氣或呼吸聲。請用你目前的 NUBO 人格與目前選定的聲音，自然簡短問候是否還好；不要做醫療診斷。',
                      scream: '【NUBO Sense 本機事件】使用者剛剛突然叫了一聲或尖叫。請用你目前的 NUBO 人格與目前選定的聲音，立即簡短問「怎麼了，需要我幫忙嗎？」不要自行報警。',
                      laughter: '【NUBO Sense 本機事件】使用者剛剛笑了。請用你目前的 NUBO 人格與目前選定的聲音，自然輕鬆回應一句。',
                      crying: '【NUBO Sense 本機事件】使用者剛剛出現哭聲。請用你目前的 NUBO 人格與目前選定的聲音，溫和簡短問他還好嗎。'
                    };
                    const text = prompts[type];
                    if (!text) return false;
                    socket.send(JSON.stringify({
                      clientContent: {
                        turns: [{ role: 'user', parts: [{ text }] }],
                        turnComplete: true
                      }
                    }));
                    badge(`Sense V26：${type} → 主要 NUBO 回覆`);
                    return true;
                  } catch (error) {
                    badge(`Sense V26：主聲音送出失敗 ${String(error).slice(0, 70)}`);
                    return false;
                  }
                };

                const FRAME_BYTES = 31200;'''
if needle not in s:
    raise SystemExit("V26 injected JS insertion point not found")
s = s.replace(needle, insert, 1)

# When Android emits a classified event, dispatch the normal web event AND ask the main voice.
old = '''            webView.evaluateJavascript(\n                "window.dispatchEvent(new CustomEvent('nubo:sense-event',{detail:"\n                    + detail.toString()\n                    + "}));",\n                null\n            );\n'''
new = '''            webView.evaluateJavascript(\n                "(() => {const d=" + detail.toString() + ";"\n                    + "window.dispatchEvent(new CustomEvent('nubo:sense-event',{detail:d}));"\n                    + "try{window.__nuboSenseAskMain?.(d.type,d.label,d.confidence);}catch(_e){}"\n                    + "})();",\n                null\n            );\n'''
if old not in s:
    raise SystemExit("V26 dispatchSenseEventToWeb block not found")
s = s.replace(old, new, 1)

p.write_text(s)
