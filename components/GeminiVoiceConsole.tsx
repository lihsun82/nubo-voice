"use client";

import { useEffect, useRef, useState } from "react";
import { sendTranscriptToNameAlert } from "@/lib/nubo-name-alert-client";
import { isNuboNameAlertText, startNuboBackgroundNameListener } from "@/lib/nubo-background-name-listener";
import { MicrophonePcmStream, PcmPlaybackQueue } from "@/lib/browser-audio";
import {
  executeNuboBrowserTool,
  geminiFunctionDeclarations,
  geminiSystemInstruction,
  type FunctionCall,
} from "@/lib/browser-nubo-tools-line";
import { runLocalVoiceCommand } from "@/lib/local-voice-commands";
import { notifyNuboVoicePhase } from "@/lib/nubo-voice-phase";
import { NuboEnergyOrb } from "@/components/NuboEnergyOrb";
import { NuboQuestionHistory, recordNuboQuestion } from "@/components/NuboQuestionHistory";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

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

export function GeminiVoiceConsole() {
  const socketRef = useRef<WebSocket | null>(null);
  const microphoneRef = useRef<MicrophonePcmStream | null>(null);
  const playbackRef = useRef<PcmPlaybackQueue | null>(null);
  const closingRef = useRef(false);
  const phaseTimerRef = useRef<number | null>(null);
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
  const ecoRecognitionRef = useRef<any>(null);
  const ecoRecognitionRestartRef = useRef<number | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [mobileYoutube, setMobileYoutube] = useState<{
    playerUrl: string;
    title: string;
  } | null>(null);

  const stopNuboOutput = () => {
    playbackRef.current?.interrupt();
    window.speechSynthesis?.cancel();

    document.querySelectorAll<HTMLAudioElement>("audio").forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });

    if (phaseTimerRef.current) {
      window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }

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
    void fetch("/api/gemini-token?warm=1", { cache: "no-store" }).catch(() => {
      // Token prewarm is optional. NUBO can still request a token when connecting.
    });
  }, []);

  useEffect(() => {
    const stopBackgroundNameListener = startNuboBackgroundNameListener();

    const handleBackgroundTranscript = (event: Event) => {
      const customEvent = event as CustomEvent<{ transcript?: string }>;
      const text = customEvent.detail?.transcript?.trim();

      if (text) {
        if (ecoSleepingRef.current) {
          if (includesVoiceCommand(text, NUBO_WAKE_WORDS)) {
            wakeFromEco();
          }
          return;
        }

        if (includesVoiceCommand(text, NUBO_SILENCE_WORDS)) {
          enterSilentUntilWake();
          return;
        }

        if (silentUntilWakeRef.current) {
          if (includesVoiceCommand(text, NUBO_WAKE_WORDS)) {
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
    if (state === "idle") notifyNuboVoicePhase("idle");
    else if (state === "connecting") notifyNuboVoicePhase("connecting");
    else if (state === "connected") notifyNuboVoicePhase("listening");
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
        if (text && includesVoiceCommand(text, NUBO_WAKE_WORDS)) {
          wakeFromEco();
          return;
        }
      }
    };

    recognition.onerror = () => {
      // System recognition may temporarily fail; onend retries while eco sleeping.
    };

    recognition.onend = () => {
      if (!ecoSleepingRef.current || ecoRecognitionRef.current !== recognition) return;
      ecoRecognitionRestartRef.current = window.setTimeout(() => {
        if (!ecoSleepingRef.current || ecoRecognitionRef.current !== recognition) return;
        try { recognition.start(); } catch {}
      }, 700);
    };

    try { recognition.start(); } catch {}
  };

  const enterEcoSleep = async () => {
    if (ecoSleepingRef.current || closingRef.current) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    ecoSleepingRef.current = true;
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;
    sessionHandleRef.current = null;

    // Detach first so old socket onclose cannot schedule a cloud reconnect.
    socketRef.current = null;
    try { socket.close(1000, "NUBO 30s eco sleep"); } catch {}

    await microphoneRef.current?.stop();
    await playbackRef.current?.close();
    microphoneRef.current = null;
    playbackRef.current = null;

    setState("idle");
    setError("");
    setTranscript(
      "NUBO智慧節約待命中。雲端語音已停止，請說 nubo、嗨 nubo、兄弟或有人嗎喚醒。",
    );
    notifyNuboVoicePhase("idle");
    startEcoWakeListener();
  };

  const markSpeaking = () => {
    notifyNuboVoicePhase("speaking");
    if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
    phaseTimerRef.current = window.setTimeout(() => {
      notifyNuboVoicePhase("listening");
    }, 1500);
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

    /*
     * 手機切到LINE、YouTube或地圖時，
     * 瀏覽器可能暫停網路與麥克風。
     * 背景期間不消耗重連次數，
     * 回到NUBO後再自動恢復。
     */
    if (
      typeof document !== "undefined" &&
      document.visibilityState ===
        "hidden"
    ) {
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
      sessionHandleRef.current = null;
      reconnectAttemptsRef.current = 0;
      setTranscript("");
    }
    setState("connecting");
    closingRef.current = false;

    try {
      const tokenData = await requestJson("/api/gemini-token", { cache: "no-store" });
      const endpoint =
        "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
      const socket = new WebSocket(`${endpoint}?access_token=${encodeURIComponent(tokenData.token)}`);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      playbackRef.current = new PcmPlaybackQueue();

      socket.onopen = () => {
        if (socketRef.current !== socket) return;
        socket.send(
          JSON.stringify({
            setup: {
              model: `models/${tokenData.model}`,
              generationConfig: { responseModalities: ["AUDIO"] },
              systemInstruction: { parts: [{ text: geminiSystemInstruction }] },
              tools: [{ functionDeclarations: geminiFunctionDeclarations }],
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
            reconnectAttemptsRef.current = 0;
            noteVoiceInteraction();
            const microphone = new MicrophonePcmStream();
            microphoneRef.current = microphone;
            await microphone.start((data) => {
              if (socket.readyState !== WebSocket.OPEN) return;
              socket.send(
                JSON.stringify({
                  realtimeInput: {
                    audio: { data, mimeType: "audio/pcm;rate=16000" },
                  },
                }),
              );
            });
            setState("connected");
          }

          const serverContent = message.serverContent;
          if (serverContent?.interrupted) {
            playbackRef.current?.interrupt();
            notifyNuboVoicePhase("listening");
          }
          const parts = serverContent?.modelTurn?.parts;
          if (!silentUntilWakeRef.current && Array.isArray(parts)) {
            for (const part of parts) {
              if (part?.inlineData?.data) {
                noteVoiceInteraction();
                markSpeaking();
                await playbackRef.current?.enqueue(part.inlineData.data, 24000);
              }
            }
          }

          const userText = serverContent?.inputTranscription?.text;
          const modelText = serverContent?.outputTranscription?.text;
          if (typeof modelText === "string" && modelText.trim()) {
            noteVoiceInteraction();
            setTranscript(modelText.trim());
          } else if (typeof userText === "string" && userText.trim()) {
            noteVoiceInteraction();
            const trimmedUserText = userText.trim();

            recordNuboQuestion(
              trimmedUserText,
            );

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
            notifyNuboVoicePhase("thinking");
            const functionResponses = [];
            for (const call of calls as FunctionCall[]) {
              try {
                if (call.name === "research_now") {
                }
                const result = await executeNuboBrowserTool(call);

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

                functionResponses.push({
                  id: call.id,
                  name: call.name,
                  response: { result },
                });
              } catch (cause) {
                functionResponses.push({
                  id: call.id,
                  name: call.name,
                  response: {
                    error: cause instanceof Error ? cause.message : "工具執行失敗",
                  },
                });
              }
            }
            socket.send(JSON.stringify({ toolResponse: { functionResponses } }));
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
        console.warn("NUBO Gemini Live socket closed", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        void microphoneRef.current?.stop();
        void playbackRef.current?.close();
        microphoneRef.current = null;
        playbackRef.current = null;
        socketRef.current = null;
        if (!closingRef.current) {
          scheduleReconnect("即時語音連線被重置");
        }
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "即時語音啟動失敗";
      if (isReconnect && !closingRef.current) {
        scheduleReconnect(message);
      } else {
        setError(message);
        setState("error");
      }
    }
  };

  useEffect(() => {
    ecoTimerRef.current = window.setInterval(() => {
      if (ecoSleepingRef.current || closingRef.current) return;
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastInteractionAtRef.current >= NUBO_ECO_IDLE_MS) {
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
          resumeInProgress
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
              /*
               * 即使WebSocket表面仍開啟，
               * 手機背景期間的麥克風與音訊可能已暫停。
               * 關閉後交由既有重連機制建立乾淨連線。
               */
              activeSocket.close(
                1012,
                "NUBO foreground resume",
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

  const stateLabel = {
    idle: [
      "NUBO待命",
      "智慧服務已就緒",
    ],
    connecting: [
      "NUBO正在連線",
      "正在啟動語音服務",
    ],
    connected: [
      "NUBO正在聆聽",
      "行動控制與自動化服務已啟用",
    ],
    error: [
      "NUBO尚未連線",
      "系統已切換為安全待命狀態",
    ],
  }[state];

  return (
    <section className="console" aria-live="polite">
      <div className="orb-wrap">
        <NuboEnergyOrb />
      </div>
      <div className="status">
        <strong>{stateLabel[0]}</strong>
        <span>{stateLabel[1]}</span>
      </div>
      <div className="actions">
        <button className="primary" onClick={() => void connect()} disabled={state === "connecting" || state === "connected"}>
          {state === "connecting" ? "連線中…" : "啟動NUBO"}
        </button>
        <button className="secondary" onClick={() => void disconnect()} disabled={state === "idle"}>
          結束對話
        </button>
      </div>
      {mobileYoutube ? (
        <a
          className="primary mobile-youtube-action"
          href={mobileYoutube.playerUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => setMobileYoutube(null)}
        >
          {"開啟："}
          {mobileYoutube.title}
        </a>
      ) : null}
      {transcript ? <div className="voice-transcript">{transcript}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <NuboQuestionHistory />
      <div className="capabilities">
        <div className="capability"><b>應用程式控制</b><small>開啟LINE與固定白名單Windows應用程式。</small></div>
        <div className="capability"><b>NUBO喚醒</b><small>呼叫nubo時會把NUBO網頁帶回桌面。</small></div>
        <div className="capability"><b>研究與Gmail</b><small>查找資料時只顯示處理狀態，不播放等待語音。</small></div>
      </div>
    </section>
  );
}







