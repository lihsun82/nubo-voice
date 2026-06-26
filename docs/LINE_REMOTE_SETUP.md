# NUBO LINE Remote Control

## Required local environment variables

Add these values to `C:\nubo-voice\.env.local` and never commit the file:

```env
LINE_CHANNEL_SECRET=replace_with_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=replace_with_channel_access_token
LINE_ALLOWED_USER_IDS=
NUBO_INTERNAL_URL=http://127.0.0.1:3000
NUBO_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

LINE voice control also requires `OPENAI_API_KEY` in `.env.local` for speech-to-text.

Leave `LINE_ALLOWED_USER_IDS` empty for the first pairing test. Send any text to the LINE Official Account. NUBO will reply with your LINE user ID but will not execute commands. Then place that ID in `LINE_ALLOWED_USER_IDS` and restart NUBO.

## LINE Developers settings

1. Use a Messaging API channel connected to the LINE Official Account.
2. Copy the Channel secret from Basic settings.
3. Issue a channel access token from Messaging API settings.
4. Set the webhook URL to your fixed HTTPS tunnel URL followed by `/api/line/webhook`.
5. Enable `Use webhook`.
6. Verify the webhook URL.
7. Enable webhook redelivery.

## Local status

Open:

- `http://127.0.0.1:3000/api/line/status`

A fully configured response has `ok: true` and `mode: authorized`.
For voice control, `voiceTranscriptionConfigured` must also be `true`.

## Supported text and voice commands

You can type these commands or send them as a LINE voice message:

- `播放 周杰倫 晴天`
- `開啟LINE`
- `開啟Gmail`
- `音量50`
- `提高音量10`
- `靜音`
- `解除靜音`
- `亮度60`
- `研究台南旅館最新房價趨勢`
- `查信 newer_than:1d`
- `列出任務`
- `NUBO狀態`
- `說明`

Voice messages are limited to 3 minutes and 24 MB. NUBO downloads the LINE audio, transcribes it, shows the recognized text, and then applies the same safe command rules used for text messages.

## Security model

- Webhook requests must pass LINE HMAC-SHA256 signature verification.
- Only one-to-one chats are accepted.
- Only user IDs in `LINE_ALLOWED_USER_IDS` can execute commands.
- Arbitrary shell commands, PowerShell, CMD, deletion, shutdown, payments, purchasing and direct email sending are blocked.
- The local NUBO port should not be directly exposed. Use a fixed HTTPS tunnel.
