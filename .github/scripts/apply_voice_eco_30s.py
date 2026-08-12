from pathlib import Path

# 1) OpenAI realtime eco gate: actually enter sleep after 30s.
eco = Path('lib/nubo-realtime-eco.ts')
s = eco.read_text(encoding='utf-8-sig')
s = s.replace('const ECO_IDLE_MS = 60_000;', 'const ECO_IDLE_MS = 30_000;')
old = '''    if (
      this.destroyed ||
      !this.sleeping ||
      document.visibilityState !== "visible"
    ) {
      return;
    }

    const analyser = this.analyser;
    if (!analyser || this.context?.state !== "running") return;

    const now = Date.now();'''
new = '''    if (
      this.destroyed ||
      document.visibilityState !== "visible"
    ) {
      return;
    }

    const now = Date.now();

    if (!this.sleeping) {
      if (now - this.lastActivityAt >= ECO_IDLE_MS) {
        await this.suspend("idle");
      }
      return;
    }

    const analyser = this.analyser;
    if (!analyser || this.context?.state !== "running") return;'''
if old not in s:
    raise SystemExit('OpenAI eco tick pattern not found')
s = s.replace(old, new, 1)
eco.write_text(s, encoding='utf-8')

# 2) Gemini microphone local safety gate also becomes 30s.
audio = Path('lib/browser-audio.ts')
s = audio.read_text(encoding='utf-8-sig')
s = s.replace('const NUBO_AUDIO_ECO_IDLE_MS = 60_000;', 'const NUBO_AUDIO_ECO_IDLE_MS = 30_000;')
audio.write_text(s, encoding='utf-8')

# 3) Gemini Live: after 30s of no conversation, completely close cloud session.
console = Path('components/GeminiVoiceConsole.tsx')
s = console.read_text(encoding='utf-8-sig')

marker = 'const NUBO_SILENCE_WORDS = ["閉嘴", "安靜", "退下", "不要講話", "先不要說話", "不要說話", "停止說話", "停", "stop"];'
if marker not in s:
    raise SystemExit('Gemini silence marker not found')
s = s.replace(marker, marker + '\nconst NUBO_ECO_IDLE_MS = 30_000;', 1)

marker = '''  const foregroundResumeTimerRef =
    useRef<number | null>(null);'''
repl = marker + '''
  const ecoSleepingRef = useRef(false);
  const ecoTimerRef = useRef<number | null>(null);
  const lastInteractionAtRef = useRef(Date.now());
  const ecoRecognitionRef = useRef<any>(null);
  const ecoRecognitionRestartRef = useRef<number | null>(null);'''
if marker not in s:
    raise SystemExit('Gemini refs marker not found')
s = s.replace(marker, repl, 1)

marker = '''  const markSpeaking = () => {'''
helpers = r'''  const noteVoiceInteraction = () => {
    lastInteractionAtRef.current = Date.now();
  };

  const stopEcoWakeListener = () => {
    if (ecoRecognitionRestartRef.current) {
      window.clearTimeout(ecoRecognitionRestartRef.current);
      ecoRecognitionRestartRef.current = null;
    }

    const recognition = ecoRecognitionRef.current;
    ecoRecognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.stop(); } catch {}
      try { recognition.abort?.(); } catch {}
    }

    try {
      const nativeBridge = (window as typeof window & {
        NuboNative?: { stopWakeListener?: () => boolean };
      }).NuboNative;
      nativeBridge?.stopWakeListener?.();
    } catch {}
  };

  const wakeFromEco = () => {
    if (!ecoSleepingRef.current) return;
    ecoSleepingRef.current = false;
    stopEcoWakeListener();
    sessionHandleRef.current = null;
    reconnectAttemptsRef.current = 0;
    noteVoiceInteraction();
    setTranscript("NUBO已喚醒，正在恢復語音…");
    void connect(false);
  };

  const startEcoWakeListener = () => {
    stopEcoWakeListener();

    try {
      const nativeBridge = (window as typeof window & {
        NuboNative?: { startWakeListener?: () => boolean };
      }).NuboNative;
      if (nativeBridge?.startWakeListener?.()) return;
    } catch {}

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    ecoRecognitionRef.current = recognition;
    recognition.lang = "zh-TW";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i]?.[0]?.transcript?.trim();
        if (text && includesVoiceCommand(text, NUBO_WAKE_WORDS)) {
          wakeFromEco();
          return;
        }
      }
    };

    recognition.onerror = () => {
      // System recognition may temporarily fail; onend retries while eco sleeping.
    };

    recognition.onend = () => {
      if (!ecoSleepingRef.current || ecoRecognitionRef.current !== recognition) return;
      ecoRecognitionRestartRef.current = window.setTimeout(() => {
        if (!ecoSleepingRef.current || ecoRecognitionRef.current !== recognition) return;
        try { recognition.start(); } catch {}
      }, 700);
    };

    try { recognition.start(); } catch {}
  };

  const enterEcoSleep = async () => {
    if (ecoSleepingRef.current || closingRef.current) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    ecoSleepingRef.current = true;
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;
    sessionHandleRef.current = null;

    // Detach first so old socket onclose cannot schedule a cloud reconnect.
    socketRef.current = null;
    try { socket.close(1000, "NUBO 30s eco sleep"); } catch {}

    await microphoneRef.current?.stop();
    await playbackRef.current?.close();
    microphoneRef.current = null;
    playbackRef.current = null;

    setState("idle");
    setError("");
    setTranscript(
      "NUBO智慧節約待命中。雲端語音已停止，請說 nubo、嗨 nubo、兄弟或有人嗎喚醒。",
    );
    notifyNuboVoicePhase("idle");
    startEcoWakeListener();
  };

'''
if marker not in s:
    raise SystemExit('Gemini markSpeaking marker not found')
s = s.replace(marker, helpers + marker, 1)

s = s.replace('''      closingRef.current ||
      reconnectTimerRef.current''', '''      closingRef.current ||
      ecoSleepingRef.current ||
      reconnectTimerRef.current''', 1)

marker = '''      if (text) {
        if (includesVoiceCommand(text, NUBO_SILENCE_WORDS)) {'''
repl = '''      if (text) {
        if (ecoSleepingRef.current) {
          if (includesVoiceCommand(text, NUBO_WAKE_WORDS)) {
            wakeFromEco();
          }
          return;
        }

        if (includesVoiceCommand(text, NUBO_SILENCE_WORDS)) {'''
if marker not in s:
    raise SystemExit('Gemini background transcript marker not found')
s = s.replace(marker, repl, 1)

marker = '''  useEffect(() => {
    if (state === "idle") notifyNuboVoicePhase("idle");'''
native_effect = r'''  useEffect(() => {
    const handleNativeWake = () => {
      if (ecoSleepingRef.current) wakeFromEco();
    };
    window.addEventListener("nubo:native-wake", handleNativeWake);
    return () => {
      window.removeEventListener("nubo:native-wake", handleNativeWake);
      stopEcoWakeListener();
    };
  }, []);

'''
if marker not in s:
    raise SystemExit('Gemini phase effect marker not found')
s = s.replace(marker, native_effect + marker, 1)

marker = '''    closingRef.current = true;
    clearReconnectTimer();'''
repl = '''    closingRef.current = true;
    ecoSleepingRef.current = false;
    stopEcoWakeListener();
    clearReconnectTimer();'''
if marker not in s:
    raise SystemExit('Gemini disconnect marker not found')
s = s.replace(marker, repl, 1)

marker = '''  const connect = async (isReconnect = false) => {
    clearReconnectTimer();
    setError("");'''
repl = '''  const connect = async (isReconnect = false) => {
    clearReconnectTimer();
    ecoSleepingRef.current = false;
    stopEcoWakeListener();
    noteVoiceInteraction();
    setError("");'''
if marker not in s:
    raise SystemExit('Gemini connect marker not found')
s = s.replace(marker, repl, 1)

s = s.replace('''          if (message.setupComplete) {
            reconnectAttemptsRef.current = 0;''', '''          if (message.setupComplete) {
            reconnectAttemptsRef.current = 0;
            noteVoiceInteraction();''', 1)
s = s.replace('''              if (part?.inlineData?.data) {
                markSpeaking();''', '''              if (part?.inlineData?.data) {
                noteVoiceInteraction();
                markSpeaking();''', 1)
s = s.replace('''          if (typeof modelText === "string" && modelText.trim()) {
            setTranscript(modelText.trim());''', '''          if (typeof modelText === "string" && modelText.trim()) {
            noteVoiceInteraction();
            setTranscript(modelText.trim());''', 1)
s = s.replace('''          } else if (typeof userText === "string" && userText.trim()) {
            const trimmedUserText = userText.trim();''', '''          } else if (typeof userText === "string" && userText.trim()) {
            noteVoiceInteraction();
            const trimmedUserText = userText.trim();''', 1)

marker = '''        if (
          silentUntilWakeRef.current ||
          resumeInProgress
        ) {'''
repl = '''        if (
          silentUntilWakeRef.current ||
          ecoSleepingRef.current ||
          resumeInProgress
        ) {'''
if marker not in s:
    raise SystemExit('Gemini foreground guard marker not found')
s = s.replace(marker, repl, 1)

marker = '''  /*
   * 手機從LINE、YouTube、地圖或其他App
   * 回到NUBO時，自動重建語音連線。
   */'''
eco_effect = r'''  useEffect(() => {
    ecoTimerRef.current = window.setInterval(() => {
      if (ecoSleepingRef.current || closingRef.current) return;
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastInteractionAtRef.current >= NUBO_ECO_IDLE_MS) {
        void enterEcoSleep();
      }
    }, 1000);

    return () => {
      if (ecoTimerRef.current) {
        window.clearInterval(ecoTimerRef.current);
        ecoTimerRef.current = null;
      }
    };
  }, []);

'''
if marker not in s:
    raise SystemExit('Gemini foreground comment marker not found')
s = s.replace(marker, eco_effect + marker, 1)
console.write_text(s, encoding='utf-8')

# 4) Android APK native wake recognizer for token-free eco wake.
java = Path('android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java')
j = java.read_text(encoding='utf-8-sig')
j = j.replace('import android.provider.Settings;\n', 'import android.provider.Settings;\nimport android.os.Handler;\nimport android.os.Looper;\nimport android.speech.RecognitionListener;\nimport android.speech.RecognizerIntent;\nimport android.speech.SpeechRecognizer;\n')

marker = '''    private WebView webView;'''
repl = '''    private WebView webView;
    private SpeechRecognizer wakeRecognizer;
    private boolean wakeListenerEnabled = false;
    private final Handler wakeHandler = new Handler(Looper.getMainLooper());'''
if marker not in j:
    raise SystemExit('Android field marker not found')
j = j.replace(marker, repl, 1)

marker = '''        @JavascriptInterface
        public boolean openExternalApp(String targetUrl, String label) {'''
bridge = '''        @JavascriptInterface
        public boolean startWakeListener() {
            activity.runOnUiThread(activity::startNativeWakeListener);
            return true;
        }

        @JavascriptInterface
        public boolean stopWakeListener() {
            activity.runOnUiThread(activity::stopNativeWakeListener);
            return true;
        }

'''
if marker not in j:
    raise SystemExit('Android bridge marker not found')
j = j.replace(marker, bridge + marker, 1)

marker = '''    private boolean isAllowedBridgeTarget(String targetUrl, String label) {'''
native_methods = r'''    private boolean isNativeWakeWord(String text) {
        if (text == null) return false;
        String normalized = text
            .toLowerCase(Locale.ROOT)
            .replace(" ", "")
            .replace("　", "");
        return normalized.contains("nubo")
            || normalized.contains("努波")
            || normalized.contains("努寶")
            || normalized.contains("奴波")
            || normalized.contains("兄弟")
            || normalized.contains("有人嗎")
            || normalized.contains("有人吗");
    }

    private void dispatchNativeWake() {
        wakeListenerEnabled = false;
        if (wakeRecognizer != null) {
            try { wakeRecognizer.cancel(); } catch (Exception ignored) {}
        }
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('nubo:native-wake',{detail:{source:'android'}}));",
            null
        );
    }

    private void handleWakeRecognition(Bundle results) {
        if (!wakeListenerEnabled || results == null) return;
        ArrayList<String> matches = results.getStringArrayList(
            SpeechRecognizer.RESULTS_RECOGNITION
        );
        if (matches == null) return;
        for (String text : matches) {
            if (isNativeWakeWord(text)) {
                dispatchNativeWake();
                return;
            }
        }
    }

    private void scheduleWakeRestart() {
        if (!wakeListenerEnabled) return;
        wakeHandler.removeCallbacksAndMessages(null);
        wakeHandler.postDelayed(this::startWakeRecognition, 700);
    }

    private void startWakeRecognition() {
        if (!wakeListenerEnabled || wakeRecognizer == null) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            wakeListenerEnabled = false;
            return;
        }

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(
            RecognizerIntent.EXTRA_LANGUAGE_MODEL,
            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
        );
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-TW");
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        try {
            wakeRecognizer.startListening(intent);
        } catch (Exception ignored) {
            scheduleWakeRestart();
        }
    }

    private void startNativeWakeListener() {
        if (wakeListenerEnabled) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            requestMicrophonePermissionIfNeeded();
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return;

        wakeListenerEnabled = true;
        if (wakeRecognizer == null) {
            wakeRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
            wakeRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {}
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {}
                @Override public void onError(int error) { scheduleWakeRestart(); }
                @Override public void onResults(Bundle results) {
                    handleWakeRecognition(results);
                    scheduleWakeRestart();
                }
                @Override public void onPartialResults(Bundle partialResults) {
                    handleWakeRecognition(partialResults);
                }
                @Override public void onEvent(int eventType, Bundle params) {}
            });
        }
        startWakeRecognition();
    }

    private void stopNativeWakeListener() {
        wakeListenerEnabled = false;
        wakeHandler.removeCallbacksAndMessages(null);
        if (wakeRecognizer != null) {
            try { wakeRecognizer.cancel(); } catch (Exception ignored) {}
        }
    }

'''
if marker not in j:
    raise SystemExit('Android target marker not found')
j = j.replace(marker, native_methods + marker, 1)

marker = '''    @Override
    protected void onDestroy() {
        webView.removeJavascriptInterface("NuboNative");'''
repl = '''    @Override
    protected void onDestroy() {
        stopNativeWakeListener();
        if (wakeRecognizer != null) {
            wakeRecognizer.destroy();
            wakeRecognizer = null;
        }
        webView.removeJavascriptInterface("NuboNative");'''
if marker not in j:
    raise SystemExit('Android onDestroy marker not found')
j = j.replace(marker, repl, 1)
java.write_text(j, encoding='utf-8')
