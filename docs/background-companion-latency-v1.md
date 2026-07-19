# NUBO Background Companion and Latency V1

- Keeps the Gemini Live session alive while NUBO opens an external webpage or app, with a bounded companion window.
- Prevents the 25-second token saver from immediately closing voice during that external companion window.
- Attempts background reconnection when Android/PWA suspends the voice socket.
- Tunes Gemini Live automatic VAD for faster end-of-speech detection.
- Adds compact local time results and short-lived browser-side weather caching.
- Does not modify stable LINE webhook, LINE verification, LINE command parsing, or desktop-control code.
