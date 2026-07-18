"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "@/components/NuboVisionPanel.module.css";

type FacingMode = "environment" | "user";
type VisionMode = "off" | "preview" | "continuous";
type VisionCommand =
  | "open"
  | "analyze"
  | "continuous"
  | "stop-continuous"
  | "switch"
  | "front"
  | "back"
  | "close";

type VisionStatusDetail = {
  ok?: boolean;
  message?: string;
};

type VisionCommandDetail = {
  action?: VisionCommand;
};

const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 480;
const CONTINUOUS_INTERVAL_MS = 1_000;

function dataUrlToBase64(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function NuboVisionPanel() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const facingModeRef = useRef<FacingMode>("environment");

  const [facingMode, setFacingMode] =
    useState<FacingMode>("environment");
  const [mode, setMode] =
    useState<VisionMode>("off");
  const [status, setStatus] = useState(
    "鏡頭關閉。畫面只會即時分析，不會由NUBO保存。",
  );
  const [busy, setBusy] = useState(false);

  const clearContinuousTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopCamera = () => {
    clearContinuousTimer();
    streamRef.current?.getTracks().forEach((track) =>
      track.stop(),
    );
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setMode("off");
    setBusy(false);
    setStatus(
      "鏡頭已關閉。畫面沒有保存。",
    );
  };

  const startCamera = async (
    requestedFacingMode: FacingMode = facingModeRef.current,
  ) => {
    setBusy(true);
    setStatus("正在取得攝影機權限…");

    streamRef.current?.getTracks().forEach((track) =>
      track.stop(),
    );

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: requestedFacingMode,
            },
            width: { ideal: FRAME_WIDTH },
            height: { ideal: FRAME_HEIGHT },
          },
          audio: false,
        });

      streamRef.current = stream;
      facingModeRef.current = requestedFacingMode;
      setFacingMode(requestedFacingMode);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setMode("preview");
      setStatus(
        requestedFacingMode === "environment"
          ? "後鏡頭已開啟。可按「看一眼辨識」或「持續觀察」。"
          : "前鏡頭已開啟。可按「看一眼辨識」或「持續觀察」。",
      );
      return true;
    } catch (error) {
      setMode("off");
      setStatus(
        error instanceof Error
          ? `無法開啟鏡頭：${error.message}`
          : "無法開啟鏡頭，請檢查瀏覽器權限。",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const captureFrame = (
    prompt?: string,
  ) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (
      !video ||
      !canvas ||
      !streamRef.current ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      setStatus("鏡頭畫面尚未就緒。");
      return false;
    }

    const sourceWidth = video.videoWidth || FRAME_WIDTH;
    const sourceHeight = video.videoHeight || FRAME_HEIGHT;
    const scale = Math.min(
      FRAME_WIDTH / sourceWidth,
      FRAME_HEIGHT / sourceHeight,
      1,
    );
    const width = Math.max(
      1,
      Math.round(sourceWidth * scale),
    );
    const height = Math.max(
      1,
      Math.round(sourceHeight * scale),
    );

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", {
      alpha: false,
    });
    if (!context) {
      setStatus("瀏覽器無法擷取鏡頭畫面。");
      return false;
    }

    context.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL(
      "image/jpeg",
      0.72,
    );

    window.dispatchEvent(
      new CustomEvent("nubo-vision-frame", {
        detail: {
          data: dataUrlToBase64(dataUrl),
          mimeType: "image/jpeg",
          prompt,
        },
      }),
    );

    return true;
  };

  const analyzeOnce = async () => {
    if (!streamRef.current) {
      const started = await startCamera();
      if (!started) return;
      await new Promise((resolve) =>
        window.setTimeout(resolve, 450),
      );
    }

    const sent = captureFrame(
      "請分析剛剛的鏡頭畫面，用繁體中文簡潔說明你看見的人數、人物外觀或動作、主要物品、可讀文字與明顯環境狀況。不要猜測或辨識人物姓名；不確定時要明確說不確定。",
    );

    if (sent) {
      setStatus(
        "畫面已送給NUBO分析，正在等待語音回答。",
      );
    }
  };

  const startContinuous = async () => {
    if (!streamRef.current) {
      const started = await startCamera();
      if (!started) return;
      await new Promise((resolve) =>
        window.setTimeout(resolve, 450),
      );
    }

    clearContinuousTimer();
    setMode("continuous");
    setStatus(
      "持續觀察中：每秒最多傳送一張畫面。你可以直接問NUBO眼前有什麼。",
    );

    captureFrame();
    timerRef.current = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        streamRef.current
      ) {
        captureFrame();
      }
    }, CONTINUOUS_INTERVAL_MS);
  };

  const stopContinuous = () => {
    clearContinuousTimer();
    setMode(streamRef.current ? "preview" : "off");
    setStatus(
      streamRef.current
        ? "已停止持續傳送，鏡頭預覽仍開啟。"
        : "鏡頭已關閉。",
    );
  };

  const switchCamera = async () => {
    const next: FacingMode =
      facingModeRef.current === "environment"
        ? "user"
        : "environment";
    clearContinuousTimer();
    await startCamera(next);
  };

  useEffect(() => {
    const handleStatus = (event: Event) => {
      const detail = (
        event as CustomEvent<VisionStatusDetail>
      ).detail;
      if (detail?.message) {
        setStatus(detail.message);
      }
    };

    const handleCommand = (event: Event) => {
      const action = (
        event as CustomEvent<VisionCommandDetail>
      ).detail?.action;

      if (action === "open") {
        void startCamera();
      } else if (action === "analyze") {
        void analyzeOnce();
      } else if (action === "continuous") {
        void startContinuous();
      } else if (action === "stop-continuous") {
        stopContinuous();
      } else if (action === "switch") {
        void switchCamera();
      } else if (action === "front") {
        clearContinuousTimer();
        void startCamera("user");
      } else if (action === "back") {
        clearContinuousTimer();
        void startCamera("environment");
      } else if (action === "close") {
        stopCamera();
      }
    };

    const stopWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        stopCamera();
      }
    };

    window.addEventListener(
      "nubo-vision-status",
      handleStatus,
    );
    window.addEventListener(
      "nubo-vision-command",
      handleCommand,
    );
    document.addEventListener(
      "visibilitychange",
      stopWhenHidden,
    );

    return () => {
      window.removeEventListener(
        "nubo-vision-status",
        handleStatus,
      );
      window.removeEventListener(
        "nubo-vision-command",
        handleCommand,
      );
      document.removeEventListener(
        "visibilitychange",
        stopWhenHidden,
      );
      clearContinuousTimer();
      streamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());
    };
  }, []);

  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <div className="provider-label">
            NUBO VISION
          </div>
          <strong>即時鏡頭辨識</strong>
          <small>{status}</small>
        </div>
        <span className={styles.badge}>
          {mode === "continuous"
            ? "持續觀察"
            : mode === "preview"
              ? "鏡頭已開啟"
              : "隱私待命"}
        </span>
      </div>

      <div className={styles.previewWrap}>
        <video
          ref={videoRef}
          className={styles.preview}
          autoPlay
          muted
          playsInline
        />
        {mode === "off" ? (
          <div className={styles.placeholder}>
            <b>鏡頭未啟用</b>
            <span>
              啟用後可辨識人物數量、衣著動作、物品、文字與環境。
            </span>
          </div>
        ) : null}
        <canvas
          ref={canvasRef}
          className={styles.hiddenCanvas}
        />
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className="secondary"
          disabled={busy || mode !== "off"}
          onClick={() => void startCamera()}
        >
          開啟鏡頭
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => void analyzeOnce()}
        >
          看一眼辨識
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || mode === "continuous"}
          onClick={() => void startContinuous()}
        >
          持續觀察
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || mode === "off"}
          onClick={() => void switchCamera()}
        >
          切換{facingMode === "environment" ? "前" : "後"}鏡頭
        </button>
        {mode === "continuous" ? (
          <button
            type="button"
            className="secondary"
            onClick={stopContinuous}
          >
            停止觀察
          </button>
        ) : null}
        <button
          type="button"
          className="secondary"
          disabled={mode === "off"}
          onClick={stopCamera}
        >
          關閉鏡頭
        </button>
      </div>

      <p className={styles.privacy}>
        第一版只描述畫面，不建立臉部資料庫、不辨識姓名、不保存照片；切到背景或關閉頁面時會立即停止攝影機。
      </p>
    </section>
  );
}
