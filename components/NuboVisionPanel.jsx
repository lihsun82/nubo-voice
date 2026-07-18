"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/components/NuboVisionPanel.module.css";

const CAMERA_WIDTH = 640;
const CAMERA_HEIGHT = 480;
const FAST_MAX_WIDTH = 384;
const FAST_MAX_HEIGHT = 384;
const DETAIL_MAX_WIDTH = 720;
const DETAIL_MAX_HEIGHT = 540;
const FAST_JPEG_QUALITY = 0.52;
const DETAIL_JPEG_QUALITY = 0.72;
const CONTINUOUS_INTERVAL_MS = 2000;
const CONTINUOUS_MAX_MS = 30000;
const MOTION_THRESHOLD = 7.5;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("影像轉換失敗"));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

function buildFrameSignature(context, width, height) {
  const image = context.getImageData(0, 0, width, height).data;
  const stepX = Math.max(1, Math.floor(width / 16));
  const stepY = Math.max(1, Math.floor(height / 12));
  const signature = [];

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const index = (y * width + x) * 4;
      const luminance =
        image[index] * 0.299 +
        image[index + 1] * 0.587 +
        image[index + 2] * 0.114;
      signature.push(luminance);
    }
  }

  return signature;
}

function hasMeaningfulChange(previous, next) {
  if (!previous || previous.length !== next.length) return true;

  let difference = 0;
  for (let index = 0; index < next.length; index += 1) {
    difference += Math.abs(next[index] - previous[index]);
  }

  return difference / next.length >= MOTION_THRESHOLD;
}

export function NuboVisionPanel() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const stopTimerRef = useRef(null);
  const facingModeRef = useRef("environment");
  const captureBusyRef = useRef(false);
  const lastSignatureRef = useRef(null);
  const sentFramesRef = useRef(0);
  const skippedFramesRef = useRef(0);

  const [facingMode, setFacingMode] = useState("environment");
  const [mode, setMode] = useState("off");
  const [status, setStatus] = useState(
    "鏡頭關閉。快速模式會壓縮到384像素內，畫面不由NUBO保存。",
  );
  const [busy, setBusy] = useState(false);

  const clearContinuousTimers = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  };

  const releaseCamera = (nextStatus) => {
    clearContinuousTimers();
    captureBusyRef.current = false;
    lastSignatureRef.current = null;
    sentFramesRef.current = 0;
    skippedFramesRef.current = 0;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setMode("off");
    setBusy(false);
    setStatus(nextStatus || "鏡頭已關閉。畫面沒有保存。");
  };

  const stopCamera = () => {
    releaseCamera("鏡頭已關閉。畫面沒有保存。");
  };

  const startCamera = async (
    requestedFacingMode = facingModeRef.current,
  ) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("這個瀏覽器不支援攝影機，請使用最新版Chrome或Safari。");
      return false;
    }

    setBusy(true);
    setStatus("正在取得攝影機權限…");

    streamRef.current?.getTracks().forEach((track) => track.stop());
    lastSignatureRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: requestedFacingMode },
          width: { ideal: CAMERA_WIDTH },
          height: { ideal: CAMERA_HEIGHT },
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
          ? "後鏡頭已開啟。快速辨識最省流量，高細節適合小字。"
          : "前鏡頭已開啟。快速辨識最省流量，高細節適合小字。",
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

  const captureFrame = async ({
    prompt,
    detail = false,
    skipIfUnchanged = false,
  } = {}) => {
    if (captureBusyRef.current) return false;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (
      !video ||
      !canvas ||
      !streamRef.current ||
      video.readyState < 2
    ) {
      setStatus("鏡頭畫面尚未就緒。");
      return false;
    }

    captureBusyRef.current = true;
    const encodeStartedAt = performance.now();

    try {
      const sourceWidth = video.videoWidth || CAMERA_WIDTH;
      const sourceHeight = video.videoHeight || CAMERA_HEIGHT;
      const maxWidth = detail ? DETAIL_MAX_WIDTH : FAST_MAX_WIDTH;
      const maxHeight = detail ? DETAIL_MAX_HEIGHT : FAST_MAX_HEIGHT;
      const scale = Math.min(
        maxWidth / sourceWidth,
        maxHeight / sourceHeight,
        1,
      );
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));

      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
      });
      if (!context) {
        setStatus("瀏覽器無法擷取鏡頭畫面。");
        return false;
      }

      context.drawImage(video, 0, 0, width, height);

      if (skipIfUnchanged) {
        const signature = buildFrameSignature(context, width, height);
        if (!hasMeaningfulChange(lastSignatureRef.current, signature)) {
          skippedFramesRef.current += 1;
          setStatus(
            `持續觀察中：畫面沒有明顯變化，已省略${skippedFramesRef.current}張重複影格。`,
          );
          return false;
        }
        lastSignatureRef.current = signature;
      }

      const quality = detail ? DETAIL_JPEG_QUALITY : FAST_JPEG_QUALITY;
      const blob = await canvasToBlob(canvas, quality);
      if (!blob) {
        setStatus("鏡頭畫面壓縮失敗，請再試一次。");
        return false;
      }

      const data = await blobToBase64(blob);
      const encodeMs = Math.round(performance.now() - encodeStartedAt);
      const kilobytes = Math.max(1, Math.round(blob.size / 1024));

      window.dispatchEvent(
        new CustomEvent("nubo-vision-frame", {
          detail: {
            data,
            mimeType: "image/jpeg",
            prompt,
            mode: detail ? "detail" : "fast",
            bytes: blob.size,
            encodeMs,
          },
        }),
      );

      sentFramesRef.current += 1;
      setStatus(
        prompt
          ? `${detail ? "高細節" : "快速"}畫面已送出：${width}×${height}、約${kilobytes}KB、壓縮${encodeMs}ms。`
          : `持續觀察中：已送${sentFramesRef.current}張，省略${skippedFramesRef.current}張重複影格。`,
      );
      return true;
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `鏡頭畫面處理失敗：${error.message}`
          : "鏡頭畫面處理失敗。",
      );
      return false;
    } finally {
      captureBusyRef.current = false;
    }
  };

  const analyzeOnce = async (detail = false) => {
    if (!streamRef.current) {
      const started = await startCamera();
      if (!started) return;
      await new Promise((resolve) => window.setTimeout(resolve, 420));
    }

    const sent = await captureFrame({
      detail,
      prompt: detail
        ? "請分析這張高細節鏡頭畫面。用繁體中文最多四句回答，優先讀取小字、標籤、文件與細節，再說人物數量、動作和主要物品。不要猜人物姓名；不確定要明確說不確定。"
        : "請快速分析這張鏡頭畫面。用繁體中文最多三句回答：先說這是什麼或主要看見什麼，再補人物數量、動作、主要物品或明顯文字。不要猜人物姓名；不確定要明確說不確定。",
    });

    if (sent) {
      window.setTimeout(() => {
        releaseCamera("畫面已送給NUBO分析，鏡頭已自動關閉且照片未保存。");
      }, 180);
    }
  };

  const startContinuous = async () => {
    if (!streamRef.current) {
      const started = await startCamera();
      if (!started) return;
      await new Promise((resolve) => window.setTimeout(resolve, 420));
    }

    clearContinuousTimers();
    lastSignatureRef.current = null;
    sentFramesRef.current = 0;
    skippedFramesRef.current = 0;
    setMode("continuous");
    setStatus(
      "省流量持續觀察：每2秒檢查一次，只傳送有明顯變化的畫面，30秒後自動停止。",
    );

    await captureFrame({ skipIfUnchanged: true });
    timerRef.current = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        streamRef.current
      ) {
        void captureFrame({ skipIfUnchanged: true });
      }
    }, CONTINUOUS_INTERVAL_MS);

    stopTimerRef.current = window.setTimeout(() => {
      clearContinuousTimers();
      setMode(streamRef.current ? "preview" : "off");
      setStatus(
        `持續觀察已自動停止：共送${sentFramesRef.current}張，省略${skippedFramesRef.current}張重複影格。`,
      );
    }, CONTINUOUS_MAX_MS);
  };

  const stopContinuous = () => {
    clearContinuousTimers();
    setMode(streamRef.current ? "preview" : "off");
    setStatus(
      streamRef.current
        ? `已停止持續觀察：共送${sentFramesRef.current}張，省略${skippedFramesRef.current}張重複影格。`
        : "鏡頭已關閉。",
    );
  };

  const switchCamera = async () => {
    const next =
      facingModeRef.current === "environment" ? "user" : "environment";
    clearContinuousTimers();
    await startCamera(next);
  };

  useEffect(() => {
    const handleStatus = (event) => {
      if (event.detail?.message) {
        setStatus(event.detail.message);
      }
    };

    const handleCommand = (event) => {
      const action = event.detail?.action;

      if (action === "open") {
        void startCamera();
      } else if (action === "analyze") {
        void analyzeOnce(false);
      } else if (action === "continuous") {
        void startContinuous();
      } else if (action === "stop-continuous") {
        stopContinuous();
      } else if (action === "switch") {
        void switchCamera();
      } else if (action === "front") {
        clearContinuousTimers();
        void startCamera("user");
      } else if (action === "back") {
        clearContinuousTimers();
        void startCamera("environment");
      } else if (action === "close") {
        stopCamera();
      }
    };

    const stopWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        releaseCamera("NUBO進入背景，鏡頭已自動關閉且畫面未保存。");
      }
    };

    window.addEventListener("nubo-vision-status", handleStatus);
    window.addEventListener("nubo-vision-command", handleCommand);
    document.addEventListener("visibilitychange", stopWhenHidden);

    return () => {
      window.removeEventListener("nubo-vision-status", handleStatus);
      window.removeEventListener("nubo-vision-command", handleCommand);
      document.removeEventListener("visibilitychange", stopWhenHidden);
      clearContinuousTimers();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <div className="provider-label">NUBO VISION FAST</div>
          <strong>快速、省流量鏡頭辨識</strong>
          <small>{status}</small>
        </div>
        <span className={styles.badge}>
          {mode === "continuous"
            ? "省流量觀察"
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
              一般物品使用快速辨識；小字、標籤與文件才使用高細節。
            </span>
          </div>
        ) : null}
        <canvas ref={canvasRef} className={styles.hiddenCanvas} />
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
          onClick={() => void analyzeOnce(false)}
        >
          快速看一眼
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void analyzeOnce(true)}
        >
          高細節辨識
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || mode === "continuous"}
          onClick={() => void startContinuous()}
        >
          省流量持續觀察
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
          <button type="button" className="secondary" onClick={stopContinuous}>
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
        快速模式將影像限制在384像素內；持續模式每2秒檢查一次並略過重複畫面。照片不保存，切到背景會立即關閉鏡頭。
      </p>
    </section>
  );
}
