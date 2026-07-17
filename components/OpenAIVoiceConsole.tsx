"use client";

import {
  OpenAIRealtimeWebRTC,
  RealtimeAgent,
  RealtimeSession,
} from "@openai/agents/realtime";
import { useRef, useState } from "react";
import { nuboAgent } from "@/lib/nubo-agent";

type ConnectionState = "idle" | "connecting" | "connected" | "error";
type OpenAIVoice = "marin" | "cedar" | "coral" | "sage";
type Personality = "playful" | "professional" | "companion" | "minimal";

const OPENAI_VOICE_KEY = "nubo_openai_voice_v1";
const PERSONALITY_KEY = "nubo_voice_personality_v1";

function readOpenAIVoice(): OpenAIVoice {
  const stored = window.localStorage.getItem(OPENAI_VOICE_KEY);
  if (
    stored === "cedar" ||
    stored === "coral" ||
    stored === "sage"
  ) {
    return stored;
  }
  return "marin";
}

function readPersonality(): Personality {
  const stored = window.localStorage.getItem(PERSONALITY_KEY);
  if (
    stored === "playful" ||
    stored === "professional" ||
    stored === "minimal"
  ) {
    return stored;
  }
  return "companion";
}

function personalityLabel(personality: Personality) {
  return personality === "playful"
    ? "俏皮兄弟"
    : personality === "professional"
      ? "專業管家"
      : personality === "minimal"
        ? "極簡快速"
        : "自然陪伴";
}

function buildInstructions(personality: Personality) {
  const base = [
    "你是NUBO，Leo的個人AI語音總管。只用自然、簡潔的繁體中文回答。",
    "一般聊天、常識、簡單建議與一般問題直接回答，不得呼叫research_now。",
    "只有使用者明確要求最新搜尋、查證、多來源比較、來源或深入研究時，才能呼叫research_now。",
    "若語音很短、不完整、不是繁體中文或像外語誤辨識，直接說沒聽清楚並請使用者重說，不得呼叫工具。",
    "執行工具或思考期間不得說請稍等、等一下或我正在處理；完成後直接回答。",
    "正式寄信必須先預覽並等待確認；付款、轉帳、刪除、改價、取消訂單與正式PMS操作必須再次確認。",
  ];

  if (personality === "playful") {
    base.push(
      "目前是俏皮兄弟模式：語氣活潑、有一點三八與幽默，可以偶爾自然輕笑或短暫吐槽，但不要每句都笑，也不要用文字硬唸哈哈哈。",
      "遇到旅館營運、Gmail、金錢、安全或正式工作時，自動收斂成精準專業語氣。",
      "使用者說認真一點時立即停止玩笑；說輕鬆一點時再恢復俏皮。",
    );
  } else if (personality === "professional") {
    base.push(
      "目前是專業AI管家模式：語氣沉穩、精準、有條理，先給結論，再補必要資訊，避免不必要笑聲。",
    );
  } else if (personality === "minimal") {
    base.push(
      "目前是極簡快速模式：通常用一到三句回答，工具完成後只回報結果；除非要求詳細說明，否則不要長篇朗讀。",
    );
  } else {
    base.push(
      "目前是自然陪伴模式：像熟悉的朋友一樣自然、溫暖、有同理心，保持簡潔，不要刻意表演；正式工作仍要準確可靠。",
    );
  }

  return base.join("\n");
}

function createProfileAgent(personality: Personality) {
  const tools = (
    nuboAgent as unknown as {
      tools?: unknown[];
    }
  ).tools ?? [];

  return new RealtimeAgent({
    name: "NUBO",
    instructions: buildInstructions(personality),
    tools,
  } as any);
}

export function OpenAIVoiceConsole() {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");
  const [voiceLabel, setVoiceLabel] = useState("Marin高擬人語音");

  const connect = async () => {
    setError("");
    setState("connecting");
    try {
      const voice = readOpenAIVoice();
      const personality = readPersonality();
      const voiceName =
        voice === "cedar"
          ? "Cedar沉穩專業"
          : voice === "coral"
            ? "Coral明亮有活力"
            : voice === "sage"
              ? "Sage知性柔和"
              : "Marin高擬人自然";
      setVoiceLabel(
        `${voiceName}／${personalityLabel(personality)}`,
      );

      const transport = new OpenAIRealtimeWebRTC({
        baseUrl:
          `${window.location.origin}/api/realtime-call` +
          `?voice=${encodeURIComponent(voice)}`,
        useInsecureApiKey: true,
      });
      const agent = createProfileAgent(personality);
      const session = new RealtimeSession(agent, {
        model: "gpt-realtime-2",
        transport,
        config: { audio: { output: { voice } } },
      });
      session.on("error", (event) => {
        console.error("NUBO OpenAI voice session error", event);
        setError("OpenAI擬人語音連線失敗，請檢查API額度或切回Gemini。");
        setState("error");
      });
      await session.connect({ apiKey: "nubo-server-proxy" });
      sessionRef.current = session;
      setState("connected");
    } catch (cause) {
      console.error("NUBO OpenAI voice connection failed", cause);
      setError(cause instanceof Error ? cause.message : "OpenAI擬人語音連線失敗");
      setState("error");
    }
  };

  const disconnect = () => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setState("idle");
    setError("");
  };

  const stateLabel = {
    idle: ["NUBO待命", voiceLabel],
    connecting: ["NUBO正在連線", "請允許麥克風權限"],
    connected: ["NUBO正在聆聽", voiceLabel],
    error: ["NUBO尚未連線", "請檢查服務與網路狀態"],
  }[state];

  return (
    <section className="console" aria-live="polite">
      <div className="orb-wrap">
        <div className={`orb ${state === "connected" ? "active" : ""}`} />
      </div>
      <div className="status">
        <strong>{stateLabel[0]}</strong>
        <span>{stateLabel[1]}</span>
      </div>
      <div className="actions">
        <button className="primary" onClick={connect} disabled={state === "connecting" || state === "connected"}>
          {state === "connecting" ? "連線中…" : "啟動 NUBO"}
        </button>
        <button className="secondary" onClick={disconnect} disabled={state !== "connected"}>
          結束對話
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <div className="capabilities">
        <div className="capability"><b>OpenAI擬人語音</b><small>可切換Marin、Cedar、Coral與Sage。</small></div>
        <div className="capability"><b>個性模式</b><small>支援俏皮兄弟、專業管家、自然陪伴與極簡快速。</small></div>
        <div className="capability"><b>安全權限</b><small>高風險外部操作仍需再次確認。</small></div>
      </div>
    </section>
  );
}
