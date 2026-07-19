import asyncio
import base64
import io
import os
import wave
from typing import List, Optional, Tuple

import requests

from config.logger import setup_logging
from core.providers.asr.base import ASRProviderBase
from core.providers.asr.dto.dto import InterfaceType


TAG = __name__
logger = setup_logging()


class ASRProvider(ASRProviderBase):
    """Non-streaming speech recognition through Gemini audio understanding."""

    def __init__(self, config: dict, delete_audio_file: bool):
        super().__init__()
        self.interface_type = InterfaceType.NON_STREAM
        self.api_key = str(config.get("api_key", "")).strip()
        self.model_name = str(config.get("model_name", "gemini-3.5-flash")).strip()
        self.timeout = int(config.get("timeout", 60))
        self.output_dir = config.get("output_dir", "tmp/")
        self.delete_audio_file = delete_audio_file
        os.makedirs(self.output_dir, exist_ok=True)

        if not self.api_key:
            raise ValueError("Gemini ASR requires GEMINI_API_KEY")
        if not self.model_name:
            raise ValueError("Gemini ASR model name is empty")

    @staticmethod
    def _pcm_to_wav(pcm_bytes: bytes) -> bytes:
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(16000)
            wav_file.writeframes(pcm_bytes)
        return wav_buffer.getvalue()

    @staticmethod
    def _extract_text(payload: dict) -> str:
        candidates = payload.get("candidates") or []
        if not candidates:
            return ""
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(str(part.get("text", "")) for part in parts).strip()

        if text.startswith("```") and text.endswith("```"):
            text = text[3:-3].strip()
            if text.lower().startswith("text"):
                text = text[4:].lstrip("\n").strip()

        if len(text) >= 2 and text[0] == text[-1] and text[0] in {'"', "'"}:
            text = text[1:-1].strip()
        if text in {"空字串", "無", "沒有可辨識人聲"}:
            return ""
        return text

    def _transcribe(self, wav_bytes: bytes) -> str:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model_name}:generateContent"
        )
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": (
                                "請將這段音訊中的人聲逐字轉成繁體中文文字。"
                                "只輸出轉錄文字，不要解釋、不要加標題；"
                                "沒有可辨識人聲時輸出空字串。保留英文專有名詞。"
                            )
                        },
                        {
                            "inlineData": {
                                "mimeType": "audio/wav",
                                "data": base64.b64encode(wav_bytes).decode("ascii"),
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0,
                "maxOutputTokens": 512,
            },
        }
        response = requests.post(
            url,
            headers={
                "x-goog-api-key": self.api_key,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=self.timeout,
        )
        if not response.ok:
            detail = response.text.replace("\n", " ")[:500]
            raise RuntimeError(f"Gemini ASR HTTP {response.status_code}: {detail}")
        return self._extract_text(response.json())

    async def speech_to_text(
        self,
        opus_data: List[bytes],
        session_id: str,
        audio_format: str = "opus",
        artifacts: Optional[ASRProviderBase.AudioArtifacts] = None,
    ) -> Tuple[Optional[str], Optional[str]]:
        if artifacts is None or not artifacts.pcm_bytes:
            return "", None

        try:
            wav_bytes = self._pcm_to_wav(artifacts.pcm_bytes)
            text = await asyncio.to_thread(self._transcribe, wav_bytes)
            logger.bind(tag=TAG).info(f"Gemini ASR transcription: {text}")
            return text, artifacts.file_path
        except Exception as exc:
            logger.bind(tag=TAG).error(f"Gemini ASR failed: {exc}")
            return "", artifacts.file_path
