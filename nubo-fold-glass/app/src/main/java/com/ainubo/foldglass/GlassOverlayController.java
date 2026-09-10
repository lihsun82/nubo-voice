package com.ainubo.foldglass;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Point;
import android.graphics.Shader;
import android.hardware.display.DisplayManager;
import android.provider.Settings;
import android.view.Display;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;

final class GlassOverlayController {
    private final Context appContext;
    private final DisplayManager displayManager;

    private Context windowContext;
    private WindowManager windowManager;
    private FrameLayout root;
    private FrostedGlassView glassView;
    private WindowManager.LayoutParams layoutParams;
    private boolean added = false;
    private boolean keepScreenOn = false;
    private float lastLevel = 0f;
    private String displaySignature = "";

    GlassOverlayController(Context context) {
        this.appContext = context.getApplicationContext();
        this.displayManager = appContext.getSystemService(DisplayManager.class);
    }

    boolean isBlurAvailable() {
        try {
            WindowManager wm = appContext.getSystemService(WindowManager.class);
            return wm != null && wm.isCrossWindowBlurEnabled();
        } catch (Exception ignored) {
            return false;
        }
    }

    boolean showLevel(float level) {
        level = clamp(level);
        lastLevel = level;

        if (!Settings.canDrawOverlays(appContext)) {
            hide();
            return false;
        }
        if (level < 0.015f) {
            hide();
            return true;
        }

        ensureBoundToActiveDisplay();
        if (windowManager == null || root == null || layoutParams == null) return false;

        if (!added) {
            try {
                windowManager.addView(root, layoutParams);
                added = true;
            } catch (Exception e) {
                added = false;
                return false;
            }
        }

        glassView.setGlassLevel(level, isBlurAvailable());
        layoutParams.setBlurBehindRadius(Math.round(20f + 104f * level));
        layoutParams.alpha = 0.20f + 0.17f * level;

        try {
            windowManager.updateViewLayout(root, layoutParams);
        } catch (Exception ignored) {}
        return true;
    }

    void setKeepScreenOn(boolean enabled) {
        keepScreenOn = enabled;
        if (layoutParams != null) {
            applyKeepScreenFlags(layoutParams);
            if (added && windowManager != null && root != null) {
                try {
                    windowManager.updateViewLayout(root, layoutParams);
                } catch (Exception ignored) {}
            }
        }
    }

    /**
     * Called after ColorOS/device_state switches between the cover and inner display.
     * If the logical display id, size, rotation or power state changed, recreate the
     * overlay using a window context bound to the currently visible display.
     */
    void refreshDisplayBinding() {
        String newSignature = signatureOf(selectActiveDisplay());
        if (!newSignature.equals(displaySignature)) {
            rebuildForActiveDisplay();
        }
    }

    void forceRebind() {
        rebuildForActiveDisplay();
    }

    void hide() {
        removeCurrentWindow();
    }

    private void ensureBoundToActiveDisplay() {
        Display display = selectActiveDisplay();
        String newSignature = signatureOf(display);
        if (windowManager == null || root == null || !newSignature.equals(displaySignature)) {
            rebuildForDisplay(display);
        }
    }

    private void rebuildForActiveDisplay() {
        rebuildForDisplay(selectActiveDisplay());
    }

    private void rebuildForDisplay(Display display) {
        float levelToRestore = lastLevel;
        removeCurrentWindow();
        root = null;
        glassView = null;
        layoutParams = null;
        windowManager = null;
        windowContext = null;
        displaySignature = "";

        if (display == null) return;

        try {
            windowContext = appContext.createWindowContext(
                    display,
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    null);
            windowManager = windowContext.getSystemService(WindowManager.class);
            buildWindow(windowContext);
            displaySignature = signatureOf(display);

            if (levelToRestore >= 0.015f && Settings.canDrawOverlays(appContext)) {
                glassView.setGlassLevel(levelToRestore, isBlurAvailable());
                layoutParams.setBlurBehindRadius(Math.round(20f + 104f * levelToRestore));
                layoutParams.alpha = 0.20f + 0.17f * levelToRestore;
                try {
                    windowManager.addView(root, layoutParams);
                    added = true;
                } catch (Exception ignored) {
                    added = false;
                }
            }
        } catch (Exception ignored) {
            windowManager = null;
        }
    }

    private void buildWindow(Context context) {
        root = new FrameLayout(context);
        glassView = new FrostedGlassView(context);
        root.addView(glassView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        int flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                | WindowManager.LayoutParams.FLAG_BLUR_BEHIND;

        layoutParams = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                flags,
                PixelFormat.TRANSLUCENT);
        layoutParams.gravity = Gravity.TOP | Gravity.START;
        layoutParams.setBlurBehindRadius(0);
        layoutParams.alpha = 0.20f;
        applyKeepScreenFlags(layoutParams);
    }

    private void applyKeepScreenFlags(WindowManager.LayoutParams params) {
        if (keepScreenOn) {
            params.flags |= WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;
            params.flags |= WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
        } else {
            params.flags &= ~WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;
            params.flags &= ~WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
        }
    }

    private void removeCurrentWindow() {
        if (added && root != null && windowManager != null) {
            try {
                windowManager.removeView(root);
            } catch (Exception ignored) {}
        }
        added = false;
    }

    private Display selectActiveDisplay() {
        if (displayManager == null) return null;

        Display defaultDisplay = displayManager.getDisplay(Display.DEFAULT_DISPLAY);
        if (isVisibleState(defaultDisplay)) return defaultDisplay;

        Display[] displays = displayManager.getDisplays();
        for (Display display : displays) {
            if (display.getState() == Display.STATE_ON) return display;
        }
        for (Display display : displays) {
            if (isVisibleState(display)) return display;
        }
        return defaultDisplay != null ? defaultDisplay : (displays.length > 0 ? displays[0] : null);
    }

    private static boolean isVisibleState(Display display) {
        if (display == null) return false;
        int state = display.getState();
        return state == Display.STATE_ON
                || state == Display.STATE_DOZE
                || state == Display.STATE_DOZE_SUSPEND;
    }

    @SuppressWarnings("deprecation")
    private static String signatureOf(Display display) {
        if (display == null) return "none";
        Point size = new Point();
        try {
            display.getRealSize(size);
        } catch (Exception ignored) {}
        return display.getDisplayId()
                + ":" + size.x + "x" + size.y
                + ":r" + display.getRotation()
                + ":s" + display.getState();
    }

    private static float clamp(float value) {
        return Math.max(0f, Math.min(1f, value));
    }

    private static final class FrostedGlassView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private float level = 0f;
        private boolean realBlur = false;

        FrostedGlassView(Context context) {
            super(context);
            setWillNotDraw(false);
        }

        void setGlassLevel(float level, boolean realBlur) {
            this.level = clamp(level);
            this.realBlur = realBlur;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            int h = Math.max(1, getHeight());
            int baseAlpha = realBlur
                    ? Math.round(42f + 50f * level)
                    : Math.round(76f + 82f * level);
            int top = Color.argb(baseAlpha, 244, 249, 252);
            int bottom = Color.argb(Math.max(0, baseAlpha - 14), 224, 233, 239);
            paint.setShader(new LinearGradient(0f, 0f, 0f, h, top, bottom, Shader.TileMode.CLAMP));
            canvas.drawRect(0f, 0f, getWidth(), h, paint);
            paint.setShader(null);
        }
    }
}
