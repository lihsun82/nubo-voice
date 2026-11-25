#!/usr/bin/env python3
"""Offline-first A/B tester for two Yating Taiwanese female TTS voices.

Real synthesis runs ONLY when the operator explicitly supplies YATING_API_KEY.
It never changes the hotel NUBO production voice, PMS, or LINE settings.

Official contract: POST https://tts.api.yating.tw/v2/speeches/short
  header: key
  voice.model: tai_female_1 | tai_female_2
  encoding: LINEAR16, sampleRate: 16K
"""
from __future__ import annotations

import argparse
import base64
import binascii
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import wave

API = "https://tts.api.yating.tw/v2/speeches/short"
VOICES = [
    ("A", "雅婷", "tai_female_1"),
    ("B", "意晴", "tai_female_2"),
]
# Identical wording, pitch, energy and speed across A and B.
# Three test-only utterances. No real availability/price or guest data.
SENTENCES = [
    ("01_迎賓", "你好，歡迎來新寶智慧酒店。恁今仔日欲住宿，抑是欲休息？"),
    ("02_查房", "恁是兩个人欲住一暝，著無？我來共恁看覓有空房無。"),
    ("03_替代房型", "歹勢，這款房間這馬無空房。咱閣有別款房間，恁欲參考看覓無？"),
]
MAX_INPUT_UNITS = 600


def character_units(text: str) -> int:
    return sum(2 if ord(ch) > 127 else 1 for ch in text)


def payload(model: str, text: str) -> dict:
    if model not in {v[2] for v in VOICES}:
        raise ValueError("Only the two designated Taiwanese voices are allowed")
    if not text or character_units(text) > MAX_INPUT_UNITS:
        raise ValueError("Input text empty or too long")
    return {
        "input": {"text": text, "type": "text"},
        "voice": {"model": model, "speed": 1.0, "pitch": 1.0, "energy": 1.0},
        "audioConfig": {"encoding": "LINEAR16", "sampleRate": "16K"},
    }


def parse_wave_response(raw: bytes) -> tuple[bytes, float]:
    data = json.loads(raw.decode("utf-8"))
    audio64 = data.get("audioContent")
    if not isinstance(audio64, str) or not audio64:
        raise ValueError("Provider did not return audioContent")
    try:
        sound = base64.b64decode(audio64, validate=True)
    except binascii.Error as e:
        raise ValueError("Provider returned invalid Base64 audio") from e
    if len(sound) > 15_000_000 or not sound.startswith(b"RIFF") or sound[8:12] != b"WAVE":
        raise ValueError("Provider did not return a valid WAV container")
    import io
    with wave.open(io.BytesIO(sound), "rb") as wav:
        if wav.getframerate() != 16000 or wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise ValueError("Unexpected PCM encoding returned from Yating")
        duration = wav.getnframes() / wav.getframerate()
    if duration <= 0:
        raise ValueError("WAV duration was empty")
    return sound, duration


def synthesize(key: str, model: str, text: str, timeout: int = 150) -> tuple[bytes, float, float]:
    request = urllib.request.Request(
        API,
        data=json.dumps(payload(model, text), ensure_ascii=False).encode("utf-8"),
        headers={"key": key, "Content-Type": "application/json"},
        method="POST",
    )
    begin = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 201:
                raise ValueError(f"Unexpected provider HTTP status {response.status}")
            raw = response.read(20_000_000)
    except urllib.error.HTTPError as e:
        # Do not print request headers, full request, token or user information.
        raise RuntimeError(f"Yating API HTTP {e.code}; check key, quota or request settings") from None
    audio, duration = parse_wave_response(raw)
    return audio, duration, time.monotonic() - begin


def run(key: str, destination: Path, samples: int) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    result = []
    for label, text in SENTENCES[:samples]:
        for variant, name, model in VOICES:
            audio, duration, wall = synthesize(key, model, text)
            file_name = f"{label}_{variant}_{model}.wav"
            (destination / file_name).write_bytes(audio)
            result.append({
                "test": label, "voice": model, "name": name,
                "duration_seconds": round(duration, 3),
                "request_seconds": round(wall, 3),
                "file": file_name, "text": text,
            })
            print(f"OK {label} | {variant} {name} | {duration:.2f}s audio | {wall:.2f}s API")

    (destination / "results.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    lines = [
        "# NUBO 台語女聲 A/B 試音報告（客觀技術資料）", "",
        "這是獨立試音，並非 NUBO 正式聲線；沒有修改 PMS 或訂單。",
        "A：tai_female_1（雅婷），B：tai_female_2（意晴）。",
        "兩者均以語速 1.0、音高 1.0、能量 1.0、LINEAR16、16 kHz 生成。",
        "", "| 場景 | A 音檔 | A API 秒數 | B 音檔 | B API 秒數 |",
        "|---|---|---:|---|---:|",
    ]
    for label, text in SENTENCES[:samples]:
        row_a = next(row for row in result if row["test"] == label and row["voice"] == "tai_female_1")
        row_b = next(row for row in result if row["test"] == label and row["voice"] == "tai_female_2")
        lines.append(
            f"| {label} | {row_a['file']} | {row_a['request_seconds']} | "
            f"{row_b['file']} | {row_b['request_seconds']} |"
        )
    lines.extend([
        "", "## 試聽評分（請由懂台灣台語的人評估）",
        "- 腔調、聲調與連讀自然度：40%",
        "- 台語咬字與詞彙清楚度：30%",
        "- 旅館接待的親切感：20%",
        "- API 延遲：10%",
        "重要：只憑 API 回應秒數不能宣稱 A 或 B 的台語腔調比較道地。",
        "若真人無法辨識或覺得國語腔明顯，應先拒絕導入正式 NUBO。",
        "如要正式串接，需另評估同步 TTS 對話延遲、收音打斷、音訊串流設計。",
    ])
    (destination / "README_試聽說明.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"A/B audio and report saved under {destination}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="yating-taigi-ab-output")
    parser.add_argument("--samples", type=int, choices=[1, 3], default=3)
    args = parser.parse_args()
    key = os.getenv("YATING_API_KEY", "").strip()
    if not key:
        print("YATING_API_KEY is not configured; no requests sent. Add it as a GitHub Actions secret.")
        return 2
    try:
        run(key, Path(args.output), args.samples)
    except (ValueError, RuntimeError, urllib.error.URLError, TimeoutError) as exc:
        print(f"Audio synthesis failed: {type(exc).__name__}: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
