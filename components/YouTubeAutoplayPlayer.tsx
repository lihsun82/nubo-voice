"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Props = {
  videoId: string;
  title: string;
  channelTitle: string;
  origin: string;
};

type YouTubePlayer = {
  playVideo: () => void;
  cueVideoById: (videoId: string) => void;
  loadVideoById: (videoId: string) => void;
  unMute: () => void;
  mute: () => void;
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
      PlayerState?: {
        PLAYING: number;
      };
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
  const playerRef =
    useRef<YouTubePlayer | null>(null);

  const retryTimersRef =
    useRef<number[]>([]);

  const [status, setStatus] =
    useState("正在載入播放器…");

  const [ready, setReady] =
    useState(false);

  const [playing, setPlaying] =
    useState(false);

  const playerElementId = useMemo(
    () =>
      `nubo-youtube-player-${videoId.replace(
        /[^A-Za-z0-9_-]/g,
        "",
      )}`,
    [videoId],
  );

  const directYoutubeUrl = useMemo(
    () =>
      `https://www.youtube.com/watch?v=${videoId}`,
    [videoId],
  );

  const forcePlay = () => {
    const player = playerRef.current;

    if (!player) {
      window.open(
        directYoutubeUrl,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    try {
      player.setVolume(100);
      player.unMute();
      player.playVideo();

      setStatus("正在播放音樂…");
    } catch {
      setStatus(
        "內嵌播放器無法啟動，請使用下方 YouTube 按鈕。",
      );
    }
  };

  useEffect(() => {
    let disposed = false;

    const mobileBrowser =
      /Android|iPhone|iPad|iPod|Mobile/i.test(
        window.navigator.userAgent,
      );

    const clearRetries = () => {
      retryTimersRef.current.forEach((timer) =>
        window.clearTimeout(timer),
      );

      retryTimersRef.current = [];
    };

    const scheduleDesktopRetries = (
      player: YouTubePlayer,
    ) => {
      clearRetries();

      for (const delay of [
        200,
        700,
        1500,
        3000,
        5000,
      ]) {
        const timer = window.setTimeout(() => {
          if (
            disposed ||
            player.getPlayerState() === 1
          ) {
            return;
          }

          player.setVolume(100);
          player.unMute();
          player.playVideo();
        }, delay);

        retryTimersRef.current.push(timer);
      }
    };

    const createPlayer = () => {
      if (
        disposed ||
        !window.YT?.Player ||
        playerRef.current
      ) {
        return;
      }

      playerRef.current =
        new window.YT.Player(
          playerElementId,
          {
            width: "100%",
            height: "100%",
            videoId,
            playerVars: {
              autoplay: mobileBrowser ? 0 : 1,
              playsinline: 1,
              controls: 1,
              rel: 0,
              enablejsapi: 1,
              origin,
            },
            events: {
              onReady: (
                event: YouTubeEvent,
              ) => {
                setReady(true);

                if (mobileBrowser) {
                  event.target.cueVideoById(
                    videoId,
                  );

                  setStatus(
                    "手機瀏覽器需要按「立即播放」才能播放聲音。",
                  );

                  return;
                }

                setStatus(
                  "播放器已準備，正在自動播放…",
                );

                event.target.setVolume(100);
                event.target.unMute();
                event.target.loadVideoById(
                  videoId,
                );
                event.target.playVideo();

                scheduleDesktopRetries(
                  event.target,
                );
              },

              onStateChange: (
                event: YouTubeEvent,
              ) => {
                if (event.data === 1) {
                  clearRetries();
                  setPlaying(true);
                  setStatus("播放中");
                } else {
                  setPlaying(false);
                }
              },

              onAutoplayBlocked: (
                event: YouTubeEvent,
              ) => {
                setPlaying(false);

                setStatus(
                  "瀏覽器已阻擋自動播放，請按「立即播放」。",
                );

                if (!mobileBrowser) {
                  scheduleDesktopRetries(
                    event.target,
                  );
                }
              },

              onError: (
                event: YouTubeEvent,
              ) => {
                setPlaying(false);

                setStatus(
                  `YouTube 播放器錯誤：${event.data ?? "未知"}。請改用 YouTube App 播放。`,
                );
              },
            },
          },
        );
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      const previousReady =
        window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady =
        () => {
          previousReady?.();
          createPlayer();
        };

      if (
        !document.querySelector(
          'script[src="https://www.youtube.com/iframe_api"]',
        )
      ) {
        const script =
          document.createElement("script");

        script.src =
          "https://www.youtube.com/iframe_api";

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
  }, [
    origin,
    playerElementId,
    videoId,
  ]);

  return (
    <main className="youtube-player-shell">
      <section className="youtube-player-card">
        <div className="eyebrow">
          NUBO MUSIC PLAYER
        </div>

        <h1>{title}</h1>
        <p>{channelTitle}</p>

        <div className="youtube-frame-wrap">
          <div id={playerElementId} />
        </div>

        <div className="youtube-player-status">
          {status}
        </div>

        {!playing ? (
          <button
            className="primary"
            type="button"
            disabled={!ready}
            onClick={forcePlay}
          >
            {ready
              ? "立即播放"
              : "播放器載入中…"}
          </button>
        ) : null}

        <a
          className="secondary"
          href={directYoutubeUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block",
            marginTop: "12px",
            textDecoration: "none",
          }}
        >
          使用 YouTube App／網站播放
        </a>

        <small>
          手機瀏覽器基於安全限制，不允許網頁載入後直接播放有聲音樂，因此需要按一次「立即播放」。
        </small>
      </section>
    </main>
  );
}
