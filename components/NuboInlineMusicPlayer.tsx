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
  destroy: () => void;
};

type YouTubeEvent = {
  target: YouTubePlayer;
  data?: number;
};

type YouTubeWindow = Window & {
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

export function NuboInlineMusicPlayer() {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const readyRef = useRef(false);
  const currentSongRef = useRef<InlineSong | null>(null);
  const retryTimersRef = useRef<number[]>([]);
  const [song, setSong] = useState<InlineSong | null>(null);
  const [status, setStatus] = useState("正在準備播放器…");

  const clearRetries = () => {
    retryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    retryTimersRef.current = [];
  };

  const restoreAudiblePlayback = () => {
    const player = playerRef.current;
    if (!player || !currentSongRef.current) return;

    try {
      player.setVolume(NORMAL_VOLUME);
      player.unMute();
      player.playVideo();
    } catch {
      // 瀏覽器仍限制時，等下一次使用者在NUBO頁面的自然互動再恢復。
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
    if (!song) return;

    const youtubeWindow = window as YouTubeWindow;
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
            const pending = currentSongRef.current;
            if (pending) replaceCurrentSong(pending);
            event.target.setVolume(NORMAL_VOLUME);
          },
          onStateChange: (event: YouTubeEvent) => {
            if (event.data === 1) {
              clearRetries();
              setStatus("播放中");
            } else if (event.data === 2) {
              setStatus("已暫停");
            } else if (event.data === 0) {
              setStatus("播放完畢");
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
    const unlock = () => restoreAudiblePlayback();
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

    window.addEventListener("nubo-voice-phase", onVoicePhase);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("touchend", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("nubo-voice-phase", onVoicePhase);
    };
  }, []);

  if (!song) return null;

  const stopPlayback = () => {
    clearRetries();
    try {
      playerRef.current?.stopVideo();
    } catch {
      // 即使播放器正在切換，也直接收起介面。
    }
    currentSongRef.current = null;
    setSong(null);
    setStatus("已停止");
  };

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
