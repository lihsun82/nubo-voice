"use client";

import { useMemo } from "react";

type Props = {
  videoId: string;
  title: string;
  channelTitle: string;
  origin: string;
};

export function YouTubeAutoplayPlayer({
  videoId,
  title,
  channelTitle,
  origin,
}: Props) {
  const src = useMemo(() => {
    const params = new URLSearchParams({
      autoplay: "1",
      playsinline: "1",
      controls: "1",
      rel: "0",
      enablejsapi: "1",
      origin,
    });
    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
  }, [origin, videoId]);

  return (
    <main className="youtube-player-shell">
      <section className="youtube-player-card">
        <div className="eyebrow">NUBO MUSIC PLAYER</div>
        <h1>{title}</h1>
        <p>{channelTitle}</p>
        <div className="youtube-frame-wrap">
          <iframe
            key={videoId}
            src={src}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <small>
          此視窗由NUBO專用自動播放模式啟動；播放器仍受YouTube影片本身的地區、年齡與嵌入限制影響。
        </small>
      </section>
    </main>
  );
}
