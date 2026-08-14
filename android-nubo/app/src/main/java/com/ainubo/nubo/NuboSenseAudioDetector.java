package com.ainubo.nubo;

import android.annotation.SuppressLint;
import android.content.Context;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.os.SystemClock;
import android.util.Log;

import com.google.mediapipe.tasks.audio.audioclassifier.AudioClassifier;
import com.google.mediapipe.tasks.audio.audioclassifier.AudioClassifierResult;
import com.google.mediapipe.tasks.audio.core.RunningMode;
import com.google.mediapipe.tasks.components.containers.Category;
import com.google.mediapipe.tasks.components.containers.ClassificationResult;
import com.google.mediapipe.tasks.components.containers.Classifications;
import com.google.mediapipe.tasks.components.containers.AudioData;
import com.google.mediapipe.tasks.core.BaseOptions;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * NUBO Sense v1.
 *
 * Runs YAMNet locally on the Android device. No microphone audio is uploaded by
 * this class. It is intentionally enabled only while the cloud/Gemini voice
 * session is idle so it never competes with WebView getUserMedia for the mic.
 */
public final class NuboSenseAudioDetector {
    private static final String TAG = "NuboSense";
    private static final String MODEL_ASSET = "yamnet.tflite";
    private static final int SAMPLE_RATE_HZ = 16_000;
    private static final float MODEL_WINDOW_SECONDS = 0.975f;
    private static final int MODEL_SAMPLE_COUNT = (int) (SAMPLE_RATE_HZ * MODEL_WINDOW_SECONDS);
    private static final int RECORDER_BUFFER_BYTES = MODEL_SAMPLE_COUNT * Float.BYTES * 2;
    private static final long CLASSIFY_INTERVAL_MS = 490L;
    private static final long CONFIRM_WINDOW_MS = 3_000L;

    public interface Listener {
        void onSenseEvent(SenseEvent event);
        void onSenseError(String message);
    }

    public static final class SenseEvent {
        public final String type;
        public final String rawLabel;
        public final float confidence;
        public final long timestampMs;

        SenseEvent(String type, String rawLabel, float confidence, long timestampMs) {
            this.type = type;
            this.rawLabel = rawLabel;
            this.confidence = confidence;
            this.timestampMs = timestampMs;
        }
    }

    private static final class DetectionRule {
        final float minScore;
        final int confirmations;
        final long cooldownMs;

        DetectionRule(float minScore, int confirmations, long cooldownMs) {
            this.minScore = minScore;
            this.confirmations = confirmations;
            this.cooldownMs = cooldownMs;
        }
    }

    private static final class CandidateState {
        int hits;
        long lastSeenMs;
        long lastTriggeredMs;
    }

    private static final class BestMatch {
        final String rawLabel;
        final float score;

        BestMatch(String rawLabel, float score) {
            this.rawLabel = rawLabel;
            this.score = score;
        }
    }

    private final Context context;
    private final Listener listener;
    private final Map<String, CandidateState> candidateStates = new HashMap<>();

    private AudioClassifier classifier;
    private AudioRecord recorder;
    private ScheduledThreadPoolExecutor executor;
    private volatile boolean ambientRunning;

    public NuboSenseAudioDetector(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
        initializeClassifier();
    }

    private void initializeClassifier() {
        try {
            BaseOptions baseOptions = BaseOptions.builder()
                .setModelAssetPath(MODEL_ASSET)
                .build();

            AudioClassifier.AudioClassifierOptions options =
                AudioClassifier.AudioClassifierOptions.builder()
                    .setBaseOptions(baseOptions)
                    .setRunningMode(RunningMode.AUDIO_STREAM)
                    .setScoreThreshold(0.20f)
                    .setMaxResults(12)
                    .setResultListener(this::handleClassifierResult)
                    .setErrorListener(this::handleClassifierError)
                    .build();

            classifier = AudioClassifier.createFromOptions(context, options);
        } catch (RuntimeException error) {
            classifier = null;
            reportError("NUBO Sense 模型初始化失敗: " + safeMessage(error));
        }
    }

    public boolean isReady() {
        return classifier != null;
    }

    public boolean isAmbientRunning() {
        return ambientRunning;
    }

    @SuppressLint("MissingPermission")
    public synchronized boolean startAmbientCapture() {
        if (ambientRunning) return true;
        if (classifier == null) {
            initializeClassifier();
            if (classifier == null) return false;
        }

        stopAmbientCapture();

        try {
            recorder = classifier.createAudioRecord(
                AudioFormat.CHANNEL_IN_DEFAULT,
                SAMPLE_RATE_HZ,
                RECORDER_BUFFER_BYTES
            );
            recorder.startRecording();

            if (recorder.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                recorder.release();
                recorder = null;
                reportError("NUBO Sense 無法取得麥克風。");
                return false;
            }

            ambientRunning = true;
            executor = new ScheduledThreadPoolExecutor(1);
            executor.setRemoveOnCancelPolicy(true);
            executor.scheduleAtFixedRate(
                this::classifyAmbientWindow,
                0L,
                CLASSIFY_INTERVAL_MS,
                TimeUnit.MILLISECONDS
            );
            Log.i(TAG, "Local ambient detector started");
            return true;
        } catch (RuntimeException error) {
            ambientRunning = false;
            releaseRecorder();
            reportError("NUBO Sense 啟動失敗: " + safeMessage(error));
            return false;
        }
    }

    public synchronized void stopAmbientCapture() {
        ambientRunning = false;
        if (executor != null) {
            executor.shutdownNow();
            executor = null;
        }
        releaseRecorder();
    }

    private void releaseRecorder() {
        AudioRecord current = recorder;
        recorder = null;
        if (current == null) return;
        try {
            if (current.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                current.stop();
            }
        } catch (RuntimeException ignored) {
            // Recorder may already have been released by Android.
        }
        try {
            current.release();
        } catch (RuntimeException ignored) {
            // No-op.
        }
    }

    private void classifyAmbientWindow() {
        AudioClassifier currentClassifier = classifier;
        AudioRecord currentRecorder = recorder;
        if (!ambientRunning || currentClassifier == null || currentRecorder == null) return;

        try {
            AudioData audioData = AudioData.create(currentRecorder.getFormat(), SAMPLE_RATE_HZ);
            int loadedValues = audioData.load(currentRecorder);
            if (loadedValues <= 0) return;
            currentClassifier.classifyAsync(audioData, SystemClock.uptimeMillis());
        } catch (RuntimeException error) {
            Log.w(TAG, "Audio classification window failed", error);
        }
    }

    private void handleClassifierResult(AudioClassifierResult result) {
        if (!ambientRunning || result == null) return;

        Map<String, BestMatch> bestByType = new HashMap<>();
        List<ClassificationResult> resultBlocks = result.classificationResults();
        if (resultBlocks == null) return;

        for (ClassificationResult block : resultBlocks) {
            if (block == null) continue;
            List<Classifications> heads = block.classifications();
            if (heads == null) continue;

            for (Classifications head : heads) {
                if (head == null || head.categories() == null) continue;
                for (Category category : head.categories()) {
                    if (category == null || category.categoryName() == null) continue;
                    String eventType = mapLabelToEventType(category.categoryName());
                    if (eventType == null) continue;

                    BestMatch current = bestByType.get(eventType);
                    if (current == null || category.score() > current.score) {
                        bestByType.put(
                            eventType,
                            new BestMatch(category.categoryName(), category.score())
                        );
                    }
                }
            }
        }

        long now = SystemClock.elapsedRealtime();
        for (Map.Entry<String, BestMatch> entry : bestByType.entrySet()) {
            considerDetection(entry.getKey(), entry.getValue(), now);
        }
    }

    private void considerDetection(String type, BestMatch match, long now) {
        DetectionRule rule = ruleFor(type, match.rawLabel);
        if (rule == null || match.score < rule.minScore) return;

        CandidateState state = candidateStates.computeIfAbsent(type, ignored -> new CandidateState());
        if (now - state.lastTriggeredMs < rule.cooldownMs) return;

        if (now - state.lastSeenMs > CONFIRM_WINDOW_MS) {
            state.hits = 0;
        }

        state.lastSeenMs = now;
        state.hits += 1;

        if (state.hits < rule.confirmations) return;

        state.hits = 0;
        state.lastTriggeredMs = now;
        if (listener != null) {
            listener.onSenseEvent(
                new SenseEvent(type, match.rawLabel, match.score, System.currentTimeMillis())
            );
        }
    }

    private static DetectionRule ruleFor(String type, String rawLabel) {
        switch (type) {
            case "cough":
                return new DetectionRule(0.45f, 1, 20_000L);
            case "sneeze":
                return new DetectionRule(0.50f, 1, 30_000L);
            case "yawn":
                return new DetectionRule(0.42f, 2, 50_000L);
            case "breathing": {
                String normalized = rawLabel.toLowerCase(Locale.ROOT);
                float threshold = normalized.contains("gasp") ? 0.70f : 0.58f;
                return new DetectionRule(threshold, 2, 40_000L);
            }
            case "scream":
                return new DetectionRule(0.62f, 1, 15_000L);
            case "laughter":
                return new DetectionRule(0.54f, 2, 25_000L);
            case "crying":
                return new DetectionRule(0.60f, 2, 40_000L);
            default:
                return null;
        }
    }

    private static String mapLabelToEventType(String rawLabel) {
        String label = rawLabel.toLowerCase(Locale.ROOT);

        if (label.contains("cough") || label.contains("throat clearing")) {
            return "cough";
        }
        if (label.contains("sneeze")) {
            return "sneeze";
        }
        if (label.contains("yawn")) {
            return "yawn";
        }
        if (
            label.contains("breathing")
                || label.contains("pant")
                || label.contains("wheeze")
                || label.contains("sigh")
                || label.contains("gasp")
        ) {
            return "breathing";
        }
        if (
            label.contains("scream")
                || label.contains("shout")
                || label.contains("yell")
                || label.contains("bellow")
                || label.contains("whoop")
        ) {
            return "scream";
        }
        if (
            label.contains("laughter")
                || label.contains("giggle")
                || label.contains("snicker")
                || label.contains("belly laugh")
                || label.contains("chuckle")
                || label.contains("chortle")
        ) {
            return "laughter";
        }
        if (
            label.contains("crying")
                || label.contains("sobbing")
                || label.contains("whimper")
                || label.contains("wail")
                || label.contains("baby cry")
                || label.contains("infant cry")
        ) {
            return "crying";
        }
        return null;
    }

    private void handleClassifierError(RuntimeException error) {
        reportError("NUBO Sense 推論錯誤: " + safeMessage(error));
    }

    private void reportError(String message) {
        Log.w(TAG, message);
        if (listener != null) listener.onSenseError(message);
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty()
            ? error.getClass().getSimpleName()
            : message;
    }

    public synchronized void close() {
        stopAmbientCapture();
        if (classifier != null) {
            try {
                classifier.close();
            } catch (RuntimeException ignored) {
                // No-op.
            }
            classifier = null;
        }
        candidateStates.clear();
    }
}
