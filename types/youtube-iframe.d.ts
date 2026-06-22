interface YouTubeIframePlayer {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  stopVideo: () => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  getPlayerState: () => number;
  destroy: () => void;
}

interface Window {
  YT?: {
    Player: new (
      elementId: string,
      options: Record<string, unknown>,
    ) => YouTubeIframePlayer;
    PlayerState?: { PLAYING: number };
  };
  onYouTubeIframeAPIReady?: () => void;
}
