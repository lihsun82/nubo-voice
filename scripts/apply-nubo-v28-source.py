from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


# 1) Avatar: reduce mobile GPU/CPU pressure, stop rendering off-screen, throttle while scrolling,
#    and make nod / shake / shrug substantially more readable.
p = Path("components/NuboEnergyOrb.tsx")
s = p.read_text()
s = replace_once(s, "const ACTION_AMPLITUDE = 1.4;", "const ACTION_AMPLITUDE = 1.75;", "action amplitude")
s = s.replace("particleCount: 3200, frameInterval: 1000 / 26, dpr: Math.min(window.devicePixelRatio || 1, 1.1)", "particleCount: 2700, frameInterval: 1000 / 25, dpr: Math.min(window.devicePixelRatio || 1, 1.05)")
s = s.replace("particleCount: 6200,", "particleCount: 4700,")
s = s.replace("dpr: Math.min(window.devicePixelRatio || 1, 1.35),", "dpr: Math.min(window.devicePixelRatio || 1, 1.18),")
s = s.replace("headY += wave * 6.3 * ACTION_AMPLITUDE;", "headY += wave * 9.0 * ACTION_AMPLITUDE;")
s = s.replace("0.014 * ACTION_AMPLITUDE;", "0.021 * ACTION_AMPLITUDE;", 1)
s = s.replace("headX += wave * 6.4 * ACTION_AMPLITUDE;", "headX += wave * 10.0 * ACTION_AMPLITUDE;")
s = s.replace("headRoll += wave * 0.014 * ACTION_AMPLITUDE;", "headRoll += wave * 0.024 * ACTION_AMPLITUDE;")
s = s.replace("shoulderLift = envelope * 4.6 * ACTION_AMPLITUDE;", "shoulderLift = envelope * 9.0 * ACTION_AMPLITUDE;")
s = s.replace("headY -= envelope * 1.4 * ACTION_AMPLITUDE;", "headY -= envelope * 3.0 * ACTION_AMPLITUDE;")
s = s.replace("0.012 *\n      ACTION_AMPLITUDE;", "0.022 *\n      ACTION_AMPLITUDE;", 1)

old = '''    let lastFrameAt = 0;\n    let visible = document.visibilityState === "visible";\n    let gesture: GestureState = {\n'''
new = '''    let lastFrameAt = 0;\n    let visible = document.visibilityState === "visible";\n    let intersecting = true;\n    let scrolling = false;\n    let scrollTimer: number | null = null;\n    let gesture: GestureState = {\n'''
s = replace_once(s, old, new, "render state")

old = '''    const draw = (time: number) => {\n      animationFrame = 0;\n      if (!visible) return;\n\n      audioLevel += (targetAudioLevel - audioLevel) * 0.22;\n      targetAudioLevel *= 0.9;\n\n      if (time - lastFrameAt >= profile.frameInterval) {\n        lastFrameAt = time;\n        renderHologram(\n'''
new = '''    const draw = (time: number) => {\n      animationFrame = 0;\n      if (!visible || !intersecting) return;\n\n      audioLevel += (targetAudioLevel - audioLevel) * 0.22;\n      targetAudioLevel *= 0.9;\n\n      // Scrolling gets priority over decorative canvas work. As soon as scrolling\n      // stops, the avatar returns to its normal frame rate.\n      const effectiveFrameInterval = scrolling\n        ? Math.max(profile.frameInterval, 1000 / 16)\n        : profile.frameInterval;\n\n      if (time - lastFrameAt >= effectiveFrameInterval) {\n        lastFrameAt = time;\n        renderHologram(\n'''
s = replace_once(s, old, new, "draw throttle")

old = '''    const onVisibilityChange = () => {\n      visible = document.visibilityState === "visible";\n      if (visible && !animationFrame) {\n        animationFrame = window.requestAnimationFrame(draw);\n      }\n    };\n\n    window.addEventListener("nubo-voice-phase", onPhase);\n'''
new = '''    const onVisibilityChange = () => {\n      visible = document.visibilityState === "visible";\n      if (visible && intersecting && !animationFrame) {\n        animationFrame = window.requestAnimationFrame(draw);\n      }\n    };\n\n    const intersectionObserver = new IntersectionObserver(\n      ([entry]) => {\n        intersecting = entry?.isIntersecting ?? true;\n        if (intersecting && visible && !animationFrame) {\n          animationFrame = window.requestAnimationFrame(draw);\n        }\n      },\n      { rootMargin: "140px 0px" },\n    );\n    intersectionObserver.observe(canvas);\n\n    const onScroll = () => {\n      scrolling = true;\n      if (scrollTimer !== null) window.clearTimeout(scrollTimer);\n      scrollTimer = window.setTimeout(() => {\n        scrolling = false;\n        scrollTimer = null;\n        if (visible && intersecting && !animationFrame) {\n          animationFrame = window.requestAnimationFrame(draw);\n        }\n      }, 140);\n    };\n\n    window.addEventListener("scroll", onScroll, { passive: true });\n    window.addEventListener("nubo-voice-phase", onPhase);\n'''
s = replace_once(s, old, new, "intersection and scroll listeners")

old = '''    return () => {\n      if (animationFrame) window.cancelAnimationFrame(animationFrame);\n      transcriptObserver.disconnect();\n'''
new = '''    return () => {\n      if (animationFrame) window.cancelAnimationFrame(animationFrame);\n      if (scrollTimer !== null) window.clearTimeout(scrollTimer);\n      intersectionObserver.disconnect();\n      window.removeEventListener("scroll", onScroll);\n      transcriptObserver.disconnect();\n'''
s = replace_once(s, old, new, "render cleanup")
p.write_text(s)

# CSS: isolate the expensive hologram layer so scrolling does not invalidate the whole page.
p = Path("app/orb-theme.css")
s = p.read_text()
s = replace_once(
    s,
    '''  display: grid;\n  place-items: center;\n  filter: drop-shadow(0 0 30px rgba(53, 220, 255, 0.32)) drop-shadow(0 0 70px rgba(19, 116, 255, 0.18));\n''',
    '''  display: grid;\n  place-items: center;\n  contain: layout paint;\n  transform: translateZ(0);\n  backface-visibility: hidden;\n  filter: drop-shadow(0 0 30px rgba(53, 220, 255, 0.32)) drop-shadow(0 0 70px rgba(19, 116, 255, 0.18));\n''',
    "orb containment",
)
p.write_text(s)

# 3) Web microphone: when the native Android shell has put NUBO into PiP for an external app,
#    hidden-document state must not force audio into eco sleep. The normal 30-second interaction
#    timer remains the authority for shutting Gemini down.
p = Path("lib/browser-audio.ts")
s = p.read_text()
marker = '''function removeForegroundListeners(listener: () => void) {\n  document.removeEventListener("visibilitychange", listener, true);\n  window.removeEventListener("focus", listener, true);\n  window.removeEventListener("pageshow", listener, true);\n}\n\n'''
insert = marker + '''function nativeExternalVoiceKeepAliveActive() {\n  if (typeof window === "undefined") return false;\n  try {\n    const bridge = (window as typeof window & {\n      NuboNative?: { isExternalVoiceKeepAliveActive?: () => boolean };\n    }).NuboNative;\n    return bridge?.isExternalVoiceKeepAliveActive?.() === true;\n  } catch {\n    return false;\n  }\n}\n\n'''
if "nativeExternalVoiceKeepAliveActive" not in s:
    s = replace_once(s, marker, insert, "native keepalive helper")

s = replace_once(
    s,
    '''    if (document.visibilityState === "visible") {\n      this.ecoSleeping = false;\n''',
    '''    if (document.visibilityState === "visible" || nativeExternalVoiceKeepAliveActive()) {\n      this.ecoSleeping = false;\n''',
    "foreground keepalive",
)
s = replace_once(
    s,
    '''      if (document.visibilityState !== "visible") {\n        this.ecoSleeping = true;\n        this.preRoll = [];\n        return;\n      }\n''',
    '''      if (document.visibilityState !== "visible" && !nativeExternalVoiceKeepAliveActive()) {\n        this.ecoSleeping = true;\n        this.preRoll = [];\n        return;\n      }\n''',
    "hidden audio gate",
)
p.write_text(s)

# Gemini console: explicitly end native PiP keepalive when the existing 30-second Eco Sleep fires,
# and do not tear down a healthy socket just because the user comes back from YouTube.
p = Path("components/GeminiVoiceConsole.tsx")
s = p.read_text()
s = replace_once(
    s,
    '''    notifyNuboVoicePhase("idle");\n    startEcoWakeListener();\n  };\n''',
    '''    notifyNuboVoicePhase("idle");\n    try {\n      const bridge = (window as typeof window & {\n        NuboNative?: { endExternalVoiceKeepAlive?: () => boolean };\n      }).NuboNative;\n      bridge?.endExternalVoiceKeepAlive?.();\n    } catch {}\n    startEcoWakeListener();\n  };\n''',
    "eco ends PiP keepalive",
)

old = '''            if (\n              activeSocket?.readyState ===\n              WebSocket.OPEN\n            ) {\n              /*\n               * 即使WebSocket表面仍開啟，\n               * 手機背景期間的麥克風與音訊可能已暫停。\n               * 關閉後交由既有重連機制建立乾淨連線。\n               */\n              activeSocket.close(\n                1012,\n                "NUBO foreground resume",\n              );\n            } else if (\n'''
new = '''            if (\n              activeSocket?.readyState ===\n              WebSocket.OPEN\n            ) {\n              // V28 PiP keeps the existing Gemini session alive while YouTube /\n              // LINE / Maps is foreground. Reuse it instead of throwing it away.\n              void microphoneRef.current?.resume();\n              setState("connected");\n              setTranscript(\n                returningFromExternal\n                  ? "已返回NUBO，語音持續連線。"\n                  : "NUBO語音已恢復。",\n              );\n            } else if (\n'''
s = replace_once(s, old, new, "foreground socket reuse")
p.write_text(s)

# Android native shell: enter PiP before handing control to an external app, and keep WebView timers
# alive while PiP is visible. This keeps the microphone legitimately foreground-visible on Android.
p = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = p.read_text()
s = s.replace("import android.app.Activity;", "import android.app.Activity;\nimport android.app.PictureInPictureParams;")
s = s.replace("import android.widget.FrameLayout;", "import android.widget.FrameLayout;\nimport android.util.Rational;")

field = '''    private boolean activityForeground = false;\n    private String voicePhase = "idle";\n'''
field_new = field + '''    private volatile boolean externalVoiceKeepAliveActive = false;\n'''
if "externalVoiceKeepAliveActive" not in s:
    s = replace_once(s, field, field_new, "external keepalive field")

old = '''            activity.runOnUiThread(\n                () -> activity.launchExternalTarget(safeTarget, safeLabel)\n            );\n            return true;\n        }\n    }\n\n    private void updateVoicePhase(String phase) {\n'''
new = '''            activity.runOnUiThread(() -> {\n                activity.beginExternalVoiceKeepAlive();\n                activity.webView.postDelayed(\n                    () -> activity.launchExternalTarget(safeTarget, safeLabel),\n                    180L\n                );\n            });\n            return true;\n        }\n\n        @JavascriptInterface\n        public boolean isExternalVoiceKeepAliveActive() {\n            return activity.externalVoiceKeepAliveActive;\n        }\n\n        @JavascriptInterface\n        public boolean endExternalVoiceKeepAlive() {\n            activity.runOnUiThread(activity::endExternalVoiceKeepAlive);\n            return true;\n        }\n    }\n\n    private boolean isNuboInPictureInPicture() {\n        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O\n            && isInPictureInPictureMode();\n    }\n\n    private void beginExternalVoiceKeepAlive() {\n        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {\n            externalVoiceKeepAliveActive = false;\n            return;\n        }\n        try {\n            PictureInPictureParams params = new PictureInPictureParams.Builder()\n                .setAspectRatio(new Rational(9, 16))\n                .build();\n            externalVoiceKeepAliveActive = enterPictureInPictureMode(params);\n            if (externalVoiceKeepAliveActive) {\n                activityForeground = true;\n                webView.resumeTimers();\n            }\n        } catch (RuntimeException ignored) {\n            externalVoiceKeepAliveActive = false;\n        }\n    }\n\n    private void endExternalVoiceKeepAlive() {\n        externalVoiceKeepAliveActive = false;\n        if (isNuboInPictureInPicture()) {\n            moveTaskToBack(true);\n        }\n    }\n\n    @Override\n    public void onPictureInPictureModeChanged(boolean inPictureInPictureMode) {\n        super.onPictureInPictureModeChanged(inPictureInPictureMode);\n        externalVoiceKeepAliveActive = inPictureInPictureMode;\n        if (inPictureInPictureMode) {\n            activityForeground = true;\n            webView.resumeTimers();\n        }\n    }\n\n    private void updateVoicePhase(String phase) {\n'''
s = replace_once(s, old, new, "PiP bridge and methods")

old = '''    protected void onResume() {\n        super.onResume();\n        activityForeground = true;\n        webView.onResume();\n'''
new = '''    protected void onResume() {\n        super.onResume();\n        activityForeground = true;\n        if (!isNuboInPictureInPicture()) {\n            externalVoiceKeepAliveActive = false;\n        }\n        webView.onResume();\n'''
s = replace_once(s, old, new, "resume PiP state")

old = '''    protected void onPause() {\n        activityForeground = false;\n        stopSenseAmbientCapture();\n        webView.evaluateJavascript(\n            "window.dispatchEvent(new Event('nubo:native-background'));",\n            null\n        );\n        webView.onPause();\n        webView.pauseTimers();\n        super.onPause();\n    }\n'''
new = '''    protected void onPause() {\n        final boolean keepVoiceAlive =\n            externalVoiceKeepAliveActive || isNuboInPictureInPicture();\n        if (keepVoiceAlive) {\n            // PiP remains visible, so do not suspend Chromium timers or microphone.\n            activityForeground = true;\n            webView.resumeTimers();\n        } else {\n            activityForeground = false;\n            stopSenseAmbientCapture();\n            webView.evaluateJavascript(\n                "window.dispatchEvent(new Event('nubo:native-background'));",\n                null\n            );\n            webView.onPause();\n            webView.pauseTimers();\n        }\n        super.onPause();\n    }\n'''
s = replace_once(s, old, new, "pause keepalive")
p.write_text(s)

p = Path("android-nubo/app/src/main/AndroidManifest.xml")
s = p.read_text()
s = replace_once(
    s,
    '''            android:launchMode="singleTask"\n            android:screenOrientation="unspecified"\n            android:windowSoftInputMode="adjustResize">\n''',
    '''            android:launchMode="singleTask"\n            android:screenOrientation="unspecified"\n            android:supportsPictureInPicture="true"\n            android:resizeableActivity="true"\n            android:windowSoftInputMode="adjustResize">\n''',
    "manifest PiP",
)
p.write_text(s)
