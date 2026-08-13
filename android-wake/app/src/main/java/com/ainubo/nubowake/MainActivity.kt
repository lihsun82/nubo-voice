package com.ainubo.nubowake

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
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
    }

    private var startAfterPermission = false
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startAfterPermission = intent.getBooleanExtra(EXTRA_START_AFTER_PERMISSION, false)
        renderUi()
        requestNotificationPermissionIfNeeded()
        if (startAfterPermission) ensureMicrophoneThenStart()
    }

    private fun renderUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(48, 72, 48, 48)
            setBackgroundColor(Color.WHITE)
        }

        val title = TextView(this).apply {
            text = "NUBO 本機喚醒"
            textSize = 26f
            setTextColor(Color.rgb(20, 24, 32))
            gravity = Gravity.CENTER
        }

        val description = TextView(this).apply {
            text = "待命時只在手機本機辨識喚醒詞，不連 Gemini。\n\n喚醒詞：NUBO、努波、嘿 NUBO、哈囉 NUBO、你好 NUBO、喂 NUBO、Hey NUBO、Hi NUBO。"
            textSize = 16f
            setTextColor(Color.rgb(55, 60, 70))
            setPadding(0, 28, 0, 28)
        }

        status = TextView(this).apply {
            text = "尚未啟動本機喚醒"
            textSize = 15f
            setTextColor(Color.rgb(80, 85, 95))
            setPadding(0, 0, 0, 24)
        }

        val start = Button(this).apply {
            text = "啟用本機喚醒"
            setOnClickListener { ensureMicrophoneThenStart() }
        }

        val stop = Button(this).apply {
            text = "停止本機喚醒"
            setOnClickListener {
                stopService(Intent(this@MainActivity, WakeService::class.java))
                status.text = "本機喚醒已停止"
            }
        }

        root.addView(title, fullWidthWrap())
        root.addView(description, fullWidthWrap())
        root.addView(status, fullWidthWrap())
        root.addView(start, fullWidthWrap())
        root.addView(stop, fullWidthWrap())
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
        val intent = Intent(this, WakeService::class.java).setAction(WakeService.ACTION_START)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent)
        else startService(intent)
        status.text = "本機喚醒運作中；待命辨識不使用 Gemini token"
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
                status.text = "需要麥克風權限才能使用本機喚醒"
            }
        }
    }
}
