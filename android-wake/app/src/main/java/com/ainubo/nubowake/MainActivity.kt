package com.ainubo.nubowake

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    companion object {
        private const val REQUEST_MIC = 2001
        private const val REQUEST_NOTIFICATIONS = 2002
        const val EXTRA_START_AFTER_PERMISSION = "start_after_permission"
        private const val NUBO_PACKAGE = "com.ainubo.nubo"
    }

    private var startAfterPermission = false
    private lateinit var status: TextView
    private val handler = Handler(Looper.getMainLooper())
    private val diagPoll = object : Runnable {
        override fun run() {
            refreshDiagnostics()
            handler.postDelayed(this, 500L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startAfterPermission = intent.getBooleanExtra(EXTRA_START_AFTER_PERMISSION, false)
        renderUi()
        requestNotificationPermissionIfNeeded()
        if (startAfterPermission) ensureMicrophoneThenStart()
    }

    override fun onStart() {
        super.onStart()
        handler.removeCallbacks(diagPoll)
        handler.post(diagPoll)
    }

    override fun onStop() {
        handler.removeCallbacks(diagPoll)
        super.onStop()
    }

    private fun renderUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(48, 72, 48, 48)
            setBackgroundColor(Color.WHITE)
        }

        val title = TextView(this).apply {
            text = "NUBO 本機喚醒 v1.1"
            textSize = 26f
            setTextColor(Color.rgb(20, 24, 32))
            gravity = Gravity.CENTER
        }

        val description = TextView(this).apply {
            text = "待命時只在手機本機辨識喚醒詞，不連 Gemini。\n\n喚醒詞：NUBO、努波、嘿 NUBO、哈囉 NUBO、你好 NUBO、喂 NUBO、Hey NUBO、Hi NUBO。\n\n這版會顯示真正的麥克風音量與 KWS 狀態，不再只顯示『已啟動』。"
            textSize = 16f
            setTextColor(Color.rgb(55, 60, 70))
            setPadding(0, 28, 0, 28)
        }

        status = TextView(this).apply {
            text = "狀態：尚未啟動"
            textSize = 16f
            setTextColor(Color.rgb(30, 35, 45))
            setPadding(20, 20, 20, 24)
            setBackgroundColor(Color.rgb(242, 245, 248))
        }

        val start = Button(this).apply {
            text = "啟用本機喚醒"
            setOnClickListener { ensureMicrophoneThenStart() }
        }

        val stop = Button(this).apply {
            text = "停止本機喚醒"
            setOnClickListener {
                stopService(Intent(this@MainActivity, WakeService::class.java))
                getSharedPreferences(WakeService.PREFS, MODE_PRIVATE).edit()
                    .putString(WakeService.KEY_STATE, "已停止")
                    .putString(WakeService.KEY_DETAIL, "使用者停止本機喚醒")
                    .putLong(WakeService.KEY_UPDATED_AT, System.currentTimeMillis())
                    .apply()
                refreshDiagnostics()
            }
        }

        val testLaunch = Button(this).apply {
            text = "測試開啟 NUBO（不測語音）"
            setOnClickListener { testOpenNubo() }
        }

        val hint = TextView(this).apply {
            text = "測試方式：先按『啟用本機喚醒』。狀態若持續顯示『麥克風監聽中』，你說話時 dB 數字應明顯變大（例如 -60 → -25 dB）。接著說『NUBO』。"
            textSize = 14f
            setTextColor(Color.rgb(90, 95, 105))
            setPadding(0, 24, 0, 0)
        }

        root.addView(title, fullWidthWrap())
        root.addView(description, fullWidthWrap())
        root.addView(status, fullWidthWrap())
        root.addView(start, fullWidthWrap())
        root.addView(stop, fullWidthWrap())
        root.addView(testLaunch, fullWidthWrap())
        root.addView(hint, fullWidthWrap())
        setContentView(root)
    }

    private fun fullWidthWrap() = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { setMargins(0, 8, 0, 8) }

    private fun ensureMicrophoneThenStart() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            startWakeService()
            return
        }
        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_MIC)
    }

    private fun startWakeService() {
        getSharedPreferences(WakeService.PREFS, MODE_PRIVATE).edit()
            .putString(WakeService.KEY_STATE, "啟動中")
            .putString(WakeService.KEY_DETAIL, "等待服務回報真實狀態")
            .putLong(WakeService.KEY_UPDATED_AT, System.currentTimeMillis())
            .apply()

        val intent = Intent(this, WakeService::class.java).setAction(WakeService.ACTION_START)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent)
        else startService(intent)
        refreshDiagnostics()
    }

    private fun refreshDiagnostics() {
        val prefs = getSharedPreferences(WakeService.PREFS, MODE_PRIVATE)
        val state = prefs.getString(WakeService.KEY_STATE, "尚未啟動") ?: "尚未啟動"
        val detail = prefs.getString(WakeService.KEY_DETAIL, "") ?: ""
        val updatedAt = prefs.getLong(WakeService.KEY_UPDATED_AT, 0L)
        val ageMs = if (updatedAt > 0L) System.currentTimeMillis() - updatedAt else -1L
        val freshness = when {
            ageMs < 0L -> ""
            ageMs < 2_000L -> "｜即時"
            else -> "｜${ageMs / 1000}s 前"
        }
        status.text = "狀態：$state$freshness\n$detail"
        status.setTextColor(
            when (state) {
                "錯誤" -> Color.rgb(180, 25, 25)
                "已偵測" -> Color.rgb(15, 125, 65)
                "麥克風監聽中" -> Color.rgb(10, 90, 150)
                else -> Color.rgb(30, 35, 45)
            },
        )
    }

    private fun testOpenNubo() {
        val launch = packageManager.getLaunchIntentForPackage(NUBO_PACKAGE)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("nubo_local_wake_test", true)
        }
        if (launch != null) {
            startActivity(launch)
        } else {
            status.text = "狀態：錯誤\n找不到已安裝的 NUBO App"
            status.setTextColor(Color.rgb(180, 25, 25))
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_NOTIFICATIONS)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_MIC) {
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
                startWakeService()
            } else {
                status.text = "狀態：錯誤\n需要麥克風權限才能使用本機喚醒"
                status.setTextColor(Color.rgb(180, 25, 25))
            }
        }
    }
}
