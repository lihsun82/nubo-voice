# NUBO Web UI V22.1 — Silent Audio Fix

Release date: 2026-09-13

## Verified fix

- Eliminated residual intermittent beep/buzz during NUBO voice playback.
- Keeps continuous 24 kHz PCM AudioWorklet playback.
- Uses jitter buffering and de-click fade handling around PCM underrun/restart boundaries.
- Hard-disables the synthetic 660–1760 Hz search oscillator while the residual beep issue is being eliminated.
- Preserves spoken `請稍等！` feedback.

## Version scope

This is a Web UI/audio-runtime release. Android APK native versioning is independent.
