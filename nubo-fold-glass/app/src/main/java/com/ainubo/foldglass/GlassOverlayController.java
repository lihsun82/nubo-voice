package com.ainubo.foldglass;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Shader;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;

final class GlassOverlayController {
    private final Context context;
    private final WindowManager windowManager;
    private FrameLayout root;
    private FrostedGlassView glassView;
    private WindowManager.LayoutParams layoutParams;
    private boolean added = false;
    private boolean keepScreenOn = false;

    GlassOverlayController(Context context) {
        this.context = context.getApplicationContext();
        this.windowManager = (WindowManager) this.context.getSystemService(Context.WINDOW_SERVICE);
    }

    boolean isBlurAvailable() {
        return windowManager.isCrossWindowBlurEnabled();
    }

    boolean showLevel(float level) {
        level = clamp(level);
        if (!Settings.canDrawOverlays(context)) {
            hide();
            return false;
        }
        if (level < 0.015f) {
            hide();
            return true;
        }

        ensureWindow();
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
        layoutParams.setBlurBehindRadius(Math.round(18f + 96f * level));
        layoutParams.alpha = 0.18f + 0.16f * level;

        try {
            windowManager.updateViewLayout(root, layoutParams);
        } catch (Exception ignored) {}
        return true;
    }

    void setKeepScreenOn(boolean enabled) {
        keepScreenOn = enabled;
        ensureWindow();

        if (enabled) {
            layoutParams.flags |= WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;
            // Deprecated but still useful as a compatibility wake-up hint on OEM foldables.
            layoutParams.flags |= WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
        } else {
            layoutParams.flags &= ~WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;
            layoutParams.flags &= ~WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
        }

        if (added) {
            try {
                windowManager.updateViewLayout(root, layoutParams);
            } catch (Exception ignored) {}
        }
    }

    void hide() {
        if (added && root != null) {
            try {
                windowManager.removeView(root);
            } catch (Exception ignored) {}
        }
        added = false;
    }

    private void ensureWindow() {
        if (root != null) return;

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

        if (keepScreenOn) {
            flags |= WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;
            flags |= WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
        }

        layoutParams = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                flags,
                PixelFormat.TRANSLUCENT);
        layoutParams.gravity = Gravity.TOP | Gravity.START;
        layoutParams.setBlurBehindRadius(0);
        layoutParams.alpha = 0.18f;
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
                    ? Math.round(38f + 46f * level)
                    : Math.round(70f + 80f * level);
            int top = Color.argb(baseAlpha, 244, 249, 252);
            int bottom = Color.argb(Math.max(0, baseAlpha - 14), 224, 233, 239);
            paint.setShader(new LinearGradient(0f, 0f, 0f, h, top, bottom, Shader.TileMode.CLAMP));
            canvas.drawRect(0f, 0f, getWidth(), h, paint);
            paint.setShader(null);
        }
    }
}
