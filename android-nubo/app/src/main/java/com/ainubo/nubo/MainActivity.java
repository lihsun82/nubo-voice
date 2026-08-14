package com.ainubo.nubo;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String NUBO_HOST = "nubo.ainubo.com";
    private static final String NUBO_URL = "https://nubo.ainubo.com/?native=android-v24";
    private static final int MICROPHONE_PERMISSION_REQUEST = 8111;

    private WebView webView;
    private SpeechRecognizer wakeRecognizer;
    private boolean wakeListenerEnabled = false;
    private final Handler wakeHandler = new Handler(Looper.getMainLooper());

    private NuboSenseAudioDetector senseDetector;
    private TextToSpeech senseTts;
    private boolean senseTtsReady = false;
    private boolean activityForeground = false;
    private String voicePhase = "idle";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(7, 9, 13));
        getWindow().setNavigationBarColor(Color.rgb(7, 9, 13));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 9, 13));
        setContentView(
            webView,
            new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        );

        configureWebView(webView);
        initializeSenseTts();

        if (savedInstanceState == null) {
            webView.loadUrl(NUBO_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }

        requestMicrophonePermissionIfNeeded();
    }

    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setUserAgentString(
            settings.getUserAgentString() + " NUBO-Android/24"
        );

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(view, true);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        view.addJavascriptInterface(new NuboNativeBridge(this), "NuboNative");
        view.setWebViewClient(new TrustedNuboWebViewClient());
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                Uri origin = request.getOrigin();
                if (!isTrustedNuboUri(origin)) {
                    request.deny();
                    return;
                }

                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                    request.deny();
                    requestMicrophonePermissionIfNeeded();
                    return;
                }

                List<String> granted = new ArrayList<>();
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                        // Hard guard: WebView/Gemini gets exclusive microphone access.
                        // This prevents the local classifier from degrading live voice capture.
                        stopSenseAmbientCapture();
                        granted.add(resource);
                    }
                }

                if (granted.isEmpty()) {
                    request.deny();
                } else {
                    request.grant(granted.toArray(new String[0]));
                }
            }
        });
    }

    private void initializeSenseTts() {
        senseTts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS || senseTts == null) return;
            int languageResult = senseTts.setLanguage(Locale.TAIWAN);
            senseTtsReady = languageResult != TextToSpeech.LANG_MISSING_DATA
                && languageResult != TextToSpeech.LANG_NOT_SUPPORTED;
            senseTts.setSpeechRate(1.02f);
            senseTts.setPitch(1.0f);
            senseTts.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            );
        });
    }

    private void requestMicrophonePermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED) {
            syncSenseForVoicePhase();
            return;
        }

        requestPermissions(
            new String[]{Manifest.permission.RECORD_AUDIO},
            MICROPHONE_PERMISSION_REQUEST
        );
    }

    @Override
    public void onRequestPermissionsResult(
        int requestCode,
        String[] permissions,
        int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (
            requestCode == MICROPHONE_PERMISSION_REQUEST
                && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED
        ) {
            syncSenseForVoicePhase();
        }
    }

    private static boolean isTrustedNuboUri(Uri uri) {
        return uri != null
            && "https".equalsIgnoreCase(uri.getScheme())
            && NUBO_HOST.equalsIgnoreCase(uri.getHost());
    }

    private final class TrustedNuboWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(
            WebView view,
            WebResourceRequest request
        ) {
            Uri uri = request.getUrl();
            if (isTrustedNuboUri(uri)) {
                return false;
            }

            launchGenericUri(uri);
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (isTrustedNuboUri(Uri.parse(url))) {
                view.evaluateJavascript(
                    "document.documentElement.dataset.nuboNative='android-v24';window.dispatchEvent(new CustomEvent('nubo-native-ready',{detail:{version:'android-v24',sense:'v1'}}));",
                    null
                );
            }
        }
    }

    private static final class NuboNativeBridge {
        private final MainActivity activity;

        NuboNativeBridge(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public String getNativeVersion() {
            return "android-v24";
        }

        @JavascriptInterface
        public boolean startWakeListener() {
            activity.runOnUiThread(activity::startNativeWakeListener);
            return true;
        }

        @JavascriptInterface
        public boolean stopWakeListener() {
            activity.runOnUiThread(activity::stopNativeWakeListener);
            return true;
        }

        @JavascriptInterface
        public boolean setVoicePhase(String phase) {
            if (phase == null) return false;
            String safePhase = phase.trim().toLowerCase(Locale.ROOT);
            activity.runOnUiThread(() -> activity.updateVoicePhase(safePhase));
            return true;
        }

        @JavascriptInterface
        public boolean isSenseReady() {
            return activity.senseDetector != null && activity.senseDetector.isReady();
        }

        @JavascriptInterface
        public boolean pushSensePcm16Base64(String pcmBase64) {
            if (pcmBase64 == null || pcmBase64.isEmpty() || pcmBase64.length() > 100_000) {
                return false;
            }
            activity.runOnUiThread(() -> activity.pushSensePcm16Base64(pcmBase64));
            return true;
        }

        @JavascriptInterface
        public boolean openExternalApp(String targetUrl, String label) {
            if (targetUrl == null || label == null) {
                return false;
            }

            String safeTarget = targetUrl.trim();
            String safeLabel = label.trim();
            if (safeTarget.isEmpty() || safeLabel.isEmpty()) {
                return false;
            }

            if (!activity.isAllowedBridgeTarget(safeTarget, safeLabel)) {
                return false;
            }

            activity.runOnUiThread(
                () -> activity.launchExternalTarget(safeTarget, safeLabel)
            );
            return true;
        }
    }

    private void updateVoicePhase(String phase) {
        switch (phase) {
            case "idle":
            case "connecting":
            case "listening":
            case "thinking":
            case "speaking":
            case "error":
                voicePhase = phase;
                break;
            default:
                return;
        }
        syncSenseForVoicePhase();
    }

    private void ensureSenseDetector() {
        if (senseDetector != null) return;
        senseDetector = new NuboSenseAudioDetector(
            this,
            new NuboSenseAudioDetector.Listener() {
                @Override
                public void onSenseEvent(NuboSenseAudioDetector.SenseEvent event) {
                    runOnUiThread(() -> handleSenseEvent(event));
                }

                @Override
                public void onSenseError(String message) {
                    // Keep this fail-open: Gemini and the existing NUBO UI must continue
                    // working even if local audio classification is unavailable.
                }
            }
        );
    }

    private boolean canRunSenseAmbient() {
        if (!activityForeground) return false;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        // Local Sense owns the microphone only when cloud voice is not active.
        return "idle".equals(voicePhase) || "error".equals(voicePhase);
    }

    private void syncSenseForVoicePhase() {
        if (!canRunSenseAmbient()) {
            stopSenseAmbientCapture();
            return;
        }

        ensureSenseDetector();
        if (senseDetector != null) {
            senseDetector.startAmbientCapture();
        }
    }

    private void stopSenseAmbientCapture() {
        if (senseDetector != null) {
            senseDetector.stopAmbientCapture();
        }
    }

    private void pushSensePcm16Base64(String pcmBase64) {
        if (!activityForeground || !"listening".equals(voicePhase)) return;
        try {
            byte[] pcm = android.util.Base64.decode(pcmBase64, android.util.Base64.DEFAULT);
            ensureSenseDetector();
            if (senseDetector != null) senseDetector.classifyPcm16(pcm);
        } catch (RuntimeException ignored) {
            // Gemini audio must continue even if Sense diagnostics fail.
        }
    }

    private void handleSenseEvent(NuboSenseAudioDetector.SenseEvent event) {
        if (event == null || !activityForeground) return;
        if (!("idle".equals(voicePhase)
            || "error".equals(voicePhase)
            || "listening".equals(voicePhase))) return;

        dispatchSenseEventToWeb(event);
        String phrase = localSenseResponse(event);
        if (phrase == null || phrase.isEmpty()) return;

        if (senseTtsReady && senseTts != null) {
            senseTts.speak(
                phrase,
                TextToSpeech.QUEUE_FLUSH,
                null,
                "nubo-sense-" + event.timestampMs
            );
        }
    }

    private void dispatchSenseEventToWeb(NuboSenseAudioDetector.SenseEvent event) {
        if (webView == null) return;
        try {
            JSONObject detail = new JSONObject();
            detail.put("type", event.type);
            detail.put("label", event.rawLabel);
            detail.put("confidence", event.confidence);
            detail.put("source", "android-local-yamnet");
            detail.put("timestamp", event.timestampMs);
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('nubo:sense-event',{detail:"
                    + detail.toString()
                    + "}));",
                null
            );
        } catch (Exception ignored) {
            // Event telemetry is optional; local spoken response still works.
        }
    }

    private String localSenseResponse(NuboSenseAudioDetector.SenseEvent event) {
        String raw = event.rawLabel == null
            ? ""
            : event.rawLabel.toLowerCase(Locale.ROOT);

        switch (event.type) {
            case "cough":
                return "有聽到你咳了一下，先喝口水吧。";
            case "sneeze":
                return "哈啾，保重喔。";
            case "yawn":
                return "哈欠被我抓到了，你是不是累了？";
            case "breathing":
                if (raw.contains("sigh")) {
                    return "聽到你嘆氣了，今天有點累嗎？";
                }
                if (raw.contains("gasp")) {
                    return "欸，怎麼了？剛剛好像嚇了一下。";
                }
                return "你呼吸有點急，還好嗎？";
            case "scream":
                return "欸，怎麼了？需要我幫忙嗎？";
            case "laughter":
                return "哈哈，什麼事這麼好笑？";
            case "crying":
                return "我有聽到你的聲音不太對，還好嗎？";
            default:
                return null;
        }
    }

    private boolean isNativeWakeWord(String text) {
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

        // SpeechRecognizer and the local classifier cannot safely own the same mic.
        stopSenseAmbientCapture();
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
        syncSenseForVoicePhase();
    }

    private boolean isAllowedBridgeTarget(String targetUrl, String label) {
        String normalizedLabel = label.toLowerCase(Locale.ROOT);
        if (
            normalizedLabel.equals("youtube")
                || normalizedLabel.equals("youtube music")
                || normalizedLabel.equals("line")
                || normalizedLabel.equals("facebook")
                || normalizedLabel.equals("instagram")
                || normalizedLabel.equals("google maps")
                || normalizedLabel.equals("gmail")
                || normalizedLabel.equals("網站")
                || normalizedLabel.equals("手機工具")
        ) {
            return true;
        }

        Uri uri = Uri.parse(targetUrl);
        String scheme = uri.getScheme();
        return "https".equalsIgnoreCase(scheme)
            || "http".equalsIgnoreCase(scheme)
            || "tel".equalsIgnoreCase(scheme)
            || "sms".equalsIgnoreCase(scheme)
            || "mailto".equalsIgnoreCase(scheme)
            || "geo".equalsIgnoreCase(scheme);
    }

    private void launchExternalTarget(String targetUrl, String label) {
        String normalizedLabel = label.toLowerCase(Locale.ROOT);
        Uri target = Uri.parse(targetUrl);

        if (normalizedLabel.equals("youtube music")) {
            launchPackageOrFallback(
                "com.google.android.apps.youtube.music",
                target,
                target
            );
            return;
        }

        if (
            normalizedLabel.equals("youtube")
                || targetUrl.contains("youtube.com")
                || targetUrl.contains("youtu.be")
        ) {
            launchPackageOrFallback(
                "com.google.android.youtube",
                target,
                target
            );
            return;
        }

        if (
            normalizedLabel.equals("line")
                || targetUrl.startsWith("line:")
                || targetUrl.contains("line.me/")
        ) {
            launchPackageOrFallback(
                "jp.naver.line.android",
                Uri.parse("line://nv/chat"),
                Uri.parse("https://line.me/R/nv/chat")
            );
            return;
        }

        if (
            normalizedLabel.equals("instagram")
                || targetUrl.contains("instagram.com")
        ) {
            launchPackageOrFallback(
                "com.instagram.android",
                target,
                target
            );
            return;
        }

        if (
            normalizedLabel.equals("facebook")
                || targetUrl.contains("facebook.com")
                || targetUrl.contains("fb.com")
        ) {
            launchPackageOrFallback(
                "com.facebook.katana",
                target,
                target
            );
            return;
        }

        if (
            normalizedLabel.equals("google maps")
                || targetUrl.contains("google.com/maps")
                || targetUrl.contains("maps.google.")
                || targetUrl.startsWith("geo:")
        ) {
            launchPackageOrFallback(
                "com.google.android.apps.maps",
                target,
                target
            );
            return;
        }

        if (
            normalizedLabel.equals("gmail")
                || targetUrl.contains("mail.google.com")
                || targetUrl.startsWith("mailto:")
        ) {
            launchPackageOrFallback(
                "com.google.android.gm",
                target,
                target
            );
            return;
        }

        launchGenericUri(target);
    }

    private void launchPackageOrFallback(
        String packageName,
        Uri preferredUri,
        Uri fallbackUri
    ) {
        if (preferredUri != null) {
            Intent explicitIntent = new Intent(Intent.ACTION_VIEW, preferredUri);
            explicitIntent.setPackage(packageName);
            explicitIntent.addCategory(Intent.CATEGORY_BROWSABLE);

            try {
                startActivity(explicitIntent);
                return;
            } catch (ActivityNotFoundException ignored) {
                // Try the package launcher or browser fallback below.
            }
        }

        Intent launchIntent = getPackageManager()
            .getLaunchIntentForPackage(packageName);
        if (launchIntent != null) {
            try {
                startActivity(launchIntent);
                return;
            } catch (ActivityNotFoundException ignored) {
                // Continue to the browser fallback.
            }
        }

        if (fallbackUri != null) {
            launchGenericUri(fallbackUri);
        }
    }

    private void launchGenericUri(Uri uri) {
        if (uri == null) {
            return;
        }

        Intent intent;
        if ("intent".equalsIgnoreCase(uri.getScheme())) {
            try {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
            } catch (Exception ignored) {
                return;
            }
        } else {
            intent = new Intent(Intent.ACTION_VIEW, uri);
        }

        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
            Intent settingsIntent = new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getPackageName())
            );
            startActivity(settingsIntent);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        activityForeground = true;
        webView.onResume();
        webView.resumeTimers();
        webView.evaluateJavascript(
            "window.dispatchEvent(new Event('nubo:native-foreground'));",
            null
        );
        syncSenseForVoicePhase();
    }

    @Override
    protected void onPause() {
        activityForeground = false;
        stopSenseAmbientCapture();
        webView.evaluateJavascript(
            "window.dispatchEvent(new Event('nubo:native-background'));",
            null
        );
        webView.onPause();
        webView.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        activityForeground = false;
        stopNativeWakeListener();
        if (wakeRecognizer != null) {
            wakeRecognizer.destroy();
            wakeRecognizer = null;
        }
        if (senseDetector != null) {
            senseDetector.close();
            senseDetector = null;
        }
        if (senseTts != null) {
            senseTts.stop();
            senseTts.shutdown();
            senseTts = null;
        }
        senseTtsReady = false;
        webView.removeJavascriptInterface("NuboNative");
        webView.stopLoading();
        webView.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
