"use client";

import { useEffect, useRef, useState } from "react";

type InlineSong = {
  videoId: string;
  title: string;
  channelTitle: string;
  requestedAt: number;
};

type YouTubePlayer = {
  cueVideoById: (videoId: string) => void;
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  mute: () => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  getPlayerState: () => number;
  getIframe?: () => HTMLIFrameElement;
  destroy: () => void;
};

type YouTubeEvent = {
  target: YouTubePlayer;
  data?: number;
};

type YouTubeApiHost = {
  YT?: {
    Player: new (
      elementId: string,
      options: Record<string, unknown>,
    ) => YouTubePlayer;
  };
  onYouTubeIframeAPIReady?: () => void;
};

type NavigatorWithActivation = Navigator & {
  userActivation?: {
    hasBeenActive?: boolean;
    isActive?: boolean;
  };
};

const PLAYER_ELEMENT_ID = "nubo-inline-youtube-player-v13";
const NORMAL_VOLUME = 62;
const DUCK_VOLUME = 14;
const START_RETRY_DELAYS = [350, 900, 1800, 3200];
const BACKGROUND_RETRY_DELAYS = [500, 1500, 3500];

function readSongDetail(event: Event): InlineSong | null {
  const detail = (
    event as CustomEvent<{
      videoId?: unknown;
      title?: unknown;
      channelTitle?: unknown;
      requestedAt?: unknown;
    }>
  ).detail;

  const videoId = String(detail?.videoId ?? "").trim();
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null;

  return {
    videoId,
    title: String(detail?.title ?? "正在播放").trim() || "正在播放",
    channelTitle: String(detail?.channelTitle ?? "").trim(),
    requestedAt:
      typeof detail?.requestedAt === "number"
        ? detail.requestedAt
        : Date.now(),
  };
}

function hasBrowserUserActivation() {
  const activation = (navigator as NavigatorWithActivation).userActivation;
  return Boolean(activation?.isActive || activation?.hasBeenActive);
}

function setMediaSessionPlaybackState(state: "none" | "paused" | "playing") {
  try {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  } catch {
    // 部分手機瀏覽器只實作Media Session的一部分。
  }
}

export function NuboInlineMusicPlayer() {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const readyRef = useRef(false);
  const currentSongRef = useRef<InlineSong | null>(null);
  const userActivatedRef = useRef(false);
  const keepBackgroundPlaybackRef = useRef(false);
  const startTimersRef = useRef<number[]>([]);
  const backgroundTimersRef = useRef<number[]>([]);
  const audiblePromotionTimersRef = useRef<number[]>([]);
  const [song, setSong] = useState<InlineSong | null>(null);
  const [status, setStatus] = useState("正在準備播放器…");

  const clearTimerList = (timers: React.MutableRefObject<number[]>) => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };

  const clearStartRetries = () => clearTimerList(startTimersRef);
  const clearBackgroundRetries = () => clearTimerList(backgroundTimersRef);
  const clearAudiblePromotionRetries = () =>
    clearTimerList(audiblePromotionTimersRef);

  const promoteToAudiblePlayback = (
    player = playerRef.current,
    background = false,
  ) => {
    if (!player || !currentSongRef.current) return;

    try {
      player.setVolume(NORMAL_VOLUME);
      player.unMute();

      const state = player.getPlayerState();
      if (state !== 1 && state !== 3) {
        player.playVideo();
      }

      setMediaSessionPlaybackState("playing");
      setStatus(background ? "背景播放中" : "播放中");
    } catch {
      // 等待下一次播放器狀態更新或使用者自然操作。
    }
  };

  const scheduleAudiblePromotion = (player: YouTubePlayer) => {
    clearAudiblePromotionRetries();

    for (const delay of [0, 120, 360, 850]) {
      const timer = window.setTimeout(() => {
        if (!currentSongRef.current || playerRef.current !== player) return;

        try {
          const state = player.getPlayerState();
          if (state !== 1 && state !== 3) return;
          promoteToAudiblePlayback(
            player,
            document.visibilityState === "hidden",
          );
        } catch {
          // 播放器切換期間由下一輪處理。
        }
      }, delay);
      audiblePromotionTimersRef.current.push(timer);
    }
  };

  const scheduleStartRetries = (nextSong: InlineSong) => {
    clearStartRetries();

    for (const delay of START_RETRY_DELAYS) {
      const timer = window.setTimeout(() => {
        if (
          currentSongRef.current?.requestedAt !== nextSong.requestedAt ||
          !playerRef.current
        ) {
          return;
        }

        const player = playerRef.current;

        try {
          const state = player.getPlayerState();
          if (state === 1 || state === 3) {
            scheduleAudiblePromotion(player);
            return;
          }

          if (hasBrowserUserActivation() || userActivatedRef.current) {
            player.setVolume(NORMAL_VOLUME);
            player.unMute();
          }
          player.playVideo();
        } catch {
          // 下一輪再嘗試，不執行停止或重新載入。
        }
      }, delay);
      startTimersRef.current.push(timer);
    }
  };

  const scheduleBackgroundPlaybackRetries = () => {
    clearBackgroundRetries();

    for (const delay of BACKGROUND_RETRY_DELAYS) {
      const timer = window.setTimeout(() => {
        if (
          !keepBackgroundPlaybackRef.current ||
          !currentSongRef.current ||
          !playerRef.current
        ) {
          return;
        }

        const player = playerRef.current;

        try {
          const state = player.getPlayerState();
          if (state !== 1 && state !== 3) {
            player.playVideo();
          }
        } catch {
          // 背景分頁可能被系統節流，下一輪再嘗試。
        }
      }, delay);
      backgroundTimersRef.current.push(timer);
    }
  };

  const replaceCurrentSong = (nextSong: InlineSong) => {
    const player = playerRef.current;
    currentSongRef.current = nextSong;
    keepBackgroundPlaybackRef.current = false;
    clearStartRetries();
    clearBackgroundRetries();
    clearAudiblePromotionRetries();

    if (!player || !readyRef.current) {
      setStatus("正在準備播放器…");
      return;
    }

    try {
      setStatus(`正在播放：${nextSong.title}`);
      player.setVolume(NORMAL_VOLUME);

      if (hasBrowserUserActivation() || userActivatedRef.current) {
        player.unMute();
      }

      player.loadVideoById(nextSong.videoId);
      player.playVideo();
      scheduleStartRetries(nextSong);
    } catch {
      setStatus("播放器啟動失敗，請再說一次歌曲名稱。");
    }
  };

  const stopPlayback = () => {
    clearStartRetries();
    clearBackgroundRetries();
    clearAudiblePromotionRetries();
    keepBackgroundPlaybackRef.current = false;

    try {
      playerRef.current?.stopVideo();
    } catch {
      // 即使播放器正在切換，也直接收起介面。
    }

    currentSongRef.current = null;
    setSong(null);
    setStatus("已停止");
    setMediaSessionPlaybackState("none");
  };

  useEffect(() => {
    const rememberUserActivation = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".nubo-inline-music-stop")
      ) {
        return;
      }

      userActivatedRef.current = true;

      if (currentSongRef.current && playerRef.current) {
        promoteToAudiblePlayback(playerRef.current, false);
      }
    };

    window.addEventListener("pointerdown", rememberUserActivation, true);
    window.addEventListener("touchend", rememberUserActivation, true);
    window.addEventListener("keydown", rememberUserActivation, true);

    return () => {
      window.removeEventListener("pointerdown", rememberUserActivation, true);
      window.removeEventListener("touchend", rememberUserActivation, true);
      window.removeEventListener("keydown", rememberUserActivation, true);
    };
  }, []);

  useEffect(() => {
    const onPlay = (event: Event) => {
      const nextSong = readSongDetail(event);
      if (!nextSong) return;
      currentSongRef.current = nextSong;
      setSong(nextSong);
    };

    window.addEventListener("nubo-inline-music-play", onPlay);
    return () => window.removeEventListener("nubo-inline-music-play", onPlay);
  }, []);

  useEffect(() => {
    if (!song) {
      document.body.classList.remove("nubo-inline-music-active");
      return;
    }

    document.body.classList.add("nubo-inline-music-active");
    return () => document.body.classList.remove("nubo-inline-music-active");
  }, [song]);

  useEffect(() => {
    if (!song || !("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.channelTitle || "NUBO",
        album: "NUBO 音樂播放器",
      });

      // 不攔截YouTube iframe自己的播放、暫停與停止按鍵。
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("stop", null);
    } catch {
      // Media Session不是基本播放的必要條件。
    }

    return () => {
      try {
        navigator.mediaSession.metadata = null;
      } catch {
        // 部分手機瀏覽器不允許清除Metadata。
      }
    };
  }, [song?.videoId, song?.title, song?.channelTitle]);

  useEffect(() => {
    if (!song) return;

    const youtubeWindow = window as unknown as YouTubeApiHost;
    let disposed = false;
    const previousReady = youtubeWindow.onYouTubeIframeAPIReady;

    const createPlayer = () => {
      if (disposed || playerRef.current || !youtubeWindow.YT?.Player) return;

      playerRef.current = new youtubeWindow.YT.Player(PLAYER_ELEMENT_ID, {
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          controls: 1,
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: YouTubeEvent) => {
            readyRef.current = true;

            try {
              event.target
                .getIframe?.()
                .setAttribute(
                  "allow",
                  "autoplay; encrypted-media; picture-in-picture",
                );
            } catch {
              // iframe屬性無法修改時不影響基本播放。
            }

            event.target.setVolume(NORMAL_VOLUME);
            const pending = currentSongRef.current;
            if (pending) replaceCurrentSong(pending);
          },
          onStateChange: (event: YouTubeEvent) => {
            if (event.data === 1) {
              clearStartRetries();
              setMediaSessionPlaybackState("playing");
              scheduleAudiblePromotion(event.target);
              return;
            }

            if (event.data === 2) {
              clearAudiblePromotionRetries();

              if (
                document.visibilityState === "hidden" &&
                keepBackgroundPlaybackRef.current
              ) {
                scheduleBackgroundPlaybackRetries();
              } else {
                setStatus("已暫停");
                setMediaSessionPlaybackState("paused");
              }
              return;
            }

            if (event.data === 0) {
              keepBackgroundPlaybackRef.current = false;
              clearBackgroundRetries();
              clearAudiblePromotionRetries();
              setStatus("播放完畢");
              setMediaSessionPlaybackState("none");
            }
          },
          onAutoplayBlocked: (event: YouTubeEvent) => {
            setStatus("正在啟動有聲播放…");

            try {
              // 先讓影片穩定進入播放狀態，再由onStateChange解除靜音。
              event.target.mute();
              event.target.playVideo();
            } catch {
              setStatus("請輕觸NUBO頁面，即會恢復有聲播放。");
            }
          },
          onError: () => {
            setStatus("這支影片無法內嵌播放，請重新指定歌曲。");
          },
        },
      });
    };

    if (youtubeWindow.YT?.Player) {
      createPlayer();
    } else {
      youtubeWindow.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        createPlayer();
      };

      if (
        !document.querySelector(
          'script[src="https://www.youtube.com/iframe_api"]',
        )
      ) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      }
    }

    return () => {
      disposed = true;
      clearStartRetries();
      clearBackgroundRetries();
      clearAudiblePromotionRetries();
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
      youtubeWindow.onYouTubeIframeAPIReady = previousReady;
    };
  }, [Boolean(song)]);

  useEffect(() => {
    if (song) replaceCurrentSong(song);
  }, [song?.videoId, song?.requestedAt]);

  useEffect(() => {
    const onVoicePhase = (event: Event) => {
      const phase = (
        event as CustomEvent<{ phase?: string }>
      ).detail?.phase;
      const player = playerRef.current;
      if (!player || !currentSongRef.current) return;

      try {
        if (phase === "thinking" || phase === "speaking") {
          player.setVolume(DUCK_VOLUME);
        } else if (phase === "listening" || phase === "idle") {
          player.setVolume(NORMAL_VOLUME);
        }
      } catch {
        // 播放器切換瞬間忽略音量控制錯誤。
      }
    };

    const onBeforeExternalTab = () => {
      const player = playerRef.current;
      if (!player || !currentSongRef.current) return;

      try {
        const state = player.getPlayerState();
        if (state !== 1 && state !== 3) return;
      } catch {
        return;
      }

      keepBackgroundPlaybackRef.current = true;
      setStatus("背景播放中");
      scheduleBackgroundPlaybackRetries();
    };

    const onExternalTabBlocked = () => {
      keepBackgroundPlaybackRef.current = false;
      clearBackgroundRetries();

      if (currentSongRef.current) {
        promoteToAudiblePlayback(playerRef.current, false);
      }
    };

    const onVisibilityChange = () => {
      if (!currentSongRef.current || !playerRef.current) return;

      if (document.visibilityState === "hidden") {
        if (keepBackgroundPlaybackRef.current) {
          scheduleBackgroundPlaybackRetries();
        }
        return;
      }

      clearBackgroundRetries();
      keepBackgroundPlaybackRef.current = false;
      promoteToAudiblePlayback(playerRef.current, false);
    };

    window.addEventListener("nubo-voice-phase", onVoicePhase);
    window.addEventListener("nubo-before-external-tab", onBeforeExternalTab);
    window.addEventListener("nubo-external-tab-blocked", onExternalTabBlocked);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("nubo-voice-phase", onVoicePhase);
      window.removeEventListener("nubo-before-external-tab", onBeforeExternalTab);
      window.removeEventListener("nubo-external-tab-blocked", onExternalTabBlocked);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearBackgroundRetries();
    };
  }, []);

  if (!song) return null;

  return (
    <aside className="nubo-inline-music" aria-live="polite">
      <div className="nubo-inline-music-frame">
        <div id={PLAYER_ELEMENT_ID} />
      </div>

      <div className="nubo-inline-music-info">
        <strong>{song.title}</strong>
        {song.channelTitle ? <span>{song.channelTitle}</span> : null}
        <small>{status}｜說出另一首歌會直接替換</small>
      </div>

      <button
        type="button"
        className="nubo-inline-music-stop"
        onClick={stopPlayback}
        aria-label="停止音樂"
      >
        停止
      </button>
    </aside>
  );
}
