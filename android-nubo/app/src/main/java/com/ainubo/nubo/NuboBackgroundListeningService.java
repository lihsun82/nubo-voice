package com.ainubo.nubo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import java.util.ArrayList;
import java.util.Locale;

public final class NuboBackgroundListeningService extends Service {
    public static final String ACTION_START = "com.ainubo.nubo.action.COMPANION_START";
    public static final String ACTION_TOUCH = "com.ainubo.nubo.action.COMPANION_TOUCH";
    public static final String ACTION_STOP = "com.ainubo.nubo.action.COMPANION_STOP";

    private static final String CHANNEL_ID = "nubo_background_listening_v52";
    private static final int NOTIFICATION_ID = 5201;
    private static final long ACTIVE_WINDOW_MS = 30_000L;

    private static volatile boolean running = false;
    private static volatile boolean cloudWindowActive = false;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeoutRunnable = this::enterWakeMode;
    private SpeechRecognizer wakeRecognizer;
    private boolean wakeListening = false;

    public static boolean isRunning() {
        return running;
    }

    public static boolean isCloudWindowActive() {
        return running && cloudWindowActive;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopCompanion();
            return START_NOT_STICKY;
        }

        if (ACTION_START.equals(action) || ACTION_TOUCH.equals(action)) {
            stopWakeRecognizer();
            cloudWindowActive = true;
            startForegroundCompat(buildNotification("NUBO 背景聆聽中 · 30 秒"));
            resetTimeout();
            return START_NOT_STICKY;
        }

        return START_NOT_STICKY;
    }

    private void startForegroundCompat(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void resetTimeout() {
        handler.removeCallbacks(timeoutRunnable);
        handler.postDelayed(timeoutRunnable, ACTIVE_WINDOW_MS);
    }

    private void enterWakeMode() {
        if (!running || !cloudWindowActive) return;
        cloudWindowActive = false;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification("NUBO 待命喚醒中"));
        }
        MainActivity.onCompanionTimeoutFromService();
        startWakeRecognizer();
    }

    private boolean isWakeWord(String text) {
        if (text == null) return false;
        String normalized = text.toLowerCase(Locale.ROOT)
            .replace(" ", "")
            .replace("　", "");
        return normalized.contains("nubo")
            || normalized.contains("努寶")
            || normalized.contains("努波")
            || normalized.contains("奴波");
    }

    private void startWakeRecognizer() {
        if (!running || cloudWindowActive || wakeListening) return;
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) return;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return;

        if (wakeRecognizer == null) {
            wakeRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
            wakeRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {}
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {}
                @Override public void onEvent(int eventType, Bundle params) {}

                @Override
                public void onError(int error) {
                    wakeListening = false;
                    scheduleWakeRestart();
                }

                @Override
                public void onResults(Bundle results) {
                    wakeListening = false;
                    handleWakeResults(results);
                    scheduleWakeRestart();
                }

                @Override
                public void onPartialResults(Bundle partialResults) {
                    handleWakeResults(partialResults);
                }
            });
        }
        beginWakeRecognition();
    }

    private void beginWakeRecognition() {
        if (!running || cloudWindowActive || wakeRecognizer == null || wakeListening) return;
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-TW");
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        try {
            wakeListening = true;
            wakeRecognizer.startListening(intent);
        } catch (RuntimeException ignored) {
            wakeListening = false;
            scheduleWakeRestart();
        }
    }

    private void handleWakeResults(Bundle results) {
        if (results == null || cloudWindowActive) return;
        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null) return;
        for (String text : matches) {
            if (!isWakeWord(text)) continue;
            stopWakeRecognizer();
            cloudWindowActive = true;
            startForegroundCompat(buildNotification("NUBO 已喚醒 · 背景聆聽 30 秒"));
            resetTimeout();
            MainActivity.onCompanionWakeFromService();
            return;
        }
    }

    private void scheduleWakeRestart() {
        if (!running || cloudWindowActive) return;
        handler.postDelayed(this::beginWakeRecognition, 700L);
    }

    private void stopWakeRecognizer() {
        wakeListening = false;
        if (wakeRecognizer != null) {
            try { wakeRecognizer.cancel(); } catch (RuntimeException ignored) {}
        }
    }

    private void stopCompanion() {
        cloudWindowActive = false;
        handler.removeCallbacksAndMessages(null);
        stopWakeRecognizer();
        if (wakeRecognizer != null) {
            wakeRecognizer.destroy();
            wakeRecognizer = null;
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "NUBO 背景聆聽",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("播放 YouTube 時維持 NUBO 語音 30 秒，之後轉本機喚醒。");
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String text) {
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        return builder
            .setSmallIcon(R.drawable.ainubox1_launcher_uploaded)
            .setContentTitle("AINUBO X1")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build();
    }

    @Override
    public void onDestroy() {
        running = false;
        cloudWindowActive = false;
        handler.removeCallbacksAndMessages(null);
        stopWakeRecognizer();
        if (wakeRecognizer != null) {
            wakeRecognizer.destroy();
            wakeRecognizer = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
