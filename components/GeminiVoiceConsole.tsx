"use client";

import { ROOM_PHOTO_TOOL, ROOM_PHOTO_GUIDANCE, type RoomPhotoRequest } from "@/lib/nubo-room-photos";

import { BOOKING_FLOW, BOOKING_HANDOFF_TOOL, inventoryPurpose } from "@/lib/nubo-booking-handoff";
import { loadGuestBookingLink, useGuestBookingPage } from "@/lib/use-guest-booking-page";

import { useCallback, useEffect, useRef, useState } from "react";
import { preconnect } from "react-dom";
import { sendTranscriptToNameAlert } from "@/lib/nubo-name-alert-client";
import { isNuboNameAlertText, startNuboBackgroundNameListener } from "@/lib/nubo-background-name-listener";
import { MicrophonePcmStream, PcmPlaybackQueue } from "@/lib/browser-audio";
import { NuboLiveAudioInput } from "@/lib/nubo-live-audio-input";
import { finishIncomingAudioTurn, recordIncomingAudioChunk, recordServerInterruption, recordSocketBuffer, recordUnexpectedDisconnect, recordVoiceLatency, resetVoiceReplyLatency, startVoiceDiagnostics } from "@/lib/nubo-voice-diagnostics";
import {
  executeNuboBrowserTool,
  geminiFunctionDeclarations,
  geminiSystemInstruction,
  type FunctionCall,
} from "@/lib/browser-nubo-tools-line";
import { runLocalVoiceCommand } from "@/lib/local-voice-commands";
import { notifyNuboVoicePhase } from "@/lib/nubo-voice-phase";
import { NuboConciergeKiosk } from "@/components/NuboConciergeKiosk";
import { NuboCallOpening, preloadNuboCallOpening } from "@/lib/nubo-call-tones";
import { formatNuboSessionClockInstruction } from "@/lib/nubo-session-clock";
import { getNuboGuestConfigSnapshot } from "@/lib/nubo-guest-features";
import {
  NUBO_KIOSK_GREETINGS, checkNuboEnglishReply, checkNuboMandarinReply, clearNuboGuestSpeechLanguage,
  detectNuboGuestReplyLanguage, detectNuboGuestSpeechLanguage,
  getNuboGuestSpeechLanguage, reportNuboKioskSpeech, type NuboKioskLanguage,
} from "@/lib/nubo-kiosk-language";
import { NUBO_KIOSK_LANGUAGE_INSTRUCTION } from "@/lib/nubo-native-language";
import { classifyNuboArrivalIntent } from "@/lib/nubo-arrival-intent";
import { floorsForRequiredAmenities, hasPmsFloorScope } from "@/lib/pms-facility-floors";
import {
  correctNuboGuestFollowUp,
  isNuboConversationCloser,
  latestNuboQuestion,
  readNuboShortReply,
  stripNuboStockClosing,
  type NuboFollowUp,
} from "@/lib/nubo-voice-follow-up";
import { recordNuboQuestion } from "@/components/NuboQuestionHistory";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

const GEMINI_LIVE_HOST = "generativelanguage.googleapis.com";
const NO_SPEECH_MARKER = "<no speech>";
const GREETING_INSTRUCTION = "The kiosk plays its fixed opening greeting locally. Wait for a guest question and answer it directly. Do not generate or repeat an opening greeting.";
const BOOKING_SUPPORT_INSTRUCTION = "訂房或房況查詢回傳 contactCardShown=true 時，先簡短說目前無法核對訂單或確認房況，再用旅客當下的語言提醒：NUBO 語音主畫面右上角有 LINE QR Code 和櫃檯電話。旅客在另一個訂房網頁或自助機操作時，請按該頁「客服協助」並點「公司電話」。該頁沒有 LINE 聯絡卡。只問該頁操作時，依自助頁指引回答。";
const GUARDED_REPLY_LANGUAGES = {
  en: { name: "English", repeat: "Could you repeat your question in English?" },
  zh: { name: "standard Taiwanese Mandarin (國語, zh-TW)", repeat: "可以再說一次嗎？" },
} as const;
const SPOKEN_REPLY_LANGUAGES = new Map<string, string>([
  ["en", GUARDED_REPLY_LANGUAGES.en.name], ["zh", GUARDED_REPLY_LANGUAGES.zh.name],
  ["nan", "Taiwanese Hokkien (臺灣台語)"], ["ja", "Japanese"], ["ko", "Korean"], ["vi", "Vietnamese"],
]);
const TAIWANESE_REST_REQUEST = /^(?:請問)?(?:我|阮|咱|咱們)?(?:想欲|欲|要)(?:佇遮)?(?:歇睏|歇|睏)[一二兩三四五六七八九十\d]+(?:个|個)?(?:點鐘|鐘頭|小時)/u;
const TAIWANESE_OVERNIGHT_REQUEST = /^(?:請問)?(?:我|阮|咱|咱們)?(?:想欲|欲|要)(?:佇遮)?(?:歇暝|歇一暝|住一暝|睏一暝)/u;
const TAIWANESE_BOOKING_REQUEST = /^(?:請問)?(?:我|阮|咱|咱們)?(?:想欲|欲)(?:佇遮|這馬|現場)?(?:訂房|訂(?:一間|間)?房(?:間)?)(?:敢會使|會使無|好無)?$/u;
const LOOKUP_CUE_TOOLS = new Set(["pms_check_availability", "pms_check_rest_availability", "pms_lookup_reservation"]);
const LOOKUP_CUES = { nan: "我來共你查一下。", zh: "我幫您查一下。" } as const;
type LookupCueLanguage = keyof typeof LOOKUP_CUES;
const ARRIVAL_KEYWORDS = { booking: "訂房", lodging: "住宿", checkin: "入住" } as const;
function asksForRoomPhotos(text: string) {
  if (/不要看|不想看|不用看|其他飯店|別家飯店|唔使睇|don.t (?:need|want)|no need|見たくない|いりません|보고 싶지 않|không muốn xem/iu.test(text)) return false;
  return /(?:客房|房間|房型).{0,9}(?:照片|相片|圖片)|(?:照片|相片|圖片).{0,9}(?:客房|房間|房型)/u.test(text) ||
    /(?:部屋|客室|ルーム).{0,9}(?:写真|画像)|(?:写真|画像).{0,9}(?:部屋|客室|ルーム)/u.test(text) ||
    /(?:객실|방).{0,9}(?:사진|이미지)|(?:사진|이미지).{0,9}(?:객실|방)/u.test(text) ||
    /\b(?:room(?:s)? (?:photos?|pictures?|images?)|(?:photos?|pictures?|images?) of (?:a |the |your )?rooms?)\b/iu.test(text) ||
    /(?:ảnh|hình).{0,9}phòng|phòng.{0,9}(?:ảnh|hình)/iu.test(text);
}

function bookingLookupNeedsContact(call: FunctionCall, result: Record<string, unknown>) {
  if (call.name === "pms_lookup_reservation") {
    const hasLookupDetails = [call.args?.bookingReference, call.args?.surname].every(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
    return hasLookupDetails && result.matched !== true;
  }

  if (call.name !== "pms_check_availability" && call.name !== "pms_check_rest_availability") return false;
  if (result.type === "group_booking_inquiry" || result.code === "dates_or_occupancy_needs_clarification") return false;

  const floors = floorsForRequiredAmenities(call.args?.requiredAmenities);
  const hasMatchingScope = floors && (floors.length
    ? hasPmsFloorScope(result, floors)
    : result.inventoryView === "guest-room-types-v1");
  const hasRoomTypes = hasMatchingScope &&
    Array.isArray(result.roomTypes) && result.roomTypes.length > 0;
  return result.ok === false || result.covered === false || !hasRoomTypes ||
    (call.name === "pms_check_availability" && (result.covered !== true || result.source !== "live"));
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "NUBO工具執行失敗");
  return payload;
}

async function parseSocketMessage(data: unknown) {
  let text: string;
  if (typeof data === "string") text = data;
  else if (data instanceof Blob) text = await data.text();
  else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
  else if (ArrayBuffer.isView(data)) text = new TextDecoder().decode(data);
  else throw new Error(`不支援的WebSocket訊息格式：${Object.prototype.toString.call(data)}`);
  return JSON.parse(text);
}

function shouldAcknowledgeQuestion(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;
  return /[?？嗎呢]|查|找|搜尋|幫我|怎麼|如何|為什麼|哪個|多少|是否|可以|解決|分析/.test(normalized);
}

const NUBO_SILENT_STORAGE_KEY = "nubo_silent_until_wake";

const NUBO_AUTO_RESUME_STORAGE_KEY =
  "nubo_voice_auto_resume_v1";

const NUBO_EXTERNAL_RETURN_STORAGE_KEY =
  "nubo_external_app_return_v1";

const NUBO_WAKE_WORDS = ["嗨nubo", "嗨 nubo", "ha nubo", "nubo", "兄弟", "有人嗎"];
const NUBO_SILENCE_WORDS = ["閉嘴", "安靜", "退下", "不要講話", "先不要說話", "不要說話", "停止說話", "停", "stop"];
const NUBO_ECO_IDLE_MS = 30_000;

function normalizeVoiceCommandText(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

function includesVoiceCommand(text: string, words: string[]) {
  const normalized = normalizeVoiceCommandText(text);
  return words.some((word) => normalized.includes(normalizeVoiceCommandText(word)));
}


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

export function GeminiVoiceConsole() {
  const socketRef = useRef<WebSocket | null>(null);
  const microphoneRef = useRef<MicrophonePcmStream | null>(null);
  const playbackRef = useRef<PcmPlaybackQueue | null>(null);
  const closingRef = useRef(false);
  const callActiveRef = useRef(false);
  const microphoneSinkRef = useRef<Parameters<MicrophonePcmStream["start"]>[0] | null>(null);
  const callToneRef = useRef<Promise<void> | null>(null);
  const greetingLanguageRef = useRef<NuboKioskLanguage | null>(null);
  const callOpeningRef = useRef<NuboCallOpening | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const sessionHandleRef = useRef<string | null>(null);
  const lastUserTextRef = useRef("");
  const travelPrefetchTextRef = useRef("");
  const silentUntilWakeRef = useRef(false);
  const foregroundResumeTimerRef =
    useRef<number | null>(null);
  const ecoSleepingRef = useRef(false);
  const ecoTimerRef = useRef<number | null>(null);
  const lastInteractionAtRef = useRef(Date.now());
  const browsingRoomPhotosRef = useRef(false);
  const onPhotoBrowsingChange = useCallback((open: boolean) => {
    browsingRoomPhotosRef.current = open;
    lastInteractionAtRef.current = Date.now();
    microphoneRef.current?.setRoomPhotoBrowsing(open);
  }, []);
  const youtubeFastRouteTimerRef = useRef<number | null>(null);
  const youtubeFastRouteRef = useRef<{
    query: string;
    at: number;
    result?: unknown;
  } | null>(null);
  const ecoRecognitionRef = useRef<any>(null);
  const ecoRecognitionRestartRef = useRef<number | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [isRinging, setIsRinging] = useState(false);
  const [contactCard, setContactCard] = useState<number | null>(null);
  const [roomPhotoRequest, setRoomPhotoRequest] = useState<RoomPhotoRequest | null>(null);

  useEffect(() => {
    if (contactCard === null) return;
    const timeout = window.setTimeout(() => setContactCard(null), 60_000);
    return () => window.clearTimeout(timeout);
  }, [contactCard]);
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [kioskResponse, setKioskResponse] = useState("");
  const lookupCueAudioRef = useRef<Partial<Record<LookupCueLanguage, string>>>({});
  const kioskResponseBufferRef = useRef("");
  const lastQuestionRef = useRef("");
  const followUpRef = useRef<NuboFollowUp | null>(null);
  const [mobileYoutube, setMobileYoutube] = useState<{
    playerUrl: string;
    title: string;
  } | null>(null);
  const { link: bookingPage, handoff: bookingHandoff, resetLink: resetBookingLink } = useGuestBookingPage();

  const guestKeywordNoticeRef = useRef<Promise<{ ok: boolean; sent: boolean; duplicate?: boolean }> | null>(null);

  function notifyGuestKeywords(issue: string, originalSpeech?: string) {
    if (!guestKeywordNoticeRef.current) {
      guestKeywordNoticeRef.current = fetch("/api/notify/guest-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "frontdesk_voice_keywords", issue, eventId: crypto.randomUUID(),
          guestLanguage: getNuboGuestSpeechLanguage() ?? (originalSpeech ? detectNuboGuestSpeechLanguage(originalSpeech) : null),
        }),
        keepalive: true,
      }).then(async (response) => {
        const result = await response.json();
        if (!response.ok || (!result.sent && !result.duplicate)) throw new Error("notification not confirmed");
        return { ok: true, sent: result.sent === true, duplicate: result.duplicate === true };
      }).catch(() => {
        console.warn("[frontdesk] keyword notification failed");
        return { ok: false, sent: false };
      });
    }
    return guestKeywordNoticeRef.current;
  }
  const stopNuboOutput = () => {
    playbackRef.current?.interrupt();
    window.speechSynthesis?.cancel();

    document.querySelectorAll<HTMLAudioElement>("audio").forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });

    notifyNuboVoicePhase(state === "connected" ? "listening" : "idle");
  };

  const enterSilentUntilWake = () => {
    silentUntilWakeRef.current = true;
    window.localStorage.setItem(NUBO_SILENT_STORAGE_KEY, "true");
    stopNuboOutput();
    setTranscript("NUBO已安靜。請說 nubo、嗨 nubo、ha nubo、兄弟或有人嗎重新喚醒。");
  };

  const exitSilentUntilWake = () => {
    silentUntilWakeRef.current = false;
    window.localStorage.removeItem(NUBO_SILENT_STORAGE_KEY);
    setTranscript("NUBO已重新喚醒。");
    notifyNuboVoicePhase("listening");
  };


  useEffect(() => {
    silentUntilWakeRef.current = window.localStorage.getItem(NUBO_SILENT_STORAGE_KEY) === "true";
  }, []);

  useEffect(() => {
    preconnect(`https://${GEMINI_LIVE_HOST}`, { crossOrigin: "anonymous" });
    preloadNuboCallOpening("zh");
    void fetch("/api/gemini-token?warm=1", { cache: "no-store" }).catch(() => {
      // Token prewarm is optional. NUBO can still request a token when connecting.
    });
    for (const language of ["nan", "zh"] as const) {
      void fetch(`/audio/nubo-lookup-${language}.b64`, { cache: "force-cache", priority: "low" })
        .then(async (response) => {
          if (!response.ok) return;
          const pcm = (await response.text()).trim();
          if (/^[A-Za-z0-9+/]+={0,2}$/u.test(pcm)) lookupCueAudioRef.current[language] = pcm;
        })
        .catch(() => undefined);
    }
    return () => callOpeningRef.current?.close();
  }, []);

  useEffect(() => {
    return () => {
      if (youtubeFastRouteTimerRef.current !== null) {
        window.clearTimeout(youtubeFastRouteTimerRef.current);
        youtubeFastRouteTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const stopBackgroundNameListener = startNuboBackgroundNameListener();

    const handleBackgroundTranscript = (event: Event) => {
      const customEvent = event as CustomEvent<{ transcript?: string }>;
      const text = customEvent.detail?.transcript?.trim();

      if (text) {
        if (ecoSleepingRef.current) {
          if (includesVoiceCommand(text, getNuboGuestConfigSnapshot().wakeWords || NUBO_WAKE_WORDS)) {
            wakeFromEco();
          }
          return;
        }

        if (includesVoiceCommand(text, NUBO_SILENCE_WORDS)) {
          enterSilentUntilWake();
          return;
        }

        if (silentUntilWakeRef.current) {
          if (includesVoiceCommand(text, getNuboGuestConfigSnapshot().wakeWords || NUBO_WAKE_WORDS)) {
            exitSilentUntilWake();
          } else {
            stopNuboOutput();
            setTranscript("NUBO靜音待命中。請先說 nubo、兄弟或有人嗎 重新喚醒。");
          }
          return;
        }

        setTranscript(`背景聽到：${text}`);
      }
    };

    window.addEventListener("nubo-background-name-transcript", handleBackgroundTranscript);

    return () => {
      window.removeEventListener("nubo-background-name-transcript", handleBackgroundTranscript);
      stopBackgroundNameListener();
    };
  }, []);

  useEffect(() => {
    const handleNativeWake = () => {
      if (ecoSleepingRef.current) wakeFromEco();
    };
    window.addEventListener("nubo:native-wake", handleNativeWake);
    return () => {
      window.removeEventListener("nubo:native-wake", handleNativeWake);
      stopEcoWakeListener();
    };
  }, []);

  useEffect(() => {
    const syncWakeWithVisibility = () => {
      if (!ecoSleepingRef.current) return;
      if (document.visibilityState === "visible") startEcoWakeListener();
      else stopEcoWakeListener();
    };
    document.addEventListener("visibilitychange", syncWakeWithVisibility);
    return () => document.removeEventListener("visibilitychange", syncWakeWithVisibility);
  }, []);

  useEffect(() => {
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
    else if (state === "connecting") notifyNuboVoicePhase("connecting");
    else if (state === "connected") {
      if (!callOpeningRef.current) notifyNuboVoicePhase("listening");
    }
    else notifyNuboVoicePhase("error");
  }, [state]);

  const clearReconnectTimer = () => {
    if (!reconnectTimerRef.current) return;
    window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  };

  const noteVoiceInteraction = () => {
    lastInteractionAtRef.current = Date.now();
  };

  const stopEcoWakeListener = () => {
    if (ecoRecognitionRestartRef.current) {
      window.clearTimeout(ecoRecognitionRestartRef.current);
      ecoRecognitionRestartRef.current = null;
    }

    const recognition = ecoRecognitionRef.current;
    ecoRecognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.stop(); } catch {}
      try { recognition.abort?.(); } catch {}
    }

    try {
      const nativeBridge = (window as typeof window & {
        NuboNative?: { stopWakeListener?: () => boolean };
      }).NuboNative;
      nativeBridge?.stopWakeListener?.();
    } catch {}
  };

  const wakeFromEco = () => {
    if (!ecoSleepingRef.current) return;
    ecoSleepingRef.current = false;
    stopEcoWakeListener();
    sessionHandleRef.current = null;
    reconnectAttemptsRef.current = 0;
    noteVoiceInteraction();
    setTranscript("NUBO已喚醒，正在恢復語音…");
    void connect(false);
  };

  const startEcoWakeListener = () => {
    stopEcoWakeListener();

    // Tablet PWA keeps a lightweight wake-word recognizer after cloud sleep.
    // Phones retain tap-to-start because system recognition can chime on restart.
    const userAgent = window.navigator.userAgent;
    const isIpadOs =
      /Macintosh/i.test(userAgent) && window.navigator.maxTouchPoints > 1;
    const isMobileBrowser =
      /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || isIpadOs;
    const isTablet = isIpadOs || /iPad|Tablet/i.test(userAgent) ||
      (/Android/i.test(userAgent) && Math.min(window.screen.width, window.screen.height) >= 600);
    if (isMobileBrowser && !isTablet) return;
    if (document.visibilityState !== "visible") return;

    try {
      const nativeBridge = (window as typeof window & {
        NuboNative?: { startWakeListener?: () => boolean };
      }).NuboNative;
      if (nativeBridge?.startWakeListener?.()) return;
    } catch {}

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    ecoRecognitionRef.current = recognition;
    recognition.lang = "zh-TW";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i]?.[0]?.transcript?.trim();
        if (text && includesVoiceCommand(text, getNuboGuestConfigSnapshot().wakeWords || NUBO_WAKE_WORDS)) {
          wakeFromEco();
          return;
        }
      }
    };

    let restartDelayMs = 1_000;
    recognition.onerror = (event: unknown) => {
      const errorName = (event as { error?: string } | null)?.error ?? "";
      if (["not-allowed", "service-not-allowed", "audio-capture"].includes(errorName)) {
        ecoRecognitionRef.current = null;
        setTranscript("待命中；此瀏覽器無法持續監聽喚醒詞，請按「開始對話」。");
        return;
      }
      restartDelayMs = Math.min(restartDelayMs * 2, 10_000);
    };

    recognition.onend = () => {
      if (!ecoSleepingRef.current || ecoRecognitionRef.current !== recognition) return;
      ecoRecognitionRestartRef.current = window.setTimeout(() => {
        if (!ecoSleepingRef.current || ecoRecognitionRef.current !== recognition || document.visibilityState !== "visible") return;
        try { recognition.start(); } catch {
          ecoRecognitionRef.current = null;
          setTranscript("待命中；請按「開始對話」重新啟動語音。");
        }
      }, restartDelayMs);
    };

    try { recognition.start(); } catch {
      ecoRecognitionRef.current = null;
      setTranscript("待命中；請按「開始對話」重新啟動語音。");
    }
  };

  const enterEcoSleep = async () => {
    if (ecoSleepingRef.current || closingRef.current) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    ecoSleepingRef.current = true;
    callActiveRef.current = false;
    microphoneSinkRef.current = null;
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;
    sessionHandleRef.current = null;

    bookingHandoff.invalidate();
    // Detach first so old socket onclose cannot schedule a cloud reconnect.
    socketRef.current = null;
    try { socket.close(1000, "NUBO 30s eco sleep"); } catch {}

    await microphoneRef.current?.stop();
    await playbackRef.current?.close();
    microphoneRef.current = null;
    playbackRef.current = null;

    setState("idle");
    setError("");
    const userAgent = window.navigator.userAgent;
    const isIpadOs =
      /Macintosh/i.test(userAgent) && window.navigator.maxTouchPoints > 1;
    const isMobileBrowser =
      /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || isIpadOs;
    setTranscript(
      isMobileBrowser
        ? "NUBO智慧節約待命中。雲端語音已停止；為避免手機系統提示音，請點『啟動NUBO』重新開始。"
        : "NUBO智慧節約待命中。雲端語音已停止，請說 nubo、嗨 nubo、兄弟或有人嗎喚醒。",
    );
    notifyNuboVoicePhase("idle");
    try {
      const bridge = (window as typeof window & {
        NuboNative?: { endExternalVoiceKeepAlive?: () => boolean };
      }).NuboNative;
      bridge?.endExternalVoiceKeepAlive?.();
    } catch {}
    startEcoWakeListener();
  };

  const acknowledgeQuestion = (text: string) => {
    const trimmed = text.trim();
    if (!shouldAcknowledgeQuestion(trimmed)) return;
    if (lastUserTextRef.current === trimmed) return;
    lastUserTextRef.current = trimmed;
    setTranscript(`正在處理：${trimmed}`);
  };

  const scheduleReconnect = (reason = "即時語音連線已中斷") => {
    if (
      closingRef.current ||
      ecoSleepingRef.current ||
      reconnectTimerRef.current
    ) {
      return;
    }

    // Only a call started in this page may reconnect while the guest is elsewhere.
    if (document.visibilityState === "hidden" && !callActiveRef.current) {
      setState("idle");
      setError("");
      setTranscript(
        "NUBO已進入背景，返回後會自動恢復語音。",
      );
      return;
    }
    const attempt = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempt;

    if (attempt > 5) {
      callActiveRef.current = false;
      microphoneSinkRef.current = null;
      void microphoneRef.current?.stop();
      microphoneRef.current = null;
      setError(`${reason}，已嘗試自動重連5次仍失敗。請重新啟動NUBO或檢查網路/API額度。`);
      setState("error");
      return;
    }

    const delayMs = Math.min(8000, 1000 * 2 ** Math.max(0, attempt - 1));
    setError("");
    setState("connecting");
    setTranscript(`${reason}，NUBO正在自動續接，第${attempt}次重連…`);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void connect(true);
    }, delayMs);
  };

  const disconnect = async () => {
    bookingHandoff.reset();
    resetBookingLink();
    callActiveRef.current = false;
    microphoneSinkRef.current = null;
    setContactCard(null);
    lastQuestionRef.current = "";
    followUpRef.current = null;
    kioskResponseBufferRef.current = "";
    setKioskResponse("");
    callOpeningRef.current?.close();
    callOpeningRef.current = null;
    callToneRef.current = null;
    greetingLanguageRef.current = null;
    setIsRinging(false);
    window.localStorage.removeItem(
      NUBO_AUTO_RESUME_STORAGE_KEY,
    );
    window.localStorage.removeItem(
      NUBO_EXTERNAL_RETURN_STORAGE_KEY,
    );

    closingRef.current = true;
    ecoSleepingRef.current = false;
    stopEcoWakeListener();
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;
    socketRef.current?.close();
    socketRef.current = null;
    await microphoneRef.current?.stop();
    await playbackRef.current?.close();
    microphoneRef.current = null;
    playbackRef.current = null;
    setState("idle");
    setError("");
  };

  const connect = async (isReconnect = false) => {
    clearReconnectTimer();
    ecoSleepingRef.current = false;
    stopEcoWakeListener();
    noteVoiceInteraction();
    setError("");

    window.localStorage.setItem(
      NUBO_AUTO_RESUME_STORAGE_KEY,
      "true",
    );
    if (!isReconnect) {
      startVoiceDiagnostics();
      clearNuboGuestSpeechLanguage();
      sessionHandleRef.current = null;
      reconnectAttemptsRef.current = 0;
      setTranscript("");
      lastQuestionRef.current = "";
      followUpRef.current = null;
      kioskResponseBufferRef.current = "";
      setKioskResponse("");
      if (!isReconnect) guestKeywordNoticeRef.current = null;
      bookingHandoff.reset();
      resetBookingLink();
    }
    setState("connecting");
    closingRef.current = false;
    const playback = new PcmPlaybackQueue();
    playbackRef.current = playback;
    // Prepare the live reply stream in parallel with the local call opening.
    void playback.prepare().catch(() => undefined);

    try {
      const bookingLinkRequest = loadGuestBookingLink();
      const tokenRequestedAt = performance.now();
      const tokenData = await requestJson("/api/gemini-token", { cache: "no-store" });
      if (closingRef.current || playbackRef.current !== playback) return;
      recordVoiceLatency("token", performance.now() - tokenRequestedAt);
      const endpoint =
        `wss://${GEMINI_LIVE_HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained`;
      const socketCreatedAt = performance.now();
      const socket = new WebSocket(`${endpoint}?access_token=${encodeURIComponent(tokenData.token)}`);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      let socketOpenedAt = 0;
      let skipStockAudio = false;
      let activeToolRequests = 0;
      let guestTurn = 0;
      let hasModelAudio = false;
      let lookupCuePlayed = false;
      let replyLanguage = greetingLanguageRef.current ?? getNuboGuestSpeechLanguage() ?? "zh";
      let spokenTurnLanguage: string | null = null;
      let awaitingGuestTranscript = false;
      let interimReplyLanguage: string | null = null;
      let guestActivityStartedAt = 0;
      let guestActivityEndedAt = 0;
      let guestActivityMs: number | null = null;
      let guestTranscriptForClosing = "";
      let replyRepairRequested = false;
      let rawReplyText = "";
      let rejectedReply = false;
      let firstModelAudioAt = 0;
      const unplayedAudio: string[] = [];
      let lastPhotoRequest: RoomPhotoRequest | null = null;
      let configuredBookingLink: string | null = null;
      const isGemini38Live = /^gemini-3\.8-live(?:-extended-thinking)?$/u.test(tokenData.model);
      function sendMicrophoneAudio(data: string) {
        socket.send(JSON.stringify({ realtimeInput: { audio: { data, mimeType: "audio/pcm;rate=16000" } } }));
        recordSocketBuffer(socket.bufferedAmount);
      }
      const liveAudioInput = isGemini38Live ? new NuboLiveAudioInput(
        sendMicrophoneAudio,
        () => socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })),
      ) : null;

      // Fetch the optional booking URL while dialing, off the PMS response path.
      void bookingLinkRequest.then((url) => {
        if (!url || socketRef.current !== socket || closingRef.current) return;
        configuredBookingLink = url;
      });

      function sendToolResponses(functionResponses: (Pick<FunctionCall, "id" | "name"> & {
        response: Record<string, unknown>;
      })[]) {
        if (socketRef.current !== socket || socket.readyState !== WebSocket.OPEN) return;
        const spokenReplyLanguage = SPOKEN_REPLY_LANGUAGES.get(replyLanguage);
        socket.send(JSON.stringify({ toolResponse: {
          functionResponses: functionResponses.map((entry) => ({
            ...entry,
            response: {
              ...entry.response,
              ...(spokenReplyLanguage ? { spokenReplyLanguage } : {}),
              ...(isGemini38Live && entry.name === "notify_arrival_intent" ? { scheduling: "SILENT" } : {}),
            },
          })),
        } }));
      }

      function showBookingSupport(call: FunctionCall, result: unknown) {
        if (socketRef.current !== socket || closingRef.current || socket.readyState !== WebSocket.OPEN) return;
        const lookup = result && typeof result === "object" ? result as Record<string, unknown> : {};
        if (!bookingLookupNeedsContact(call, lookup)) return;
        setContactCard(performance.now());
        return { ...lookup, contactCardShown: true };
      }

      function showRoomPhotos(roomCode?: unknown) {
        if (socketRef.current !== socket || closingRef.current) return { ok: false, shown: false };
        const floor = bookingHandoff.roomPhotoFloor(roomCode);
        if (!lastPhotoRequest || lastPhotoRequest.floor !== floor) {
          lastPhotoRequest = { floor };
          setRoomPhotoRequest(lastPhotoRequest);
        }
        return { ok: true, shown: true, floor };
      }

      async function executeVoiceTool(call: FunctionCall) {
        if (call.name === BOOKING_HANDOFF_TOOL.name) return bookingHandoff.request(call.args ?? {}, configuredBookingLink);
        if (call.name === ROOM_PHOTO_TOOL.name) return showRoomPhotos(call.args?.roomCode);
        if (!call.name || !LOOKUP_CUE_TOOLS.has(call.name)) return executeNuboBrowserTool(call);
        const queryStartedAt = performance.now();
        const language = spokenTurnLanguage === "nan" || spokenTurnLanguage === "zh" ? spokenTurnLanguage : null;
        const cue = language && lookupCueAudioRef.current[language];
        const turn = guestTurn;
        const timer = cue && language && !hasModelAudio && !lookupCuePlayed ? window.setTimeout(() => {
          if (socketRef.current !== socket || closingRef.current || silentUntilWakeRef.current ||
              turn !== guestTurn || spokenTurnLanguage !== language || hasModelAudio || lookupCuePlayed) return;
          lookupCuePlayed = true;
          setKioskResponse(LOOKUP_CUES[language]);
          void playback.enqueue(cue, 24_000).catch(() => undefined);
        }, 550) : undefined;
        try {
          return await executeNuboBrowserTool(call);
        } finally {
          window.clearTimeout(timer);
          if (turn === guestTurn && socketRef.current === socket) {
            recordVoiceLatency("pms", performance.now() - queryStartedAt);
          }
        }
      }

      socket.onopen = () => {
        if (socketRef.current !== socket) return;
        socketOpenedAt = performance.now();
        recordVoiceLatency("webSocket", socketOpenedAt - socketCreatedAt);
        const musicEnabled = getNuboGuestConfigSnapshot().musicEnabled;
        const sessionClockInstruction = formatNuboSessionClockInstruction(tokenData.clock);
        const lookupCueInstruction = lookupCueAudioRef.current.zh || lookupCueAudioRef.current.nan
          ? "【查房與查訂單的進度】條件齊全時直接呼叫 PMS。櫃檯會視需要以本輪已辨識的國語或台語播放簡短等待提示，收到結果後用旅客本輪的語言報重點。"
          : "";
        const sessionInstruction = [NUBO_KIOSK_LANGUAGE_INSTRUCTION, geminiSystemInstruction, sessionClockInstruction, BOOKING_SUPPORT_INSTRUCTION, BOOKING_FLOW, lookupCueInstruction, ROOM_PHOTO_GUIDANCE, GREETING_INSTRUCTION]
          .filter(Boolean).join("\n\n");
        const tools = geminiFunctionDeclarations
          .filter((tool) => musicEnabled || (tool.name !== "open_youtube" && tool.name !== "control_youtube"))
          .map((tool) => isGemini38Live && tool.name === "notify_arrival_intent"
            ? { ...tool, behavior: "NON_BLOCKING" }
            : tool);
        socket.send(
          JSON.stringify({
            setup: {
              model: `models/${tokenData.model}`,
              generationConfig: { responseModalities: ["AUDIO"] },
              systemInstruction: { parts: [{ text: musicEnabled
                ? sessionInstruction
                : `旅客模式暫時不提供音樂或 YouTube 播放。被要求播放時，簡短說明目前未開放；不要開啟音樂、影片或相關網站。\n\n${sessionInstruction}` }] },
              tools: [{ functionDeclarations: [...tools, ROOM_PHOTO_TOOL, BOOKING_HANDOFF_TOOL] }],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              contextWindowCompression: { slidingWindow: {} },
              sessionResumption: sessionHandleRef.current ? { handle: sessionHandleRef.current } : {},
            },
          }),
        );
      };

      socket.onmessage = async (event) => {
        if (socketRef.current !== socket) return;
        try {
          const message = await parseSocketMessage(event.data);
          const activity = message.voiceActivity?.type ?? message.voiceActivity?.voiceActivityType;
          if (activity === "ACTIVITY_START") {
            bookingHandoff.guestTurn();
            liveAudioInput?.startCloudActivity();
            guestTurn += 1;
            hasModelAudio = false;
            lookupCuePlayed = false;
            spokenTurnLanguage = null;
            if (replyLanguage === "nan") replyLanguage = "zh";
            awaitingGuestTranscript = true;
            interimReplyLanguage = null;
            guestActivityStartedAt = performance.now();
            guestActivityEndedAt = 0;
            guestActivityMs = null;
            guestTranscriptForClosing = "";
            replyRepairRequested = false;
            rawReplyText = "";
            rejectedReply = false;
            firstModelAudioAt = 0;
            resetVoiceReplyLatency();
            unplayedAudio.length = 0;
            lastPhotoRequest = null;
          }
          if (activity === "ACTIVITY_END" && guestActivityStartedAt) {
            guestActivityEndedAt = performance.now();
            guestActivityMs = guestActivityEndedAt - guestActivityStartedAt;
            const lastSpeechAt = liveAudioInput?.endCloudActivity();
            if (lastSpeechAt != null) recordVoiceLatency("speechEnd", guestActivityEndedAt - lastSpeechAt);
          }

          const sessionUpdate = message.sessionResumptionUpdate ?? message.session_resumption_update;
          if (sessionUpdate?.resumable && typeof sessionUpdate.newHandle === "string") {
            sessionHandleRef.current = sessionUpdate.newHandle;
          }

          const goAway = message.goAway ?? message.go_away;
          if (goAway && !closingRef.current) {
            setTranscript("語音核心即將更新連線，NUBO正在自動續接…");
            socket.close(1000, "NUBO voice reconnect");
            return;
          }

          if (message.setupComplete) {
            if (socketOpenedAt) recordVoiceLatency("sessionSetup", performance.now() - socketOpenedAt);
            // Dialing and the handshake overlap. Keep the ringtone out of the microphone.
            if (callToneRef.current) await callToneRef.current;
            if (socketRef.current !== socket || closingRef.current || socket.readyState !== WebSocket.OPEN) return;
            if (!callActiveRef.current && document.visibilityState !== "visible") {
              socket.close(1000, "NUBO dial interrupted");
              return;
            }
            noteVoiceInteraction();
            const opening = callOpeningRef.current;
            const greetingLanguage = greetingLanguageRef.current;
            if (opening && greetingLanguage) {
              greetingLanguageRef.current = null;
              const cancel = () => opening.close();
              socket.addEventListener("close", cancel, { once: true });
              try {
                if (!silentUntilWakeRef.current) {
                  setKioskResponse(NUBO_KIOSK_GREETINGS[greetingLanguage]);
                  notifyNuboVoicePhase("speaking");
                  // Show the hang-up control while the recording is playing.
                  setState("connected");
                  await opening.playGreeting();
                }
              } finally {
                socket.removeEventListener("close", cancel);
                opening.close();
              }
            }
            if (socketRef.current !== socket || closingRef.current || socket.readyState !== WebSocket.OPEN) return;
            // Opening the microphone can switch a tablet to its communication audio route.
            // Wait for the recorded welcome's actual end before requesting capture.
            const previousMic = microphoneRef.current;
            const microphone = previousMic?.hasLiveTrack ? previousMic : new MicrophonePcmStream();
            if (previousMic && previousMic !== microphone) void previousMic.stop();
            microphoneRef.current = microphone;
            microphone.setRoomPhotoBrowsing(browsingRoomPhotosRef.current);
            microphoneSinkRef.current = (data, possibleSpeech) => {
              if (socketRef.current !== socket || socket.readyState !== WebSocket.OPEN) return;
              if (liveAudioInput) liveAudioInput.write(data, possibleSpeech);
              else sendMicrophoneAudio(data);
            };
            if (microphone.hasLiveTrack) {
              await microphone.resume();
            } else {
              await microphone.start((data, speech) => microphoneSinkRef.current?.(data, speech));
            }
            if (socketRef.current !== socket || closingRef.current || socket.readyState !== WebSocket.OPEN) {
              if (microphoneRef.current !== microphone || closingRef.current) await microphone.stop();
              return;
            }
            reconnectAttemptsRef.current = 0;
            callActiveRef.current = true;
            if (callOpeningRef.current === opening) callOpeningRef.current = null;
            setState("connected");
            notifyNuboVoicePhase("listening");
          }

          const serverContent = message.serverContent;
          const userText = serverContent?.inputTranscription?.text;
          const modelText = serverContent?.outputTranscription?.text;
          const interim = serverContent?.interimInputTranscription;
          if (awaitingGuestTranscript && typeof interim?.text === "string") {
            const language = interim.languageCode ?? interim.language_code ?? interim.language;
            interimReplyLanguage = detectNuboGuestReplyLanguage(interim.text, language) ?? interimReplyLanguage;
          }
          if (!silentUntilWakeRef.current && typeof userText === "string") {
            if (socketRef.current === socket && !closingRef.current && userText.trim()) {
              const input = serverContent.inputTranscription;
              const language = input?.languageCode ?? input?.language_code ?? input?.language;
              spokenTurnLanguage = detectNuboGuestReplyLanguage(userText, language) ?? interimReplyLanguage ?? spokenTurnLanguage;
              replyLanguage = spokenTurnLanguage ?? replyLanguage;
              awaitingGuestTranscript = false;
              const transcript = userText.trim();
              bookingHandoff.guestTranscript(transcript);
              if (transcript.startsWith(guestTranscriptForClosing)) guestTranscriptForClosing = transcript;
              else if (!guestTranscriptForClosing.endsWith(transcript)) guestTranscriptForClosing += " " + transcript;
              if (reportNuboKioskSpeech(userText, language)) {
                kioskResponseBufferRef.current = "";
                setKioskResponse("");
              }
              const reply = readNuboShortReply(userText);
              followUpRef.current = reply ? { reply, question: lastQuestionRef.current } : null;
            }
            const phrase = userText.replace(/[\s\p{P}]/gu, "");
            const phone = /撥打電話|打電話|電話號碼|電話(?:是)?(?:多少|幾號)|(?:飯店|酒店|旅館|公司|櫃檯)(?:的)?(?:聯絡)?電話|打給(?:飯店|酒店|旅館|公司|櫃檯)|^(?:我要|我想|請幫我)?撥打$/u.test(phrase);
            const qr = /(?:找|聯絡|聯繫|通知|呼叫|請|轉接|叫)(?:一下|你們|館方|飯店|酒店|旅館|現場|值班|真人)*(?:服務人員|飯店人員|工作人員|櫃檯|人員|經理|客服|真人)|(?:飯店|酒店|館方|櫃檯)(?:的)?(?:聯絡方式|LINE)|官方LINE|加(?:入)?(?:你們|飯店|酒店|館方|櫃檯|官方)*(?:LINE|賴)|LINE(?:怎麼加|如何加|可以加|好友|QRCode|二維碼|帳號)|(?:加|加入)(?:好友|官方帳號)/iu.test(phrase);
            if (qr || phone) setContactCard(performance.now());
            const keywords = new Set(phrase.match(/訂房|住宿|入住|休息|退房/gu) ?? []);
            const arrivalIntent = classifyNuboArrivalIntent(userText);
            if (arrivalIntent) keywords.add(ARRIVAL_KEYWORDS[arrivalIntent]);
            if (/チェックアウト|체크아웃|trả phòng|\bcheck[ -]?out\b/iu.test(userText)) keywords.add("退房");
            if (/休憩利用|ショートステイ|대실|thuê phòng theo giờ|\b(?:hourly room|day use)\b/iu.test(userText)) keywords.add("休息");
            if (TAIWANESE_REST_REQUEST.test(phrase)) keywords.add("休息");
            if (TAIWANESE_OVERNIGHT_REQUEST.test(phrase)) keywords.add("住宿");
            const taiwaneseBooking = TAIWANESE_BOOKING_REQUEST.test(phrase);
            if (taiwaneseBooking) keywords.add("訂房");
            if (keywords.size) void notifyGuestKeywords([...keywords].join("／"));
            if (asksForRoomPhotos(userText)) showRoomPhotos();
          }
          if (!silentUntilWakeRef.current && (activity === "ACTIVITY_END" || serverContent?.inputTranscription?.finished ||
              (typeof modelText === "string" && modelText.trim()))) bookingHandoff.finishGuestSpeech();
          const quietReply = !hasModelAudio && activeToolRequests === 0 &&
            isNuboConversationCloser(guestTranscriptForClosing, lastQuestionRef.current, guestActivityMs);
          if (quietReply && (activity === "ACTIVITY_END" || typeof userText === "string")) {
            lastQuestionRef.current = "";
            notifyNuboVoicePhase("listening");
          }
          const completed = !!(serverContent?.turnComplete || serverContent?.turn_complete);
          const generated = !!(serverContent?.generationComplete || serverContent?.generation_complete);
          const interrupted = !!serverContent?.interrupted;
          const hasInterimLanguage = guestActivityMs !== null && interimReplyLanguage !== null;
          if (awaitingGuestTranscript && guestActivityMs !== null && interimReplyLanguage) replyLanguage = interimReplyLanguage;
          const replyLanguageReady = !awaitingGuestTranscript || hasInterimLanguage || generated || completed;
          if (typeof modelText === "string" && modelText.trim()) {
            rawReplyText = modelText.startsWith(rawReplyText) ? modelText : rawReplyText + modelText;
          }
          const replyPrefix = rawReplyText.trim().toLowerCase();
          const pauseReply = replyPrefix.startsWith("<") &&
            (NO_SPEECH_MARKER.startsWith(replyPrefix) || replyPrefix.startsWith(NO_SPEECH_MARKER));
          if (pauseReply) unplayedAudio.length = 0;
          const parts = serverContent?.modelTurn?.parts;
          if (!pauseReply && !firstModelAudioAt && Array.isArray(parts) &&
              parts.some((part) => part?.inlineData?.data && !part?.thought)) {
            firstModelAudioAt = performance.now();
            if (guestActivityEndedAt) recordVoiceLatency("modelAudio", firstModelAudioAt - guestActivityEndedAt);
          }
          // The audio and its transcript can arrive in separate frames. Hold
          // audio until we have a reply language and its first transcript.
          if (Array.isArray(parts) && !rejectedReply && !interrupted && !quietReply && !pauseReply) {
            for (const part of parts) {
              if (part?.inlineData?.data && unplayedAudio.length < 96) unplayedAudio.push(part.inlineData.data);
            }
          }
          const guardedLanguage = replyLanguage === "en" || replyLanguage === "zh" ? GUARDED_REPLY_LANGUAGES[replyLanguage] : null;
          const output = serverContent?.outputTranscription;
          const replyCheck = replyLanguage === "en"
            ? checkNuboEnglishReply(rawReplyText, completed || generated)
            : replyLanguage === "zh"
              ? checkNuboMandarinReply(rawReplyText, completed || generated,
                output?.languageCode ?? output?.language_code ?? output?.language)
              : "match";
          if (replyLanguageReady && replyCheck === "mismatch" && !rejectedReply) {
            rejectedReply = true;
            unplayedAudio.length = 0;
            playback.interrupt();
            kioskResponseBufferRef.current = "";
            setKioskResponse("");
          }
          const canPlayReply = !quietReply && !pauseReply && !interrupted && !rejectedReply &&
            replyCheck === "match" && replyLanguageReady;
          let visibleModelText = "";
          if (canPlayReply && rawReplyText && (typeof modelText === "string" || !kioskResponseBufferRef.current)) {
            const previous = kioskResponseBufferRef.current;
            const response = rawReplyText;
            kioskResponseBufferRef.current = response;
            const filtered = stripNuboStockClosing(response);
            const previousAnswer = stripNuboStockClosing(previous).text.replace(/[，,；;]+$/u, "").trim();
            // Transcripts usually precede their audio. Discard standalone or
            // separately streamed boilerplate while preserving queued answers.
            if (filtered.removed && (!filtered.text || filtered.text === previousAnswer)) {
              skipStockAudio = true;
            }
            visibleModelText = filtered.text;
            if (visibleModelText) setKioskResponse(visibleModelText);
          }
          if (!interrupted && !pauseReply && typeof modelText === "string") bookingHandoff.replyTranscript(modelText);
          const availableAudio = canPlayReply ? unplayedAudio.splice(0) : [];
          const needsLanguageRepair = guardedLanguage && !quietReply && !pauseReply && !interrupted &&
            (rejectedReply || (replyCheck !== "match" && (unplayedAudio.length > 0 || rawReplyText.trim().length > 0)));
          const playModelAudio = !skipStockAudio && !silentUntilWakeRef.current;
          if (completed || interrupted) {
            if (!quietReply && kioskResponseBufferRef.current.trim()) {
              lastQuestionRef.current = latestNuboQuestion(kioskResponseBufferRef.current);
            }
            kioskResponseBufferRef.current = "";
            skipStockAudio = false;
            rawReplyText = "";
            rejectedReply = false;
            unplayedAudio.length = 0;
          }

          if (interrupted) {
            bookingHandoff.interrupt();
            recordServerInterruption();
            playbackRef.current?.interrupt();
            notifyNuboVoicePhase("listening");
          }
          if (pauseReply && (completed || generated) && activeToolRequests === 0) notifyNuboVoicePhase("listening");
          if (playModelAudio) {
            const turn = guestTurn;
            for (const audio of availableAudio) {
              if (turn !== guestTurn || socketRef.current !== socket) break;
              if (!hasModelAudio && firstModelAudioAt) {
                recordVoiceLatency("playbackBuffer", performance.now() - firstModelAudioAt);
              }
              hasModelAudio = true;
              noteVoiceInteraction();
              recordIncomingAudioChunk();
              await playbackRef.current?.enqueue(audio, 24_000);
              if (turn === guestTurn && socketRef.current === socket) bookingHandoff.spoken();
            }
          }
          if (completed && needsLanguageRepair && serverContent?.interactionStatus !== "IN_PROGRESS" && activeToolRequests === 0 &&
              socket.readyState === WebSocket.OPEN && !silentUntilWakeRef.current) {
            if (!replyRepairRequested) {
              replyRepairRequested = true;
              notifyNuboVoicePhase("thinking");
              socket.send(JSON.stringify({ realtimeInput: { text:
                `Answer the same guest turn again entirely in ${guardedLanguage.name}. Keep the answer and verified tool results. Do not call tools, repeat actions, or mention the correction. Speak only the corrected answer.`,
              } }));
            } else {
              setKioskResponse(guardedLanguage.repeat);
              notifyNuboVoicePhase("listening");
            }
          }

          if (completed && !interrupted && !needsLanguageRepair && !quietReply && !pauseReply) bookingHandoff.endReply();
          if (serverContent?.turnComplete) finishIncomingAudioTurn();
          if (visibleModelText) {
            noteVoiceInteraction();
            setTranscript(visibleModelText);
          } else if (typeof userText === "string" && userText.trim()) {
            noteVoiceInteraction();
            const trimmedUserText = userText.trim();

            if (quietReply) return;

            recordNuboQuestion(
              trimmedUserText,
            );

            const fastYouTubeQuery = getNuboGuestConfigSnapshot().musicEnabled
              ? extractYouTubeFastRouteQuery(trimmedUserText)
              : null;

            if (fastYouTubeQuery) {
              if (youtubeFastRouteTimerRef.current !== null) {
                window.clearTimeout(youtubeFastRouteTimerRef.current);
              }

              // Live transcription can arrive in short revisions. A tiny debounce lets
              // the final song title settle while still beating the model tool-call path.
              youtubeFastRouteTimerRef.current = window.setTimeout(() => {
                youtubeFastRouteTimerRef.current = null;
                const startedAt = Date.now();
                youtubeFastRouteRef.current = {
                  query: fastYouTubeQuery,
                  at: startedAt,
                };

                setTranscript(`正在切換歌曲：${fastYouTubeQuery}…`);

                void executeNuboBrowserTool({
                  name: "open_youtube",
                  args: {
                    query: fastYouTubeQuery,
                    service: "youtube",
                  },
                })
                  .then((result) => {
                    const current = youtubeFastRouteRef.current;
                    if (current?.at === startedAt) {
                      current.result = result;
                    }
                    setTranscript(`已送出換歌：${fastYouTubeQuery}`);
                    notifyNuboVoicePhase("listening");
                  })
                  .catch((cause) => {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "YouTube換歌失敗",
                    );
                  });
              }, 180);
            }

            // NUBO_TRAVEL_BACKGROUND_PREFETCH
            if (
              /(日本|東京|大阪|京都|沖繩|北海道|機票|航班|旅遊|旅行|行程)/.test(
                trimmedUserText,
              ) &&
              travelPrefetchTextRef.current !==
                trimmedUserText
            ) {
              travelPrefetchTextRef.current =
                trimmedUserText;

              void fetch(
                "/api/travel/prefetch",
                {
                  method: "POST",
                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                  body: JSON.stringify({
                    query: trimmedUserText,
                  }),
                },
              ).catch(() => {
                // 背景預抓失敗不阻塞即時對話。
              });
            }

            if (isNuboNameAlertText(trimmedUserText)) {
              setTranscript(`背景聽到：${trimmedUserText}`);
              void sendTranscriptToNameAlert(trimmedUserText);
              notifyNuboVoicePhase("idle");
              return;
            }
notifyNuboVoicePhase("thinking");

void sendTranscriptToNameAlert(trimmedUserText);

acknowledgeQuestion(trimmedUserText);
setTranscript((current) => current || `你：${trimmedUserText}`);
void runLocalVoiceCommand(trimmedUserText)              .then((command) => {
                if (command.handled) {
                  setTranscript(`已執行本機指令：${trimmedUserText}`);
                }
              })
              .catch((cause) => {
                setError(cause instanceof Error ? cause.message : "本機指令失敗");
              });
          }

          const calls = message.toolCall?.functionCalls;
          if (Array.isArray(calls) && calls.length > 0) {
            if (quietReply || replyRepairRequested) {
              sendToolResponses(calls.map((call: FunctionCall) => ({
                id: call.id,
                name: call.name,
                response: { result: { ok: false, code: "no_new_guest_request" } },
              })));
              return;
            }
            activeToolRequests += 1;
            notifyNuboVoicePhase("thinking");
            const functionResponses = [];
            for (const call of calls as FunctionCall[]) {
              try {
                const correction = correctNuboGuestFollowUp(call.name, followUpRef.current);
                if (correction) {
                  functionResponses.push({ id: call.id, name: call.name, response: { result: correction } });
                  continue;
                }
                if (call.name === "research_now") {
                }

                const toolQuery =
                  call.name === "open_youtube"
                    ? String(call.args?.query ?? "").trim()
                    : "";
                const recentFastRoute = youtubeFastRouteRef.current;
                const fastRouteDuplicate = Boolean(
                  call.name === "open_youtube" &&
                    recentFastRoute &&
                    Date.now() - recentFastRoute.at <
                      NUBO_YOUTUBE_FAST_ROUTE_DEDUPE_MS &&
                    sameYouTubeFastQuery(toolQuery, recentFastRoute.query),
                );

                // The model may still emit open_youtube after the local fast route already
                // switched the song. Treat that tool call as acknowledged, not a second launch.
                const purpose = inventoryPurpose(call.name);
                const revision = purpose || call.name === "pms_lookup_reservation" ? bookingHandoff.invalidate() : 0;
                const result = fastRouteDuplicate
                  ? recentFastRoute?.result ?? {
                      ok: true,
                      alreadyHandled: true,
                      route: "local-youtube-fast-route-v33",
                      query: recentFastRoute?.query ?? toolQuery,
                    }
                  : call.name === "notify_arrival_intent"
                    ? (() => {
                        const intent = call.args?.intent === "booking" || call.args?.intent === "lodging" ? call.args.intent : "checkin";
                        const speech = typeof call.args?.transcript === "string" ? call.args.transcript : undefined;
                        void notifyGuestKeywords(ARRIVAL_KEYWORDS[intent], speech);
                        return { ok: true, notificationStatus: "pending", sent: false };
                      })()
                    : await executeVoiceTool(call);

                // NUBO_MOBILE_APP_AUTO_OPEN_V1
                const mobileAction =
                  result &&
                  typeof result === "object"
                    ? (
                        result as {
                          mobileUrl?: unknown;
                          mobileLabel?: unknown;
                          autoOpen?: unknown;
                          playerUrl?: unknown;
                          title?: unknown;
                        }
                      )
                    : null;

                if (
                  mobileAction &&
                  typeof mobileAction.mobileUrl ===
                    "string"
                ) {
                  const targetUrl =
                    mobileAction.mobileUrl;

                  const label =
                    typeof mobileAction.mobileLabel ===
                    "string"
                      ? mobileAction.mobileLabel
                      : call.name ===
                          "open_youtube"
                        ? "YouTube"
                        : "手機工具";

                  setMobileYoutube({
                    playerUrl: targetUrl,
                    title: label,
                  });

                  setTranscript(
                    `正在開啟${label}…`,
                  );

                  if (
                    mobileAction.autoOpen !==
                    false
                  ) {
                    window.localStorage.setItem(
                      NUBO_AUTO_RESUME_STORAGE_KEY,
                      "true",
                    );

                    window.localStorage.setItem(
                      NUBO_EXTERNAL_RETURN_STORAGE_KEY,
                      "true",
                    );

                    window.setTimeout(() => {
                      try {
                        /*
                         * 優先保留NUBO分頁，
                         * 另外開啟LINE、YouTube或地圖。
                         */
                        const opened =
                          window.open(
                            targetUrl,
                            "nubo_mobile_external",
                          );

                        if (opened) {
                          try {
                            opened.opener = null;
                            opened.focus();
                          } catch {
                            // App或跨網域視窗不可控制時忽略。
                          }

                          return;
                        }

                        /*
                         * 手機阻擋新視窗時，
                         * 才使用目前頁面開啟。
                         * 返回時仍會自動恢復NUBO。
                         */
                        window.location.assign(
                          targetUrl,
                        );
                      } catch {
                        setTranscript(
                          `請按下方按鈕開啟${label}。`,
                        );
                      }
                    }, 250);
                  }
                } else if (
                  call.name ===
                    "open_youtube" &&
                  result &&
                  typeof result ===
                    "object" &&
                  "playerUrl" in result
                ) {
                  const youtubeResult =
                    result as {
                      playerUrl?: unknown;
                      title?: unknown;
                    };

                  if (
                    typeof youtubeResult.playerUrl ===
                    "string"
                  ) {
                    setMobileYoutube({
                      playerUrl:
                        youtubeResult.playerUrl,
                      title:
                        typeof youtubeResult.title ===
                        "string"
                          ? youtubeResult.title
                          : "YouTube",
                    });

                    setTranscript(
                      "已找到影片，請按下方按鈕在手機播放。",
                    );
                  }
                }

                const supportResult = showBookingSupport(call, result);
                let responseResult: unknown = supportResult ?? result;
                if (call.name === "pms_lookup_reservation" && socketRef.current === socket && !closingRef.current && result && typeof result === "object") {
                  bookingHandoff.rememberReservation(revision, result as Record<string, unknown>);
                }
                if (purpose && socketRef.current === socket && !closingRef.current && responseResult && typeof responseResult === "object") {
                  responseResult = bookingHandoff.inventory(revision, purpose, call.args ?? {}, responseResult as Record<string, unknown>, configuredBookingLink);
                }
                functionResponses.push({
                  id: call.id,
                  name: call.name,
                  response: { result: responseResult },
                });
              } catch (cause) {
                const error = { error: cause instanceof Error ? cause.message : "工具執行失敗" };
                const supportResult = showBookingSupport(call, error);
                functionResponses.push({
                  id: call.id,
                  name: call.name,
                  response: supportResult ? { result: supportResult } : error,
                });
              }
            }
            activeToolRequests -= 1;
            sendToolResponses(functionResponses);
          }
        } catch (cause) {
          console.error("NUBO voice message decode failed", cause, event.data);
          setError("即時語音訊息或工具處理失敗，NUBO將嘗試自動重連。");
          socket.close(1011, "NUBO voice handling failed");
        }
      };

      socket.onerror = () => {
        if (socketRef.current !== socket) return;
        setTranscript("即時語音連線異常，NUBO準備自動重連…");
      };

      socket.onclose = (event) => {
        if (socketRef.current !== socket) return;
        bookingHandoff.invalidate();
        console.warn("NUBO Gemini Live socket closed", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        const terminal = [1002, 1003, 1007, 1008].includes(event.code);
        const keepMic = !terminal && !closingRef.current && callActiveRef.current &&
          document.visibilityState === "hidden" && microphoneRef.current?.hasLiveTrack;
        microphoneSinkRef.current = null;
        if (!keepMic) {
          void microphoneRef.current?.stop();
          microphoneRef.current = null;
        }
        void playbackRef.current?.close();
        playbackRef.current = null;
        socketRef.current = null;
        if (!closingRef.current) {
          recordUnexpectedDisconnect();
          // The previous generic message concealed Google's close code/reason.
          // Never include tokens, request URLs or credentials in the UI.
          const detail = event.reason?.trim().slice(0, 180);
          const reason = `Gemini Live 連線中斷（代碼 ${event.code}${detail ? `：${detail}` : ""}）`;
          if (terminal) {
            callActiveRef.current = false;
            // Protocol, unsupported payload and policy/quota failures are not
            // repaired by repeatedly reconnecting with the same settings.
            setError(`${reason}。請檢查 Gemini Live 模型、API 權限與配額。`);
            setState("error");
            setTranscript("即時語音設定或存取限制，已停止無效重連。");
          } else {
            scheduleReconnect(reason);
          }
        }
      };
    } catch (cause) {
      if (closingRef.current || playbackRef.current !== playback) return;
      callOpeningRef.current?.close();
      callOpeningRef.current = null;
      setIsRinging(false);
      playbackRef.current = null;
      void playback.close();
      const message = cause instanceof Error ? cause.message : "即時語音啟動失敗";
      if (isReconnect && !closingRef.current) {
        scheduleReconnect(message);
      } else {
        callActiveRef.current = false;
        setError(message);
        setState("error");
      }
    }
  };

  useEffect(() => {
    ecoTimerRef.current = window.setInterval(() => {
      if (ecoSleepingRef.current || closingRef.current || browsingRoomPhotosRef.current) return;
      if (document.visibilityState === "hidden" && callActiveRef.current) return;
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastInteractionAtRef.current >= (getNuboGuestConfigSnapshot().idleSeconds * 1000 || NUBO_ECO_IDLE_MS)) {
        void enterEcoSleep();
      }
    }, 1000);

    return () => {
      if (ecoTimerRef.current) {
        window.clearInterval(ecoTimerRef.current);
        ecoTimerRef.current = null;
      }
    };
  }, []);

  /*
   * 手機從LINE、YouTube、地圖或其他App
   * 回到NUBO時，自動重建語音連線。
   */
  useEffect(() => {
    let resumeInProgress = false;

    const resumeNuboAfterForeground =
      () => {
        if (
          document.visibilityState !==
          "visible"
        ) {
          return;
        }

        if (
          window.localStorage.getItem(
            NUBO_AUTO_RESUME_STORAGE_KEY,
          ) !== "true"
        ) {
          return;
        }

        if (
          silentUntilWakeRef.current ||
          ecoSleepingRef.current ||
          resumeInProgress ||
          callToneRef.current
        ) {
          return;
        }

        const returningFromExternal =
          window.localStorage.getItem(
            NUBO_EXTERNAL_RETURN_STORAGE_KEY,
          ) === "true";

        const socket =
          socketRef.current;

        const socketOpen =
          socket?.readyState ===
          WebSocket.OPEN;

        const socketConnecting =
          socket?.readyState ===
          WebSocket.CONNECTING;

        /*
         * 正常連線且不是從外部App返回時，
         * 不需要重新建立連線。
         */
        if (
          !returningFromExternal &&
          (socketOpen ||
            socketConnecting)
        ) {
          return;
        }

        resumeInProgress = true;

        window.localStorage.removeItem(
          NUBO_EXTERNAL_RETURN_STORAGE_KEY,
        );

        setError("");
        setTranscript(
          returningFromExternal
            ? "已返回NUBO，正在自動恢復語音…"
            : "NUBO正在自動恢復語音…",
        );

        if (
          foregroundResumeTimerRef.current
        ) {
          window.clearTimeout(
            foregroundResumeTimerRef.current,
          );
        }

        foregroundResumeTimerRef.current =
          window.setTimeout(() => {
            const activeSocket =
              socketRef.current;

            if (
              activeSocket?.readyState ===
              WebSocket.OPEN
            ) {
              // V28 PiP keeps the existing Gemini session alive while YouTube /
              // LINE / Maps is foreground. Reuse it instead of throwing it away.
              void microphoneRef.current?.resume();
              setState("connected");
              setTranscript(
                returningFromExternal
                  ? "已返回NUBO，語音持續連線。"
                  : "NUBO語音已恢復。",
              );
            } else if (
              activeSocket?.readyState !==
              WebSocket.CONNECTING
            ) {
              void connect(true);
            }

            window.setTimeout(() => {
              resumeInProgress = false;
            }, 1800);
          }, 350);
      };

    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          if (callActiveRef.current) noteVoiceInteraction();
          resumeNuboAfterForeground();
        }
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    window.addEventListener(
      "focus",
      resumeNuboAfterForeground,
    );

    window.addEventListener(
      "pageshow",
      resumeNuboAfterForeground,
    );

    const initialResumeTimer =
      window.setTimeout(
        resumeNuboAfterForeground,
        700,
      );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );

      window.removeEventListener(
        "focus",
        resumeNuboAfterForeground,
      );

      window.removeEventListener(
        "pageshow",
        resumeNuboAfterForeground,
      );

      window.clearTimeout(
        initialResumeTimer,
      );

      if (
        foregroundResumeTimerRef.current
      ) {
        window.clearTimeout(
          foregroundResumeTimerRef.current,
        );
        foregroundResumeTimerRef.current =
          null;
      }
    };
  }, []);

  const startWithCallTones = async (language: NuboKioskLanguage) => {
    const socket = socketRef.current;
    if (callToneRef.current || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    callActiveRef.current = true;
    greetingLanguageRef.current = language;
    callOpeningRef.current?.close();
    const opening = new NuboCallOpening(language);
    callOpeningRef.current = opening;
    clearReconnectTimer();
    setIsRinging(true);
    const tone = opening.ring.then(() => {
      if (callOpeningRef.current === opening) setIsRinging(false);
    });
    callToneRef.current = tone;
    try {
      await Promise.all([tone, connect(false)]);
    } finally {
      if (callToneRef.current === tone) callToneRef.current = null;
    }
  };

  return (
    <NuboConciergeKiosk
      state={isRinging ? "ringing" : state}
      transcript={kioskResponse}
      error={error}
      bookingUrl={bookingPage.url}
      bookingBlocked={bookingPage.blocked}
      onBookingClick={() => bookingHandoff.manual(bookingPage.url)}
      onPhotoBrowsingChange={onPhotoBrowsingChange}
      roomPhotoRequest={roomPhotoRequest}
      getRoomPhotoFloor={() => bookingHandoff.roomPhotoFloor()}
      contact={{
        visible: contactCard !== null,
        open: () => setContactCard(performance.now()),
        close: () => setContactCard(null),
      }}
      onToggleCall={(language) => void (state === "connected" ? disconnect() : startWithCallTones(language))}
    >
      {getNuboGuestConfigSnapshot().musicEnabled && mobileYoutube ? (
        <a className="primary mobile-youtube-action" href={mobileYoutube.playerUrl}
          target="_blank" rel="noreferrer" onClick={() => setMobileYoutube(null)}>
          {mobileYoutube.title} ↗
        </a>
      ) : null}
    </NuboConciergeKiosk>
  );
}
