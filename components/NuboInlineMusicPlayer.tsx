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
    PlayerState?: {
      PLAYING: number;
    };
  };
  onYouTubeIframeAPIReady?: () => void;
};

const PLAYER_ELEMENT_ID = "nubo-inline-youtube-player-v13";
const NORMAL_VOLUME = 62;
const DUCK_VOLUME = 14;
const BACKGROUND_RETRY_DELAYS = [0, 180, 550, 1200, 2600, 5200];

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
    // 部分手機瀏覽器只實作Media Session的一部分。
  }
}

export function NuboInlineMusicPlayer() {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const readyRef = useRef(false);
  const currentSongRef = useRef<InlineSong | null>(null);
  const retryTimersRef = useRef<number[]>([]);
  const backgroundTimersRef = useRef<number[]>([]);
  const keepBackgroundPlaybackRef = useRef(false);
  const [song, setSong] = useState<InlineSong | null>(null);
  const [status, setStatus] = useState("正在準備播放器…");

  const clearRetries = () => {
    retryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    retryTimersRef.current = [];
  };

  const clearBackgroundRetries = () => {
    backgroundTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    backgroundTimersRef.current = [];
  };

  const ensureAudiblePlayback = (background = false) => {
    const player = playerRef.current;
    if (!player || !currentSongRef.current) return;

    try {
      player.setVolume(NORMAL_VOLUME);
      player.unMute();
      player.playVideo();
      setMediaSessionPlaybackState("playing");
      if (background) setStatus("背景播放中");
    } catch {
      // 瀏覽器若暫時限制播放，交由後續重試或回到NUBO時恢復。
    }
  };

  const scheduleBackgroundPlaybackRetries = () => {
    clearBackgroundRetries();

    for (const delay of BACKGROUND_RETRY_DELAYS) {
      const timer = window.setTimeout(() => {
        if (!keepBackgroundPlaybackRef.current || !currentSongRef.current) {
          return;
        }

        const player = playerRef.current;
        if (!player) return;

        try {
          if (player.getPlayerState() !== 1) {
            player.setVolume(NORMAL_VOLUME);
            player.unMute();
            player.playVideo();
          }
          setMediaSessionPlaybackState("playing");
        } catch {
          // 背景分頁可能被節流，下一輪再嘗試。
        }
      }, delay);
      backgroundTimersRef.current.push(timer);
    }
  };

  const replaceCurrentSong = (nextSong: InlineSong) => {
    const player = playerRef.current;
    currentSongRef.current = nextSong;
    clearRetries();

    if (!player || !readyRef.current) {
      setStatus("正在準備播放器…");
      return;
    }

    try {
      setStatus(`正在切換：${nextSong.title}`);
      player.loadVideoById(nextSong.videoId);
      player.setVolume(NORMAL_VOLUME);
      player.unMute();
      player.playVideo();
      setMediaSessionPlaybackState("playing");

      for (const delay of [250, 700, 1500, 2800, 4500]) {
        const timer = window.setTimeout(() => {
          if (
            currentSongRef.current?.requestedAt !== nextSong.requestedAt ||
            player.getPlayerState() === 1
          ) {
            return;
          }

          try {
            player.setVolume(NORMAL_VOLUME);
            player.unMute();
            player.playVideo();
          } catch {
            // 下一輪重試。
          }
        }, delay);
        retryTimersRef.current.push(timer);
      }
    } catch {
      setStatus("播放器切換失敗，請再說一次歌曲名稱。");
    }
  };

  const stopPlayback = () => {
    clearRetries();
    clearBackgroundRetries();
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
      navigator.mediaSession.setActionHandler("play", () => {
        keepBackgroundPlaybackRef.current = true;
        ensureAudiblePlayback(document.visibilityState === "hidden");
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        keepBackgroundPlaybackRef.current = false;
        clearBackgroundRetries();
        playerRef.current?.pauseVideo();
        setStatus("已暫停");
        setMediaSessionPlaybackState("paused");
      });
      navigator.mediaSession.setActionHandler("stop", stopPlayback);
    } catch {
      // Media Session不是背景播放的必要條件。
    }

    return () => {
      try {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("stop", null);
        navigator.mediaSession.metadata = null;
      } catch {
        // 部分手機瀏覽器不允許清除個別控制項。
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
            const pending = currentSongRef.current;
            if (pending) replaceCurrentSong(pending);
            event.target.setVolume(NORMAL_VOLUME);
          },
          onStateChange: (event: YouTubeEvent) => {
            if (event.data === 1) {
              clearRetries();
              setStatus(
                document.visibilityState === "hidden"
                  ? "背景播放中"
                  : "播放中",
              );
              setMediaSessionPlaybackState("playing");
            } else if (event.data === 2) {
              if (
                document.visibilityState === "hidden" &&
                keepBackgroundPlaybackRef.current
              ) {
                scheduleBackgroundPlaybackRetries();
              } else {
                setStatus("已暫停");
                setMediaSessionPlaybackState("paused");
              }
            } else if (event.data === 0) {
              keepBackgroundPlaybackRef.current = false;
              clearBackgroundRetries();
              setStatus("播放完畢");
              setMediaSessionPlaybackState("none");
            }
          },
          onAutoplayBlocked: (event: YouTubeEvent) => {
            setStatus("正在恢復有聲播放…");
            try {
              event.target.mute();
              event.target.playVideo();
            } catch {
              // 保留播放器，下一次自然觸控會自動解除靜音。
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
      clearRetries();
      clearBackgroundRetries();
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
    const unlock = () => ensureAudiblePlayback(false);
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("touchend", unlock, true);
    window.addEventListener("keydown", unlock, true);

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
        if (state === 0 || state === 2) return;
      } catch {
        // 無法讀取狀態時仍以目前有歌曲為準。
      }

      keepBackgroundPlaybackRef.current = true;
      ensureAudiblePlayback(true);
      scheduleBackgroundPlaybackRetries();
    };

    const onExternalTabBlocked = () => {
      keepBackgroundPlaybackRef.current = false;
      clearBackgroundRetries();
      if (currentSongRef.current) setStatus("播放中");
    };

    const onVisibilityChange = () => {
      if (!currentSongRef.current) return;

      if (document.visibilityState === "hidden") {
        if (keepBackgroundPlaybackRef.current) {
          ensureAudiblePlayback(true);
          scheduleBackgroundPlaybackRetries();
        }
        return;
      }

      if (keepBackgroundPlaybackRef.current) {
        ensureAudiblePlayback(false);
        setStatus("播放中");
        window.setTimeout(() => {
          keepBackgroundPlaybackRef.current = false;
          clearBackgroundRetries();
        }, 1200);
      }
    };

    window.addEventListener("nubo-voice-phase", onVoicePhase);
    window.addEventListener("nubo-before-external-tab", onBeforeExternalTab);
    window.addEventListener("nubo-external-tab-blocked", onExternalTabBlocked);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("touchend", unlock, true);
      window.removeEventListener("keydown", unlock, true);
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
        <small>{status}｜開啟其他網頁時持續播放</small>
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
