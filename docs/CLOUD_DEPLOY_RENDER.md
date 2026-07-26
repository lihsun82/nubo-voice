# NUBO Cloud + OmniRoute on Render

Branch: `feat/mobile-agent-omniroute-v6`

## Architecture

- `nubo-cloud`: public Next.js web service used by the phone/PWA.
- `nubo-omniroute`: OmniRoute 3.8.48 web service. NUBO reaches it over Render private networking.
- Both services use a 1 GB persistent disk so task/agent state and OmniRoute configuration survive restarts and deploys.

## Initial Blueprint deploy

1. In Render, choose **New > Blueprint**.
2. Connect GitHub repository `lihsun82/nubo-voice`.
3. Select branch `feat/mobile-agent-omniroute-v6`.
4. Blueprint path: `render.yaml`.
5. Render will prompt for two unsynced secrets:
   - `GEMINI_API_KEY`: copy the existing Gemini API key used by NUBO.
   - `INITIAL_PASSWORD`: choose a strong password for the OmniRoute dashboard.
6. Review and deploy the Blueprint.

## First OmniRoute setup

1. Open the generated `nubo-omniroute` public URL.
2. Sign in with `INITIAL_PASSWORD` and immediately change the password in OmniRoute settings.
3. Connect the desired free provider(s) in OmniRoute Providers.
4. In OmniRoute Dashboard > Endpoints / API Keys, create a dedicated key named `nubo-cloud`.
5. In Render > `nubo-cloud` > Environment, add:
   - `OMNIROUTE_API_KEY=<the dedicated nubo-cloud key>`
6. Redeploy only `nubo-cloud`.

## Verification

- Open `https://<nubo-cloud-host>/api/omniroute/health`.
- Expected result: `enabled: true`, `ok: true`, and `model: auto`.
- Open `https://<nubo-cloud-host>/api/providers` and confirm `omniroute` is configured.
- On the phone, disconnect Wi-Fi if desired and test over 4G/5G while the Windows PC is powered off.

## Safety boundaries

- LINE webhook and LINE command parsing are untouched.
- Gemini Live implementation is untouched.
- Windows-only actions remain unavailable while the PC is off, but cloud Agent/LLM routing continues.
- OmniRoute `/v1/*` requires an API key in production.
- Secrets are never committed to GitHub.
