package com.ainubo.nubowake

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.util.Log
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.KeywordSpotter
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineStream
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

class WakeService : Service() {
    companion object {
        const val ACTION_START = "com.ainubo.nubowake.START"
        const val ACTION_STOP = "com.ainubo.nubowake.STOP"
        private const val TAG = "NuboWake"
        private const val CHANNEL_ID = "nubo_local_wake"
        private const val NOTIFICATION_ID = 7301
        private const val SAMPLE_RATE = 16_000
        private const val MODEL_DIR = "sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20"
        private const val NUBO_PACKAGE = "com.ainubo.nubo"
    }

    private val running = AtomicBoolean(false)
    private var worker: Thread? = null
    private var recorder: AudioRecord? = null
    private var spotter: KeywordSpotter? = null
    private var stream: OnlineStream? = null
    private var lastWakeAt = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createSilentNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            stopSelf()
            return START_NOT_STICKY
        }

        promoteToForeground()
        startDetectorIfNeeded()
        return START_NOT_STICKY
    }

    private fun createSilentNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            "NUBO 本機喚醒",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "只在手機本機辨識 NUBO 喚醒詞，不連 Gemini。"
            setSound(null, null)
            enableVibration(false)
            enableLights(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun promoteToForeground() {
        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("NUBO 本機待命中")
            .setContentText("只在手機端監聽喚醒詞；Gemini 未連線")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(openApp)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSound(null)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startDetectorIfNeeded() {
        if (!running.compareAndSet(false, true)) return
        worker = thread(name = "nubo-local-kws", start = true) {
            try {
                initKeywordSpotter()
                initRecorder()
                processMicrophone()
            } catch (t: Throwable) {
                Log.e(TAG, "Local KWS failed", t)
            } finally {
                cleanupDetector()
                stopSelf()
            }
        }
    }

    private fun initKeywordSpotter() {
        val modelConfig = OnlineModelConfig(
            transducer = OnlineTransducerModelConfig(
                encoder = "$MODEL_DIR/encoder-epoch-13-avg-2-chunk-8-left-64.int8.onnx",
                decoder = "$MODEL_DIR/decoder-epoch-13-avg-2-chunk-8-left-64.onnx",
                joiner = "$MODEL_DIR/joiner-epoch-13-avg-2-chunk-8-left-64.int8.onnx",
            ),
            tokens = "$MODEL_DIR/tokens.txt",
            numThreads = 1,
            provider = "cpu",
            modelType = "zipformer2",
            modelingUnit = "cjkchar",
        )

        val config = KeywordSpotterConfig(
            featConfig = FeatureConfig(sampleRate = SAMPLE_RATE, featureDim = 80, dither = 0.0f),
            modelConfig = modelConfig,
            maxActivePaths = 4,
            keywordsFile = "$MODEL_DIR/keywords.txt",
            keywordsScore = 1.0f,
            keywordsThreshold = 0.25f,
            numTrailingBlanks = 1,
        )

        spotter = KeywordSpotter(assetManager = assets, config = config)
        stream = spotter!!.createStream()
        check(stream!!.ptr != 0L) { "Unable to create NUBO keyword stream" }
    }

    private fun initRecorder() {
        val channel = AudioFormat.CHANNEL_IN_MONO
        val format = AudioFormat.ENCODING_PCM_16BIT
        val minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, channel, format)
        check(minimum > 0) { "Invalid AudioRecord buffer size: $minimum" }

        recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            SAMPLE_RATE,
            channel,
            format,
            minimum * 2,
        )
        check(recorder?.state == AudioRecord.STATE_INITIALIZED) { "AudioRecord init failed" }
        recorder!!.startRecording()
    }

    private fun processMicrophone() {
        val kws = spotter ?: return
        val kwsStream = stream ?: return
        val audio = recorder ?: return
        val buffer = ShortArray(1600) // 100 ms at 16 kHz

        while (running.get()) {
            val count = audio.read(buffer, 0, buffer.size)
            if (count <= 0) continue

            val samples = FloatArray(count) { index -> buffer[index] / 32768.0f }
            kwsStream.acceptWaveform(samples, SAMPLE_RATE)

            while (running.get() && kws.isReady(kwsStream)) {
                kws.decode(kwsStream)
                val keyword = kws.getResult(kwsStream).keyword.trim()
                if (keyword.isNotEmpty()) {
                    Log.i(TAG, "Wake keyword detected: $keyword")
                    kws.reset(kwsStream)
                    onWakeDetected(keyword)
                    return
                }
            }
        }
    }

    private fun onWakeDetected(keyword: String) {
        val now = System.currentTimeMillis()
        if (now - lastWakeAt < 4_000L) return
        lastWakeAt = now

        running.set(false)
        try { recorder?.stop() } catch (_: Throwable) {}

        val launch = packageManager.getLaunchIntentForPackage(NUBO_PACKAGE)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("nubo_local_wake", true)
            putExtra("nubo_local_wake_keyword", keyword)
        }

        if (launch != null) {
            startActivity(launch)
        } else {
            startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse("https://nubo.ainubo.com/?wake=local")).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                },
            )
        }
    }

    private fun cleanupDetector() {
        running.set(false)
        try { recorder?.stop() } catch (_: Throwable) {}
        try { recorder?.release() } catch (_: Throwable) {}
        recorder = null

        try { stream?.release() } catch (_: Throwable) {}
        stream = null
        try { spotter?.release() } catch (_: Throwable) {}
        spotter = null
    }

    override fun onDestroy() {
        running.set(false)
        try { recorder?.stop() } catch (_: Throwable) {}
        worker?.interrupt()
        worker = null
        cleanupDetector()
        super.onDestroy()
    }
}
