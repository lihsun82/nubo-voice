# NUBO Xiaozhi Voice Provider V1

## Scope

NUBO now exposes two selectable voice cores:

1. Gemini Live — the existing production voice path and NUBO browser tools.
2. Xiaozhi Opus — an optional self-hosted Xiaozhi H5/WebSocket voice path.

The implementation intentionally does not contain or default to any public third-party Xiaozhi endpoint. Customer, hotel, booking, collection, or sales data must only use an independently controlled backend.

## Runtime configuration

Set these variables on the NUBO deployment when the self-hosted Xiaozhi service is ready:

```env
XIAOZHI_H5_URL=https://xiaozhi.example.com/h5/index.html
XIAOZHI_WS_URL=wss://xiaozhi.example.com/xiaozhi/v1/
```

`XIAOZHI_H5_URL` is used by the NUBO provider panel. `XIAOZHI_WS_URL` is exposed only as a readiness/status field for the future native protocol bridge; no token or secret is returned to the browser.

A user can also save an HTTPS H5 URL locally on one device from the Xiaozhi panel. The local value overrides the environment URL on that device.

## Security boundaries

- HTTPS/WSS is required outside localhost.
- No Chinese public test endpoint is hardcoded.
- Switching providers stops the active Gemini audio output before mounting Xiaozhi.
- Xiaozhi is isolated from the stable LINE webhook, LINE verification, command parser, and desktop-control functions.
- An embedded H5 page receives only the browser permissions explicitly granted by the user.

## Deployment dependency

This repository does not bundle the full xiaozhi-esp32-server runtime. That service requires its own deployment, model/provider credentials, access control, logging, privacy review, and security hardening. The upstream project itself warns that it has not passed a production network-security assessment, so it must not be exposed unchanged for commercial guest data.

## Protocol notes

The upstream protocol uses WebSocket text messages plus binary Opus frames, normally 16 kHz mono input and 60 ms frames. Direct browser integration therefore requires a proper Opus encoder/decoder or the upstream H5 client. V1 uses the H5 client path to avoid pretending that raw browser PCM is protocol-compatible.

## Rollback

Stable checkpoint before this integration:

`stable-2026-07-19-before-xiaozhi-provider-v1`
