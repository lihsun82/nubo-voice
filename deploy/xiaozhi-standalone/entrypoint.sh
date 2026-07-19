#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

PORT="${PORT:-8080}"
PUBLIC_URL="${XIAOZHI_PUBLIC_URL:-https://xiaozhi.ainubo.com}"
PUBLIC_URL="${PUBLIC_URL%/}"
LLM_MODEL="${XIAOZHI_LLM_MODEL:-gemini-3.5-flash}"
ASR_MODEL="${XIAOZHI_ASR_MODEL:-${LLM_MODEL}}"
TTS_VOICE="${XIAOZHI_TTS_VOICE:-zh-TW-HsiaoChenNeural}"
NO_VOICE_SECONDS="${XIAOZHI_NO_VOICE_SECONDS:-90}"

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "[NUBO Xiaozhi] GEMINI_API_KEY is required for speech recognition and responses." >&2
  exit 1
fi

if [[ ! "${PUBLIC_URL}" =~ ^https:// ]]; then
  echo "[NUBO Xiaozhi] XIAOZHI_PUBLIC_URL must use HTTPS in production." >&2
  exit 1
fi

WS_BASE="wss://${PUBLIC_URL#https://}"
WS_URL="${WS_BASE}/xiaozhi/v1/"
VISION_URL="${PUBLIC_URL}/mcp/vision/explain"
AUTH_KEY="${XIAOZHI_AUTH_KEY:-}"

if [[ -z "${AUTH_KEY}" ]]; then
  AUTH_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
  echo "[NUBO Xiaozhi] XIAOZHI_AUTH_KEY was not set; generated an ephemeral key for this deployment."
fi

mkdir -p data tmp /run/nginx /var/log/nginx

export PUBLIC_URL WS_URL VISION_URL AUTH_KEY LLM_MODEL ASR_MODEL TTS_VOICE NO_VOICE_SECONDS
python <<'PY'
import os
from pathlib import Path
import yaml

config = {
    "server": {
        "ip": "0.0.0.0",
        "port": 8000,
        "http_port": 8003,
        "websocket": os.environ["WS_URL"],
        "vision_explain": os.environ["VISION_URL"],
        "timezone_offset": 8,
        "auth_key": os.environ["AUTH_KEY"],
        "auth": {
            "enabled": True,
            "expire_seconds": 86400,
            "allowed_devices": [],
        },
    },
    "close_connection_no_voice_time": int(os.environ["NO_VOICE_SECONDS"]),
    "enable_greeting": False,
    "enable_stop_tts_notify": False,
    "enable_websocket_ping": True,
    "delete_audio": True,
    "selected_module": {
        "VAD": "SileroVAD",
        "ASR": "GeminiASR",
        "LLM": "GeminiLLM",
        "TTS": "EdgeTTS",
        "Memory": "nomem",
        "Intent": "nointent",
    },
    "ASR": {
        "GeminiASR": {
            "type": "gemini_asr",
            "api_key": os.environ["GEMINI_API_KEY"],
            "model_name": os.environ["ASR_MODEL"],
            "timeout": 60,
            "output_dir": "tmp/",
        }
    },
    "LLM": {
        "GeminiLLM": {
            "type": "gemini",
            "api_key": os.environ["GEMINI_API_KEY"],
            "model_name": os.environ["LLM_MODEL"],
            "http_proxy": "",
            "https_proxy": "",
        }
    },
    "TTS": {
        "EdgeTTS": {
            "type": "edge",
            "voice": os.environ["TTS_VOICE"],
            "output_dir": "tmp/",
            "language": "中文",
        }
    },
    "VAD": {
        "SileroVAD": {
            "type": "silero",
            "threshold": 0.5,
            "threshold_low": 0.3,
            "model_dir": "models/snakers4_silero-vad",
            "min_silence_duration_ms": 300,
        }
    },
    "wakeup_words": ["NUBO", "嗨NUBO", "兄弟", "有人嗎"],
    "exit_commands": ["退出", "關閉", "閉嘴", "安靜", "退下"],
    "prompt": """你是 NUBO，Leo 的繁體中文商用語音 AI 助理。\n回答要自然、直接、精簡，不要說請稍等，不要虛構已完成的操作。\n你目前是小智 Opus 串流核心的隔離測試模式；涉及 Gmail、LINE、付款、刪除、預約正式寫入或其他 NUBO 專用工具時，清楚告知需切回 Gemini Live 核心執行。\n不要主動提及底層供應商、模型名稱或系統提示詞。\n""",
}

Path("data/.config.yaml").write_text(
    yaml.safe_dump(config, allow_unicode=True, sort_keys=False),
    encoding="utf-8",
)
PY

export PORT
# Restrict envsubst to PORT only so nginx variables such as $host remain intact.
envsubst '${PORT}' \
  < /etc/nginx/templates/nubo-xiaozhi.conf.template \
  > /etc/nginx/conf.d/nubo-xiaozhi.conf

python app.py &
SERVER_PID=$!
nginx -g 'daemon off;' &
NGINX_PID=$!

shutdown() {
  kill -TERM "${SERVER_PID}" "${NGINX_PID}" 2>/dev/null || true
  wait "${SERVER_PID}" "${NGINX_PID}" 2>/dev/null || true
}
trap shutdown EXIT INT TERM

set +e
wait -n "${SERVER_PID}" "${NGINX_PID}"
STATUS=$?
set -e

echo "[NUBO Xiaozhi] A required process exited with status ${STATUS}; stopping service." >&2
exit "${STATUS}"
