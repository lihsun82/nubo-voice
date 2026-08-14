from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


p = Path("components/GeminiVoiceConsole.tsx")
s = p.read_text()

if "NUBO_YOUTUBE_LOCAL_FAST_ROUTE_V33" in s:
    print("V33 web fast route already applied")
    raise SystemExit(0)

old = '''function includesVoiceCommand(text: string, words: string[]) {\n  const normalized = normalizeVoiceCommandText(text);\n  return words.some((word) => normalized.includes(normalizeVoiceCommandText(word)));\n}\n'''
new = old + r'''

// NUBO_YOUTUBE_LOCAL_FAST_ROUTE_V33
// Named-song commands are deterministic device-control intents, not open-ended chat.
// Route them from Live input transcription straight to the existing YouTube search +
// Android native bridge instead of waiting for the model to decide to emit a tool call.
const NUBO_YOUTUBE_FAST_ROUTE_DEDUPE_MS = 12_000;

function normalizeYouTubeFastQuery(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s　，,。.!！?？、:：;；'"“”‘’（）()【】\[\]_-]+/g, "");
}

function extractYouTubeFastRouteQuery(text: string) {
  const cleaned = text
    .trim()
    .replace(/^(?:嗨|嘿|hi|hey)?\s*nubo[，,。.!！?？\s]*/iu, "")
    .replace(/^努寶[，,。.!！?？\s]*/u, "");

  if (!cleaned || /(?:不要|不用|別)(?:播放|播|放|換)/u.test(cleaned)) return "";

  const match = cleaned.match(
    /(?:換成|換歌(?:換成)?|改播|改成(?:播放|播)?|切到|播放|播一下|播|我要聽|我想聽|幫我(?:播放|播|放)|放一下|放)\s*(.+)$/u,
  );
  if (!match?.[1]) return "";

  const query = match[1]
    .replace(/^(?:youtube|yt|油管)[，,。.!！?？\s]*/iu, "")
    .replace(/(?:可以嗎|好嗎|麻煩了|謝謝|這首歌|這一首|這首|歌曲|音樂)[，,。.!！?？\s]*$/u, "")
    .trim();

  const generic = normalizeYouTubeFastQuery(query);
  if (
    !query ||
    query.length < 2 ||
    ["換歌", "下一首", "下一首歌", "另一首", "另一首歌", "一首", "別首", "別的"].includes(generic)
  ) {
    return "";
  }

  return query;
}

function sameYouTubeFastQuery(left: string, right: string) {
  const a = normalizeYouTubeFastQuery(left);
  const b = normalizeYouTubeFastQuery(right);
  if (!a || !b) return false;
  return a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)));
}
'''
s = replace_once(s, old, new, "V33 helper insertion")

old = '''  const lastInteractionAtRef = useRef(Date.now());\n  const ecoRecognitionRef = useRef<any>(null);\n'''
new = '''  const lastInteractionAtRef = useRef(Date.now());\n  const youtubeFastRouteTimerRef = useRef<number | null>(null);\n  const youtubeFastRouteRef = useRef<{\n    query: string;\n    at: number;\n    result?: unknown;\n  } | null>(null);\n  const ecoRecognitionRef = useRef<any>(null);\n'''
s = replace_once(s, old, new, "V33 refs")

old = '''  useEffect(() => {\n    void fetch("/api/gemini-token?warm=1", { cache: "no-store" }).catch(() => {\n      // Token prewarm is optional. NUBO can still request a token when connecting.\n    });\n  }, []);\n'''
new = old + '''\n  useEffect(() => {\n    return () => {\n      if (youtubeFastRouteTimerRef.current !== null) {\n        window.clearTimeout(youtubeFastRouteTimerRef.current);\n        youtubeFastRouteTimerRef.current = null;\n      }\n    };\n  }, []);\n'''
s = replace_once(s, old, new, "V33 timer cleanup")

old = '''            recordNuboQuestion(\n              trimmedUserText,\n            );\n\n            // NUBO_TRAVEL_BACKGROUND_PREFETCH\n'''
new = '''            recordNuboQuestion(\n              trimmedUserText,\n            );\n\n            const fastYouTubeQuery =\n              extractYouTubeFastRouteQuery(trimmedUserText);\n\n            if (fastYouTubeQuery) {\n              if (youtubeFastRouteTimerRef.current !== null) {\n                window.clearTimeout(youtubeFastRouteTimerRef.current);\n              }\n\n              // Live transcription can arrive in short revisions. A tiny debounce lets\n              // the final song title settle while still beating the model tool-call path.\n              youtubeFastRouteTimerRef.current = window.setTimeout(() => {\n                youtubeFastRouteTimerRef.current = null;\n                const startedAt = Date.now();\n                youtubeFastRouteRef.current = {\n                  query: fastYouTubeQuery,\n                  at: startedAt,\n                };\n\n                setTranscript(`正在切換歌曲：${fastYouTubeQuery}…`);\n\n                void executeNuboBrowserTool({\n                  name: "open_youtube",\n                  args: {\n                    query: fastYouTubeQuery,\n                    service: "youtube",\n                  },\n                })\n                  .then((result) => {\n                    const current = youtubeFastRouteRef.current;\n                    if (current?.at === startedAt) {\n                      current.result = result;\n                    }\n                    setTranscript(`已送出換歌：${fastYouTubeQuery}`);\n                    notifyNuboVoicePhase("listening");\n                  })\n                  .catch((cause) => {\n                    setError(\n                      cause instanceof Error\n                        ? cause.message\n                        : "YouTube換歌失敗",\n                    );\n                  });\n              }, 180);\n            }\n\n            // NUBO_TRAVEL_BACKGROUND_PREFETCH\n'''
s = replace_once(s, old, new, "V33 transcript fast route")

old = '''                if (call.name === "research_now") {\n                }\n                const result = await executeNuboBrowserTool(call);\n\n                // NUBO_MOBILE_APP_AUTO_OPEN_V1\n'''
new = '''                if (call.name === "research_now") {\n                }\n\n                const toolQuery =\n                  call.name === "open_youtube"\n                    ? String(call.args?.query ?? "").trim()\n                    : "";\n                const recentFastRoute = youtubeFastRouteRef.current;\n                const fastRouteDuplicate = Boolean(\n                  call.name === "open_youtube" &&\n                    recentFastRoute &&\n                    Date.now() - recentFastRoute.at <\n                      NUBO_YOUTUBE_FAST_ROUTE_DEDUPE_MS &&\n                    sameYouTubeFastQuery(toolQuery, recentFastRoute.query),\n                );\n\n                // The model may still emit open_youtube after the local fast route already\n                // switched the song. Treat that tool call as acknowledged, not a second launch.\n                const result = fastRouteDuplicate\n                  ? recentFastRoute?.result ?? {\n                      ok: true,\n                      alreadyHandled: true,\n                      route: "local-youtube-fast-route-v33",\n                      query: recentFastRoute?.query ?? toolQuery,\n                    }\n                  : await executeNuboBrowserTool(call);\n\n                // NUBO_MOBILE_APP_AUTO_OPEN_V1\n'''
s = replace_once(s, old, new, "V33 duplicate suppression")

p.write_text(s)
print("Applied V33 local YouTube fast route to GeminiVoiceConsole.tsx")
