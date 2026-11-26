"use client";

import { useEffect, useRef, useState } from "react";
import { useNuboKioskLanguage } from "@/lib/nubo-kiosk-language";

const MUSIC_COPY = {
  zh: { switchTrack: "新歌曲會自動替換並播放", pause: "暫停", resume: "繼續", auto: "自動播放中", stop: "停止" },
  en: { switchTrack: "New tracks play automatically", pause: "Pause", resume: "Resume", auto: "Autoplaying", stop: "Stop" },
  ja: { switchTrack: "新しい曲は自動で再生されます", pause: "一時停止", resume: "再開", auto: "自動再生中", stop: "停止" },
  ko: { switchTrack: "새 곡이 자동으로 재생됩니다", pause: "일시 정지", resume: "재개", auto: "자동 재생 중", stop: "정지" },
  vi: { switchTrack: "Bài mới sẽ tự động phát", pause: "Tạm dừng", resume: "Tiếp tục", auto: "Đang tự động phát", stop: "Dừng" },
};

const STATUS_TRANSLATIONS: Record<string, { en: string; ja: string; ko: string; vi: string }> = {
  "正在準備播放器…": { en: "Preparing player…", ja: "プレーヤーを準備中…", ko: "플레이어 준비 중…", vi: "Đang chuẩn bị trình phát…" },
  "背景播放中": { en: "Playing in background", ja: "バックグラウンド再生中", ko: "백그라운드 재생 중", vi: "Đang phát trong nền" },
  "播放中": { en: "Playing", ja: "再生中", ko: "재생 중", vi: "Đang phát" },
  "正在自動啟動有聲播放…": { en: "Starting audio…", ja: "音声を再生しています…", ko: "오디오 시작 중…", vi: "Đang bật âm thanh…" },
  "正在自動恢復播放器…": { en: "Restoring player…", ja: "プレーヤーを復旧中…", ko: "플레이어 복구 중…", vi: "Đang khôi phục trình phát…" },
  "正在自動恢復播放…": { en: "Resuming playback…", ja: "再生を再開しています…", ko: "재생 재개 중…", vi: "Đang phát tiếp…" },
  "已暫停": { en: "Paused", ja: "一時停止中", ko: "일시 정지됨", vi: "Đã tạm dừng" },
  "已停止": { en: "Stopped", ja: "停止しました", ko: "정지됨", vi: "Đã dừng" },
  "載入中…": { en: "Loading…", ja: "読み込み中…", ko: "로딩 중…", vi: "Đang tải…" },
  "播放完畢": { en: "Playback ended", ja: "再生が終了しました", ko: "재생 완료", vi: "Đã phát xong" },
  "正在自動解除播放限制…": { en: "Starting playback…", ja: "再生を開始しています…", ko: "재생 시작 중…", vi: "Đang bắt đầu phát…" },
  "這支影片無法內嵌播放，請重新指定歌曲。": { en: "This video can’t play here. Choose another track.", ja: "この動画は再生できません。別の曲を選んでください。", ko: "이 영상은 여기서 재생할 수 없습니다. 다른 곡을 선택해 주세요.", vi: "Không phát được video này. Vui lòng chọn bài khác." },
  "YouTube 連線失敗，正在等待重新連線…": { en: "Waiting to reconnect to YouTube…", ja: "YouTube への再接続を待っています…", ko: "YouTube 재연결 대기 중…", vi: "Đang chờ kết nối lại với YouTube…" },
  "正在重新連線 YouTube 播放器…": { en: "Reconnecting to YouTube…", ja: "YouTube に再接続中…", ko: "YouTube 재연결 중…", vi: "Đang kết nối lại với YouTube…" },
};

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
  mute: () => void;
  unMute: () => void;
  isMuted?: () => boolean;
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
  __nuboAudioPrimed?: boolean;
};

type TimerListRef = {
  current: number[];
};

const PLAYER_ELEMENT_ID = "nubo-inline-youtube-player-v14-5";
const NORMAL_VOLUME = 62;
const DUCK_VOLUME = 14;
const AUTO_RECOVERY_DELAYS = [0, 120, 350, 800, 1500, 3000, 6000, 10000, 15000];
const SOUND_PROMOTION_DELAYS = [0, 80, 220, 520, 1000, 2000];
const BACKGROUND_RETRY_DELAYS = [500, 1400, 3200, 6500];

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
  const desiredPlayingRef = useRef(true);
  const userPausedRef = useRef(false);
  const audioPrimedRef = useRef(false);
  const keepBackgroundPlaybackRef = useRef(false);
  const recoveryTimersRef = useRef<number[]>([]);
  const soundTimersRef = useRef<number[]>([]);
  const backgroundTimersRef = useRef<number[]>([]);

  const [song, setSong] = useState<InlineSong | null>(null);
  const [status, setStatus] = useState("正在準備播放器…");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUserPaused, setIsUserPaused] = useState(false);
  const { language } = useNuboKioskLanguage();
  const copy = MUSIC_COPY[language];

  const clearTimerList = (timers: TimerListRef) => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };

  const clearAutoRecovery = () => clearTimerList(recoveryTimersRef);
  const clearSoundPromotion = () => clearTimerList(soundTimersRef);
  const clearBackgroundRetries = () => clearTimerList(backgroundTimersRef);

  const applyAudibleSettings = (player: YouTubePlayer) => {
    player.setVolume(NORMAL_VOLUME);
    player.unMute();
  };

  const promoteSound = (player: YouTubePlayer, background = false) => {
    if (
      playerRef.current !== player ||
      !currentSongRef.current ||
      !desiredPlayingRef.current ||
      userPausedRef.current
    ) {
      return;
    }

    try {
      applyAudibleSettings(player);
      const state = player.getPlayerState();
      if (state !== 1 && state !== 3) player.playVideo();

      setIsPlaying(state === 1 || state === 3);
      setStatus(background ? "背景播放中" : "播放中");
      setMediaSessionPlaybackState("playing");

      if (!player.isMuted || player.isMuted() === false) {
        clearAutoRecovery();
      }
    } catch {
      // 後續自動重試會再解除靜音。
    }
  };

  const scheduleSoundPromotion = (player: YouTubePlayer) => {
    clearSoundPromotion();

    for (const delay of SOUND_PROMOTION_DELAYS) {
      const timer = window.setTimeout(() => {
        promoteSound(player, document.visibilityState === "hidden");
      }, delay);
      soundTimersRef.current.push(timer);
    }
  };

  const scheduleAutoRecovery = (nextSong: InlineSong) => {
    clearAutoRecovery();

    for (const delay of AUTO_RECOVERY_DELAYS) {
      const timer = window.setTimeout(() => {
        if (
          currentSongRef.current?.requestedAt !== nextSong.requestedAt ||
          !desiredPlayingRef.current ||
          userPausedRef.current ||
          !playerRef.current
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

          if (audioPrimedRef.current) {
            applyAudibleSettings(player);
          } else {
            player.mute();
          }

          player.playVideo();
          setStatus("正在自動啟動有聲播放…");
        } catch {
          setStatus("正在自動恢復播放器…");
        }
      }, delay);
      recoveryTimersRef.current.push(timer);
    }
  };

  const startCurrentSongAutomatically = (nextSong: InlineSong) => {
    const player = playerRef.current;
    currentSongRef.current = nextSong;
    desiredPlayingRef.current = true;
    userPausedRef.current = false;
    keepBackgroundPlaybackRef.current = false;
    setIsPlaying(false);
    setIsUserPaused(false);
    clearAutoRecovery();
    clearSoundPromotion();
    clearBackgroundRetries();

    if (!player || !readyRef.current) {
      setStatus("正在準備播放器…");
      return;
    }

    try {
      setStatus(`正在自動播放：${nextSong.title}`);
      player.setVolume(NORMAL_VOLUME);
      if (audioPrimedRef.current) player.unMute();
      player.loadVideoById(nextSong.videoId);
      player.playVideo();
      scheduleAutoRecovery(nextSong);
    } catch {
      scheduleAutoRecovery(nextSong);
      setStatus("正在自動恢復播放器…");
    }
  };

  const pausePlayback = () => {
    const player = playerRef.current;
    if (!player || !currentSongRef.current) return;

    desiredPlayingRef.current = false;
    userPausedRef.current = true;
    keepBackgroundPlaybackRef.current = false;
    clearAutoRecovery();
    clearSoundPromotion();
    clearBackgroundRetries();

    try {
      player.pauseVideo();
    } catch {
      // 狀態事件仍會同步介面。
    }

    setIsPlaying(false);
    setIsUserPaused(true);
    setStatus("已暫停");
    setMediaSessionPlaybackState("paused");
  };

  const resumePlayback = () => {
    const currentSong = currentSongRef.current;
    if (!currentSong) return;

    desiredPlayingRef.current = true;
    userPausedRef.current = false;
    setIsUserPaused(false);
    startCurrentSongAutomatically(currentSong);
  };

  const stopPlayback = () => {
    desiredPlayingRef.current = false;
    userPausedRef.current = false;
    keepBackgroundPlaybackRef.current = false;
    clearAutoRecovery();
    clearSoundPromotion();
    clearBackgroundRetries();

    try {
      playerRef.current?.stopVideo();
    } catch {
      // 即使播放器正在切換，也直接收起介面。
    }

    currentSongRef.current = null;
    setSong(null);
    setIsPlaying(false);
    setIsUserPaused(false);
    setStatus("已停止");
    setMediaSessionPlaybackState("none");
  };

  const scheduleBackgroundPlaybackRetries = () => {
    clearBackgroundRetries();

    for (const delay of BACKGROUND_RETRY_DELAYS) {
      const timer = window.setTimeout(() => {
        if (
          !keepBackgroundPlaybackRef.current ||
          !desiredPlayingRef.current ||
          userPausedRef.current ||
          !currentSongRef.current ||
          !playerRef.current
        ) {
          return;
        }

        try {
          const state = playerRef.current.getPlayerState();
          if (state !== 1 && state !== 3) playerRef.current.playVideo();
          promoteSound(playerRef.current, true);
        } catch {
          // 背景分頁可能被系統節流，下一輪再嘗試。
        }
      }, delay);
      backgroundTimersRef.current.push(timer);
    }
  };

  useEffect(() => {
    const host = window as unknown as YouTubeApiHost;
    audioPrimedRef.current = Boolean(host.__nuboAudioPrimed);

    const onAudioPrimed = () => {
      audioPrimedRef.current = true;
      const player = playerRef.current;
      const currentSong = currentSongRef.current;
      if (player && currentSong && desiredPlayingRef.current) {
        promoteSound(player, false);
        scheduleAutoRecovery(currentSong);
      }
    };

    window.addEventListener("nubo-audio-primed", onAudioPrimed);
    return () => window.removeEventListener("nubo-audio-primed", onAudioPrimed);
  }, []);

  useEffect(() => {
    const onPlay = (event: Event) => {
      const nextSong = readSongDetail(event);
      if (!nextSong) return;
      currentSongRef.current = nextSong;
      desiredPlayingRef.current = true;
      userPausedRef.current = false;
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
              // iframe 屬性無法修改時不影響自動控制。
            }

            event.target.setVolume(NORMAL_VOLUME);
            const pending = currentSongRef.current;
            if (pending) startCurrentSongAutomatically(pending);
          },
          onStateChange: (event: YouTubeEvent) => {
            if (event.data === 1) {
              setIsPlaying(true);
              setIsUserPaused(false);
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

              if (desiredPlayingRef.current && !userPausedRef.current) {
                const currentSong = currentSongRef.current;
                if (currentSong) scheduleAutoRecovery(currentSong);
                setStatus("正在自動恢復播放…");
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
              desiredPlayingRef.current = false;
              keepBackgroundPlaybackRef.current = false;
              clearAutoRecovery();
              clearBackgroundRetries();
              clearSoundPromotion();
              setIsPlaying(false);
              setStatus("播放完畢");
              setMediaSessionPlaybackState("none");
            }
          },
          onAutoplayBlocked: (event: YouTubeEvent) => {
            setIsPlaying(false);
            setStatus("正在自動解除播放限制…");

            try {
              event.target.mute();
              event.target.playVideo();
            } catch {
              // 自動重試會繼續處理。
            }

            const currentSong = currentSongRef.current;
            if (currentSong) scheduleAutoRecovery(currentSong);
          },
          onError: () => {
            setIsPlaying(false);
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
      clearAutoRecovery();
      clearSoundPromotion();
      clearBackgroundRetries();
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
      youtubeWindow.onYouTubeIframeAPIReady = previousReady;
    };
  }, [Boolean(song)]);

  useEffect(() => {
    if (song) startCurrentSongAutomatically(song);
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
          if (desiredPlayingRef.current && !userPausedRef.current) {
            scheduleSoundPromotion(player);
          }
        }
      } catch {
        // 播放器切換瞬間忽略音量控制錯誤。
      }
    };

    const onBeforeExternalTab = () => {
      const player = playerRef.current;
      if (
        !player ||
        !currentSongRef.current ||
        !desiredPlayingRef.current ||
        userPausedRef.current
      ) {
        return;
      }

      keepBackgroundPlaybackRef.current = true;
      promoteSound(player, true);
      scheduleBackgroundPlaybackRetries();
    };

    const onExternalTabBlocked = () => {
      keepBackgroundPlaybackRef.current = false;
      clearBackgroundRetries();
    };

    const onVisibilityChange = () => {
      const player = playerRef.current;
      const currentSong = currentSongRef.current;
      if (!player || !currentSong) return;

      if (document.visibilityState === "hidden") {
        if (desiredPlayingRef.current && !userPausedRef.current) {
          keepBackgroundPlaybackRef.current = true;
          scheduleBackgroundPlaybackRetries();
        }
        return;
      }

      clearBackgroundRetries();
      keepBackgroundPlaybackRef.current = false;

      if (desiredPlayingRef.current && !userPausedRef.current) {
        promoteSound(player, false);
        scheduleAutoRecovery(currentSong);
      }
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

  const statusText = language === "zh" ? status : STATUS_TRANSLATIONS[status]?.[language] ?? copy.auto;

  return (
    <aside className="nubo-inline-music" aria-live="polite">
      <div className="nubo-inline-music-frame" aria-hidden="true">
        <div id={PLAYER_ELEMENT_ID} />
      </div>

      <div className="nubo-inline-music-info">
        <strong>{song.title === "正在播放" ? copy.auto : song.title}</strong>
        {song.channelTitle ? <span>{song.channelTitle}</span> : null}
        <small>{statusText} · {copy.switchTrack}</small>
      </div>

      <div className="nubo-inline-music-controls">
        {isPlaying ? (
          <button
            type="button"
            className="nubo-inline-music-toggle"
            onClick={pausePlayback}
            aria-label={copy.pause}
          >
            {copy.pause}
          </button>
        ) : isUserPaused ? (
          <button
            type="button"
            className="nubo-inline-music-toggle"
            onClick={resumePlayback}
            aria-label={copy.resume}
          >
            {copy.resume}
          </button>
        ) : (
          <button
            type="button"
            className="nubo-inline-music-toggle"
            disabled
            aria-label={copy.auto}
          >
            {copy.auto}
          </button>
        )}
        <button
          type="button"
          className="nubo-inline-music-stop"
          onClick={stopPlayback}
          aria-label={copy.stop}
        >
          {copy.stop}
        </button>
      </div>
    </aside>
  );
}
