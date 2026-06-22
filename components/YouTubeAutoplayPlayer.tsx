"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  videoId: string;
  title: string;
  channelTitle: string;
  origin: string;
};

type YouTubePlayer = {
  playVideo: () => void;
  loadVideoById: (videoId: string) => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  getPlayerState: () => number;
  destroy: () => void;
};

type YouTubeEvent = {
  target: YouTubePlayer;
  data?: number;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: Record<string, unknown>,
      ) => YouTubePlayer;
      PlayerState?: { PLAYING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function YouTubeAutoplayPlayer({
  videoId,
  title,
  channelTitle,
  origin,
}: Props) {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const retryTimersRef = useRef<number[]>([]);
  const [status, setStatus] = useState("正在載入播放器…");
  const [blocked, setBlocked] = useState(false);
  const playerElementId = useMemo(
    () => `nubo-youtube-player-${videoId.replace(/[^A-Za-z0-9_-]/g, "")}`,
    [videoId],
  );

  const forcePlay = () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      player.setVolume(100);
      player.unMute();
      player.playVideo();
      setStatus("正在啟動音樂…");
    } catch {
      setStatus("播放器尚未準備完成");
    }
  };

  useEffect(() => {
    let disposed = false;

    const clearRetries = () => {
      retryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      retryTimersRef.current = [];
    };

    const scheduleRetries = (player: YouTubePlayer) => {
      clearRetries();
      for (const delay of [200, 700, 1500, 3000, 5000]) {
        const timer = window.setTimeout(() => {
          if (disposed || player.getPlayerState() === 1) return;
          player.setVolume(100);
          player.unMute();
          player.playVideo();
        }, delay);
        retryTimersRef.current.push(timer);
      }
    };

    const createPlayer = () => {
      if (disposed || !window.YT?.Player || playerRef.current) return;
      playerRef.current = new window.YT.Player(playerElementId, {
        width: "100%",
        height: "100%",
        videoId,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          controls: 1,
          rel: 0,
          enablejsapi: 1,
          origin,
        },
        events: {
          onReady: (event: YouTubeEvent) => {
            setStatus("播放器已準備，正在自動播放…");
            event.target.setVolume(100);
            event.target.unMute();
            event.target.loadVideoById(videoId);
            event.target.playVideo();
            scheduleRetries(event.target);
          },
          onStateChange: (event: YouTubeEvent) => {
            if (event.data === 1) {
              clearRetries();
              setBlocked(false);
              setStatus("播放中");
            }
          },
          onAutoplayBlocked: (event: YouTubeEvent) => {
            setBlocked(true);
            setStatus("瀏覽器暫時阻擋播放，NUBO正在重試");
            scheduleRetries(event.target);
          },
          onError: (event: YouTubeEvent) => {
            setStatus(`YouTube播放器錯誤：${event.data ?? "未知"}`);
            setBlocked(true);
          },
        },
      });
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        createPlayer();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      }
    }

    return () => {
      disposed = true;
      clearRetries();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [origin, playerElementId, videoId]);

  return (
    <main className="youtube-player-shell">
      <section className="youtube-player-card">
        <div className="eyebrow">NUBO MUSIC PLAYER</div>
        <h1>{title}</h1>
        <p>{channelTitle}</p>
        <div className="youtube-frame-wrap">
          <div id={playerElementId} />
        </div>
        <div className="youtube-player-status">{status}</div>
        {blocked ? (
          <button className="primary" onClick={forcePlay}>
            立即播放
          </button>
        ) : null}
        <small>
          NUBO會在播放器就緒後主動呼叫播放並自動重試；影片仍可能受到地區、年齡、廣告或嵌入限制。
        </small>
      </section>
    </main>
  );
}
