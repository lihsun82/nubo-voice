import { YouTubeAutoplayPlayer } from "@/components/YouTubeAutoplayPlayer";
import { headers } from "next/headers";

type SearchParams = Promise<{
  videoId?: string | string[];
  title?: string | string[];
  channel?: string | string[];
}>;

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] ?? "" : input ?? "";
}

export default async function YouTubePlayerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const videoId = value(params.videoId);
  const title = value(params.title) || "NUBO YouTube Player";
  const channelTitle = value(params.channel);
  const requestHeaders = await headers();
  const host = (
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "127.0.0.1:3000"
  )
    .split(",")[0]
    .trim();

  const proto = (
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("127.0.0.1") ||
    host.startsWith("localhost")
      ? "http"
      : "https")
  )
    .split(",")[0]
    .trim();

  const origin = `${proto}://${host}`;

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return (
      <main className="youtube-player-shell">
        <section className="youtube-player-card">
          <div className="error">缺少有效的YouTube影片ID。</div>
        </section>
      </main>
    );
  }

  return (
    <YouTubeAutoplayPlayer
      videoId={videoId}
      title={title}
      channelTitle={channelTitle}
      origin={origin}
    />
  );
}
