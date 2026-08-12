# NUBO Eco Wake V1

Android native wake layer for the 30-second cloud voice eco sleep.

- Cloud Gemini Live session stops after 30 seconds without conversation activity.
- Android SpeechRecognizer listens only for wake phrases while the cloud session is asleep.
- Wake phrases: nubo, 嗨 nubo, 兄弟, 有人嗎.
- The wake layer does not stream microphone PCM to Gemini while sleeping.
