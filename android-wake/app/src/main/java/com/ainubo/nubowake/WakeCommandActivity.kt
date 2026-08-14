package com.ainubo.nubowake

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.view.WindowManager

class WakeCommandActivity : Activity() {
    private var holdingStandby = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        window.addFlags(
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
        )
        handle(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        when (intent?.data?.host?.lowercase()) {
            "start" -> {
                // Stay as a transparent, non-touchable foreground activity while
                // local KWS is listening. NUBO remains visually underneath, but
                // it does not regain foreground/focus until a *real* wake keyword
                // launches it. This separates the standby handoff from wake-up.
                holdingStandby = startFromCommand()
                if (!holdingStandby) finish()
            }

            "stop" -> {
                holdingStandby = false
                stopService(Intent(this, WakeService::class.java))
                finish()
            }

            else -> finish()
        }
    }

    private fun startFromCommand(): Boolean {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            startActivity(
                Intent(this, MainActivity::class.java)
                    .putExtra(MainActivity.EXTRA_START_AFTER_PERMISSION, true)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            return false
        }

        val service = Intent(this, WakeService::class.java).setAction(WakeService.ACTION_START)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(service)
        else startService(service)
        return true
    }

    override fun onBackPressed() {
        if (holdingStandby) {
            stopService(Intent(this, WakeService::class.java))
            holdingStandby = false
        }
        super.onBackPressed()
    }
}
