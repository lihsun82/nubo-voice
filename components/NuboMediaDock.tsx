"use client";

import { useEffect, useRef, useState } from "react";
import type { YouTubePlayRequest } from "@/lib/browser-action-bridge";

type Player = {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  stopVideo: () => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  getPlayerState: () => number;
  destroy: () => void;
};

type PlayerEvent = { target: Player; data?: number };

declare global {
  interface Window {
    YT?: {
      Player: new (elementId: string, options: Record<string, unknown>) => Player;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const PLAYER_ID = "nubo-inline-youtube-player";

export function NuboMediaDock() {
  const playerRef = useRef<Player | null>(null);
  const pendingRef = useRef<YouTubePlayRequest | null>(null);
  const retryRef = useRef<number[]>([]);
  const [request, setRequest] = useState<YouTubePlayRequest | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("按下啟動NUBO後，播放器會進入待命");
  const [expanded, setExpanded] = useState(false);

  const clearRetries = () => {
    retryRef.current.forEach((timer) => window.clearTimeout(timer));
    retryRef.current = [];
  };

  const scheduleRetries = (player: Player) => {
    clearRetries();
    for (const delay of [100, 400, 900, 1600, 2800, 4500, 7000]) {
      retryRef.current.push(
        window.setTimeout(() => {
          if (player.getPlayerState() === 1) return;
          player.setVolume(100);
          player.unMute();
          player.playVideo();
        }, delay),
      );
    }
  };

  const playRequest = (next: YouTubePlayRequest) => {
    pendingRef.current = next;
    setRequest(next);
    setExpanded(true);
    setStatus(`正在播放：${next.title}`);

    const player = playerRef.current;
    if (!player) return;
    player.setVolume(100);
    player.unMute();
    player.loadVideoById(next.videoId);
    player.playVideo();
    scheduleRetries(player);
  };

  useEffect(() => {
    let disposed = false;

    const createPlayer = () => {
      if (disposed || playerRef.current || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player(PLAYER_ID, {
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          playsinline: 1,
          controls: 1,
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: PlayerEvent) => {
            event.target.setVolume(100);
            event.target.unMute();
            setReady(true);
            setStatus("播放器已就緒，等待音樂指令");
            if (pendingRef.current) playRequest(pendingRef.current);
          },
          onStateChange: (event: PlayerEvent) => {
            if (event.data === 1) {
              clearRetries();
              setStatus("播放中");
            }
          },
          onAutoplayBlocked: (event: PlayerEvent) => {
            setStatus("瀏覽器暫時未播放，NUBO正在重試");
            scheduleRetries(event.target);
          },
          onError: (event: PlayerEvent) => {
            setStatus(`YouTube播放器錯誤：${event.data ?? "未知"}`);
          },
        },
      });
    };

    const ensureApi = () => {
      if (window.YT?.Player) {
        createPlayer();
        return;
      }

      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        createPlayer();
      };

      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      }
    };

    const onPrime = () => {
      setExpanded(true);
      setStatus("正在初始化NUBO播放器…");
      ensureApi();
    };

    const onPlay = (event: Event) => {
      const detail = (event as CustomEvent<YouTubePlayRequest>).detail;
      if (!detail?.videoId) return;
      ensureApi();
      playRequest(detail);
    };

    window.addEventListener("nubo-media-prime", onPrime);
    window.addEventListener("nubo-youtube-play", onPlay);
    ensureApi();

    return () => {
      disposed = true;
      clearRetries();
      window.removeEventListener("nubo-media-prime", onPrime);
      window.removeEventListener("nubo-youtube-play", onPlay);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  const manualPlay = () => {
    const player = playerRef.current;
    if (!player) return;
    player.setVolume(100);
    player.unMute();
    player.playVideo();
    scheduleRetries(player);
  };

  const stop = () => {
    clearRetries();
    playerRef.current?.stopVideo();
    setStatus("已停止播放");
  };

  return (
    <aside className={`nubo-media-dock ${expanded ? "expanded" : ""}`}>
      <button
        className="nubo-media-toggle"
        onClick={() => setExpanded((value) => !value)}
        aria-label="切換NUBO播放器"
      >
        <span className={ready ? "media-dot ready" : "media-dot"} />
        NUBO MUSIC
      </button>
      <div className="nubo-media-body">
        <div className="nubo-media-title">
          <strong>{request?.title ?? "NUBO播放器"}</strong>
          <small>{request?.channelTitle ?? status}</small>
        </div>
        <div className="nubo-inline-player-wrap">
          <div id={PLAYER_ID} />
        </div>
        <div className="nubo-media-status">{status}</div>
        <div className="nubo-media-controls">
          <button className="primary" onClick={manualPlay} disabled={!ready}>
            播放
          </button>
          <button className="secondary" onClick={stop} disabled={!ready}>
            停止
          </button>
        </div>
      </div>
    </aside>
  );
}
