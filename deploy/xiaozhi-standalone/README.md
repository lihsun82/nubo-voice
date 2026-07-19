# NUBO Xiaozhi Standalone

This directory contains an isolated Railway deployment for the Xiaozhi Opus voice core. It does not replace the existing NUBO Next.js service and does not modify stable LINE control code.

## Architecture

One Railway service exposes:

- H5 client: `https://xiaozhi.ainubo.com/`
- OTA bootstrap: `https://xiaozhi.ainubo.com/xiaozhi/ota/`
- Opus WebSocket: `wss://xiaozhi.ainubo.com/xiaozhi/v1/`
- Healthcheck: `https://xiaozhi.ainubo.com/health`

The service uses upstream `xinnan-tech/xiaozhi-esp32-server` pinned to tag `v0.9.5`, OpenAI transcription, Gemini text generation and Edge TTS. WebSocket authentication is enabled and OTA issues a temporary bearer token to the browser client.

The upstream Live2D runtime and models are removed from this deployment. The NUBO build retains the Opus voice client only.

## Railway service creation

Create a new service in the same Railway project as NUBO and connect repository `lihsun82/nubo-voice`, branch `hybrid-cloud-v1`.

Set **Config as Code path** to:

```text
/deploy/xiaozhi-standalone/railway.toml
```

Do not set a custom Start Command; the Dockerfile entrypoint starts the Python voice server and nginx.

Add these required variables:

```env
GEMINI_API_KEY=<same private Gemini key used by NUBO>
OPENAI_API_KEY=<same private OpenAI key used by NUBO>
XIAOZHI_PUBLIC_URL=https://xiaozhi.ainubo.com
XIAOZHI_AUTH_KEY=<random secret of at least 32 bytes>
```

Recommended optional variables:

```env
XIAOZHI_LLM_MODEL=gemini-2.5-flash
XIAOZHI_ASR_MODEL=gpt-4o-mini-transcribe
XIAOZHI_TTS_VOICE=zh-TW-HsiaoChenNeural
XIAOZHI_NO_VOICE_SECONDS=90
```

Generate a Railway public domain first and confirm `/health` returns HTTP 200.

## Custom domain

In Railway, add custom domain `xiaozhi.ainubo.com` to the service's HTTP target port. Railway will provide both CNAME and TXT records. Add both records in Cloudflare and wait for verification.

After the domain is active, add these variables to the existing NUBO Railway service:

```env
XIAOZHI_H5_URL=https://xiaozhi.ainubo.com/
XIAOZHI_WS_URL=wss://xiaozhi.ainubo.com/xiaozhi/v1/
```

Redeploy the existing NUBO service. The `小智 Opus` provider should then show as configured.

## Smoke test

1. Open `https://xiaozhi.ainubo.com/health`; expect `Server is running`.
2. Open `https://xiaozhi.ainubo.com/` and allow microphone access.
3. Press the phone/dial button and confirm the status changes from offline to connected.
4. Speak a short Traditional Chinese sentence and verify STT text plus streamed audio response.
5. Open `https://nubo.ainubo.com`, select `小智 Opus`, and start it inside NUBO.
6. Switch back to Gemini Live and confirm the original NUBO functions remain available.

## Security boundary

- No public Xiaozhi or third-party Chinese backend endpoint is embedded.
- The WebSocket is authenticated through OTA-issued bearer tokens.
- Camera and vision UI are disabled.
- Live2D code and model assets are removed.
- Xiaozhi mode is isolated from NUBO Gmail, LINE, payment and privileged automation tools.
- Production rollout still requires rate limiting, audit logs, secret rotation and an application-layer WAF before handling real guest or collection data.
