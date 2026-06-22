"use client";

import { useEffect, useRef, useState } from "react";
import type { YouTubePlayRequest } from "@/lib/browser-action-bridge";

type Player = {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  stopVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted?: () => boolean;
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

function unlockTopLevelAudio() {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const buffer = context.createBuffer(1, 1, 22050);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    void context.resume();
    source.start(0);
    window.setTimeout(() => void context.close(), 300);
  } catch {
    // The dedicated NUBO browser mode handles autoplay even when this fallback is unavailable.
  }
}

export function NuboMediaDock() {
  const playerRef = useRef<Player | null>(null);
  const pendingRef = useRef<YouTubePlayRequest | null>(null);
  const retryRef = useRef<number[]>([]);
  const unmuteTimerRef = useRef<number | null>(null);
  const primedRef = useRef(false);
  const [request, setRequest] = useState<YouTubePlayRequest | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("按下啟動NUBO後，播放器會進入待命");
  const [expanded, setExpanded] = useState(false);

  const clearTimers = () => {
    retryRef.current.forEach((timer) => window.clearTimeout(timer));
    retryRef.current = [];
    if (unmuteTimerRef.current) window.clearTimeout(unmuteTimerRef.current);
    unmuteTimerRef.current = null;
  };

  const releaseSound = (player: Player) => {
    player.setVolume(100);
    player.unMute();
    player.playVideo();
    unmuteTimerRef.current = window.setTimeout(() => {
      player.setVolume(100);
      player.unMute();
      player.playVideo();
      if (player.isMuted?.()) {
        setStatus("影片已啟動，但一般瀏覽器仍保持靜音；請改用NUBO專用啟動器");
      }
    }, 450);
  };

  const scheduleRetries = (player: Player) => {
    clearTimers();
    for (const delay of [120, 420, 900, 1600, 2800, 4500, 7000]) {
      retryRef.current.push(
        window.setTimeout(() => {
          if (player.getPlayerState() === 1) {
            releaseSound(player);
            return;
          }
          player.mute();
          player.playVideo();
        }, delay),
      );
    }
  };

  const playRequest = (next: YouTubePlayRequest) => {
    pendingRef.current = next;
    setRequest(next);
    setExpanded(true);
    setStatus(`正在啟動：${next.title}`);

    const player = playerRef.current;
    if (!player) return;
    player.setVolume(0);
    player.mute();
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
            setReady(true);
            setStatus(
              primedRef.current
                ? "播放器與聲音權限已就緒"
                : "播放器已就緒；按下啟動NUBO以取得聲音權限",
            );
            if (pendingRef.current) playRequest(pendingRef.current);
          },
          onStateChange: (event: PlayerEvent) => {
            if (event.data === 1) {
              releaseSound(event.target);
              window.setTimeout(() => {
                if (!event.target.isMuted?.()) {
                  clearTimers();
                  setStatus("播放中");
                }
              }, 650);
            }
          },
          onAutoplayBlocked: (event: PlayerEvent) => {
            setStatus("瀏覽器暫時阻擋聲音，NUBO正在以靜音啟播後解除靜音");
            event.target.mute();
            event.target.playVideo();
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
      primedRef.current = true;
      unlockTopLevelAudio();
      setExpanded(true);
      setStatus("正在初始化播放器與聲音權限…");
      ensureApi();
      const player = playerRef.current;
      if (player) {
        player.setVolume(100);
        setStatus("播放器與聲音權限已就緒");
      }
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
      clearTimers();
      window.removeEventListener("nubo-media-prime", onPrime);
      window.removeEventListener("nubo-youtube-play", onPlay);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  const manualPlay = () => {
    const player = playerRef.current;
    if (!player) return;
    primedRef.current = true;
    unlockTopLevelAudio();
    player.setVolume(100);
    player.unMute();
    player.playVideo();
    scheduleRetries(player);
  };

  const stop = () => {
    clearTimers();
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
            播放並開啟聲音
          </button>
          <button className="secondary" onClick={stop} disabled={!ready}>
            停止
          </button>
        </div>
      </div>
    </aside>
  );
}
