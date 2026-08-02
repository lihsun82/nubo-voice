"use client";

import { useEffect, useRef, useState } from "react";

type InlineSong = {
  videoId: string;
  title: string;
  channelTitle: string;
  requestedAt: number;
};

type YouTubePlayer = {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
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

type TimerListRef = {
  current: number[];
};

const PLAYER_ELEMENT_ID = "nubo-inline-youtube-player-v14-4";
const NORMAL_VOLUME = 62;
const DUCK_VOLUME = 14;
const AUTO_START_DELAYS = [250, 700, 1400, 2600];
const SOUND_PROMOTION_DELAYS = [0, 80, 220, 520];
const BACKGROUND_RETRY_DELAYS = [600, 1800, 4200];

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

function setMediaSessionPlaybackState(state: "none" | "paused" | "playing") {
  try {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  } catch {
    // 部分手機瀏覽器只實作 Media Session 的一部分。
  }
}

export function NuboInlineMusicPlayer() {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const readyRef = useRef(false);
  const currentSongRef = useRef<InlineSong | null>(null);
  const userPausedRef = useRef(false);
  const keepBackgroundPlaybackRef = useRef(false);
  const autoStartTimersRef = useRef<number[]>([]);
  const soundTimersRef = useRef<number[]>([]);
  const backgroundTimersRef = useRef<number[]>([]);

  const [song, setSong] = useState<InlineSong | null>(null);
  const [status, setStatus] = useState("正在準備播放器…");
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsUserStart, setNeedsUserStart] = useState(false);

  const clearTimerList = (timers: TimerListRef) => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };

  const clearAutoStartRetries = () => clearTimerList(autoStartTimersRef);
  const clearSoundPromotion = () => clearTimerList(soundTimersRef);
  const clearBackgroundRetries = () => clearTimerList(backgroundTimersRef);

  const applyAudibleSettings = (player: YouTubePlayer) => {
    player.setVolume(NORMAL_VOLUME);
    player.unMute();
  };

  const scheduleSoundPromotion = (player: YouTubePlayer) => {
    clearSoundPromotion();

    for (const delay of SOUND_PROMOTION_DELAYS) {
      const timer = window.setTimeout(() => {
        if (
          playerRef.current !== player ||
          !currentSongRef.current ||
          userPausedRef.current
        ) {
          return;
        }

        try {
          applyAudibleSettings(player);
        } catch {
          // 下一輪再嘗試解除靜音。
        }
      }, delay);
      soundTimersRef.current.push(timer);
    }
  };

  const requestPlayback = ({
    fromGesture,
    background = false,
  }: {
    fromGesture: boolean;
    background?: boolean;
  }) => {
    const player = playerRef.current;
    const currentSong = currentSongRef.current;

    if (!player || !currentSong || !readyRef.current) {
      setStatus("播放器仍在準備中…");
      return;
    }

    if (fromGesture) {
      userPausedRef.current = false;
      keepBackgroundPlaybackRef.current = false;
      clearBackgroundRetries();
      setNeedsUserStart(false);
    }

    try {
      const state = player.getPlayerState();

      if (state === -1 || state === 0 || state === 5) {
        player.loadVideoById(currentSong.videoId);
      }

      applyAudibleSettings(player);
      player.playVideo();
      scheduleSoundPromotion(player);
      setStatus(background ? "背景播放中" : "正在啟動有聲播放…");
    } catch {
      setNeedsUserStart(true);
      setStatus("請點一下播放音樂。");
    }
  };

  const scheduleAutoStart = (nextSong: InlineSong) => {
    clearAutoStartRetries();

    AUTO_START_DELAYS.forEach((delay, index) => {
      const timer = window.setTimeout(() => {
        if (
          currentSongRef.current?.requestedAt !== nextSong.requestedAt ||
          !playerRef.current ||
          userPausedRef.current
        ) {
          return;
        }

        const player = playerRef.current;

        try {
          const state = player.getPlayerState();
          if (state === 1 || state === 3) {
            scheduleSoundPromotion(player);
            return;
          }

          applyAudibleSettings(player);
          player.playVideo();

          if (index === AUTO_START_DELAYS.length - 1) {
            setNeedsUserStart(true);
            setStatus("請點一下播放音樂。");
          }
        } catch {
          if (index === AUTO_START_DELAYS.length - 1) {
            setNeedsUserStart(true);
            setStatus("請點一下播放音樂。");
          }
        }
      }, delay);
      autoStartTimersRef.current.push(timer);
    });
  };

  const scheduleBackgroundPlaybackRetries = () => {
    clearBackgroundRetries();

    for (const delay of BACKGROUND_RETRY_DELAYS) {
      const timer = window.setTimeout(() => {
        if (
          !keepBackgroundPlaybackRef.current ||
          userPausedRef.current ||
          !currentSongRef.current ||
          !playerRef.current
        ) {
          return;
        }

        try {
          const state = playerRef.current.getPlayerState();
          if (state !== 1 && state !== 3) {
            playerRef.current.playVideo();
          }
        } catch {
          // 背景分頁可能被系統節流，下一輪再嘗試。
        }
      }, delay);
      backgroundTimersRef.current.push(timer);
    }
  };

  const loadCurrentSong = (nextSong: InlineSong) => {
    const player = playerRef.current;
    currentSongRef.current = nextSong;
    userPausedRef.current = false;
    keepBackgroundPlaybackRef.current = false;
    clearAutoStartRetries();
    clearSoundPromotion();
    clearBackgroundRetries();
    setIsPlaying(false);
    setNeedsUserStart(false);

    if (!player || !readyRef.current) {
      setStatus("正在準備播放器…");
      return;
    }

    try {
      setStatus(`正在播放：${nextSong.title}`);
      player.setVolume(NORMAL_VOLUME);
      player.unMute();
      player.loadVideoById(nextSong.videoId);
      player.playVideo();
      scheduleAutoStart(nextSong);
    } catch {
      setNeedsUserStart(true);
      setStatus("請點一下播放音樂。");
    }
  };

  const togglePlayback = () => {
    const player = playerRef.current;
    if (!player || !currentSongRef.current) return;

    let state = -1;
    try {
      state = player.getPlayerState();
    } catch {
      // 以 React 狀態作為備援。
    }

    if (isPlaying || state === 1 || state === 3) {
      userPausedRef.current = true;
      keepBackgroundPlaybackRef.current = false;
      clearAutoStartRetries();
      clearSoundPromotion();
      clearBackgroundRetries();

      try {
        player.pauseVideo();
      } catch {
        // 狀態事件仍會同步介面。
      }

      setIsPlaying(false);
      setNeedsUserStart(false);
      setStatus("已暫停");
      setMediaSessionPlaybackState("paused");
      return;
    }

    requestPlayback({ fromGesture: true });
  };

  const stopPlayback = () => {
    clearAutoStartRetries();
    clearSoundPromotion();
    clearBackgroundRetries();
    userPausedRef.current = false;
    keepBackgroundPlaybackRef.current = false;

    try {
      playerRef.current?.stopVideo();
    } catch {
      // 即使播放器正在切換，也直接收起介面。
    }

    currentSongRef.current = null;
    setSong(null);
    setIsPlaying(false);
    setNeedsUserStart(false);
    setStatus("已停止");
    setMediaSessionPlaybackState("none");
  };

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
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("stop", null);
    } catch {
      // Media Session 不是基本播放的必要條件。
    }

    return () => {
      try {
        navigator.mediaSession.metadata = null;
      } catch {
        // 部分手機瀏覽器不允許清除 Metadata。
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
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: YouTubeEvent) => {
            readyRef.current = true;

            try {
              const iframe = event.target.getIframe?.();
              iframe?.setAttribute(
                "allow",
                "autoplay; encrypted-media; picture-in-picture",
              );
              iframe?.setAttribute("tabindex", "-1");
            } catch {
              // iframe 屬性無法修改時不影響自訂控制鍵。
            }

            event.target.setVolume(NORMAL_VOLUME);
            const pending = currentSongRef.current;
            if (pending) loadCurrentSong(pending);
          },
          onStateChange: (event: YouTubeEvent) => {
            if (event.data === 1) {
              clearAutoStartRetries();
              setIsPlaying(true);
              setNeedsUserStart(false);
              setMediaSessionPlaybackState("playing");
              scheduleSoundPromotion(event.target);
              setStatus(
                document.visibilityState === "hidden"
                  ? "背景播放中"
                  : "播放中",
              );
              return;
            }

            if (event.data === 2) {
              setIsPlaying(false);
              clearSoundPromotion();

              if (
                document.visibilityState === "hidden" &&
                keepBackgroundPlaybackRef.current &&
                !userPausedRef.current
              ) {
                scheduleBackgroundPlaybackRetries();
              } else {
                setStatus("已暫停");
                setMediaSessionPlaybackState("paused");
              }
              return;
            }

            if (event.data === 3) {
              setStatus("載入中…");
              return;
            }

            if (event.data === 0) {
              userPausedRef.current = false;
              keepBackgroundPlaybackRef.current = false;
              clearBackgroundRetries();
              clearSoundPromotion();
              setIsPlaying(false);
              setNeedsUserStart(false);
              setStatus("播放完畢");
              setMediaSessionPlaybackState("none");
            }
          },
          onAutoplayBlocked: () => {
            clearAutoStartRetries();
            setIsPlaying(false);
            setNeedsUserStart(true);
            setStatus("請點一下播放音樂。");
          },
          onError: () => {
            setIsPlaying(false);
            setNeedsUserStart(true);
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
      clearAutoStartRetries();
      clearSoundPromotion();
      clearBackgroundRetries();
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
      youtubeWindow.onYouTubeIframeAPIReady = previousReady;
    };
  }, [Boolean(song)]);

  useEffect(() => {
    if (song) loadCurrentSong(song);
  }, [song?.videoId, song?.requestedAt]);

  useEffect(() => {
    const onVoicePhase = (event: Event) => {
      const phase = (event as CustomEvent<{ phase?: string }>).detail?.phase;
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
      if (!player || !currentSongRef.current || userPausedRef.current) return;

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
    };

    const onVisibilityChange = () => {
      if (!currentSongRef.current || !playerRef.current) return;

      if (document.visibilityState === "hidden") {
        if (
          keepBackgroundPlaybackRef.current &&
          !userPausedRef.current
        ) {
          scheduleBackgroundPlaybackRetries();
        }
        return;
      }

      clearBackgroundRetries();

      if (
        keepBackgroundPlaybackRef.current &&
        !userPausedRef.current
      ) {
        requestPlayback({ fromGesture: false });
      }

      keepBackgroundPlaybackRef.current = false;
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
    <aside
      className={`nubo-inline-music${needsUserStart ? " needs-user-start" : ""}`}
      aria-live="polite"
    >
      <div className="nubo-inline-music-frame" aria-hidden="true">
        <div id={PLAYER_ELEMENT_ID} />
      </div>

      <div className="nubo-inline-music-info">
        <strong>{song.title}</strong>
        {song.channelTitle ? <span>{song.channelTitle}</span> : null}
        <small>{status}｜說出另一首歌會直接替換</small>
      </div>

      <div className="nubo-inline-music-controls">
        <button
          type="button"
          className="nubo-inline-music-toggle"
          onClick={togglePlayback}
          aria-label={isPlaying ? "暫停音樂" : "播放音樂"}
        >
          {isPlaying ? "暫停" : needsUserStart ? "播放音樂" : "播放"}
        </button>
        <button
          type="button"
          className="nubo-inline-music-stop"
          onClick={stopPlayback}
          aria-label="停止音樂"
        >
          停止
        </button>
      </div>
    </aside>
  );
}
