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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * v0.7 multi-display hand-off renderer.
 *
 * The key change is that a known cover/inner logical display is eligible for an
 * overlay even while ColorOS reports it OFF. v0.7 can therefore prepare the
 * frost on the cover first, then the privileged display-power bridge turns that
 * same panel ON without a black gap in between.
 */
final class GlassOverlayController {
    private static final String BUILT_IN_CATEGORY =
            "android.hardware.display.category.BUILT_IN_DISPLAYS";

    private final Context appContext;
    private final DisplayManager displayManager;
    private final Map<Integer, OverlaySlot> keeperSlots = new HashMap<>();

    private OverlaySlot blurSlot;
    private int coverDisplayHint = -1;
    private int innerDisplayHint = -1;
    private int resolvedCoverDisplayId = -1;
    private int resolvedInnerDisplayId = -1;
    private boolean keepScreenOn = false;
    private float lastLevel = 0f;

    GlassOverlayController(Context context) {
        appContext = context.getApplicationContext();
        displayManager = appContext.getSystemService(DisplayManager.class);
    }

    boolean isBlurAvailable() {
        try {
            WindowManager wm = appContext.getSystemService(WindowManager.class);
            return wm != null && wm.isCrossWindowBlurEnabled();
        } catch (Exception ignored) {
            return false;
        }
    }

    void setCoverDisplayHint(int displayId) {
        coverDisplayHint = displayId;
    }

    void setHandoffDisplayHints(int coverId, int innerId) {
        coverDisplayHint = coverId;
        innerDisplayHint = innerId;
    }

    int captureCoverDisplayHint() {
        List<Display> visible = visibleDisplays();
        Display smallest = smallestDisplay(visible);
        if (smallest != null) {
            coverDisplayHint = smallest.getDisplayId();
            resolvedCoverDisplayId = coverDisplayHint;
        }
        return coverDisplayHint;
    }

    int getResolvedCoverDisplayId() {
        return resolvedCoverDisplayId;
    }

    int getResolvedInnerDisplayId() {
        return resolvedInnerDisplayId;
    }

    int getVisibleDisplayCount() {
        return visibleDisplays().size();
    }

    int getActiveBuiltInDisplayCount() {
        int count = 0;
        for (Display display : builtInDisplays()) {
            if (isVisibleState(display)) count++;
        }
        return count;
    }

    int getBuiltInDisplayCount() {
        return builtInDisplays().size();
    }

    boolean areBothBuiltInDisplaysActive() {
        return getActiveBuiltInDisplayCount() >= 2;
    }

    String getDisplaySummary() {
        List<Display> displays = allHandoffDisplays();
        if (displays.isEmpty()) return "no built-in displays";
        StringBuilder out = new StringBuilder();
        for (Display display : displays) {
            if (out.length() > 0) out.append(" | ");
            Point p = realSize(display);
            out.append("#").append(display.getDisplayId())
                    .append(" ").append(p.x).append("x").append(p.y)
                    .append(" s=").append(stateName(display.getState()));
        }
        return out.toString();
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
        reconcileDisplays();
        return blurSlot != null && blurSlot.added;
    }

    void setKeepScreenOn(boolean enabled) {
        keepScreenOn = enabled;
        if (!enabled) {
            clearKeepers();
            if (blurSlot != null) {
                blurSlot.keepAwake = false;
                blurSlot.applyParams();
            }
            return;
        }
        if (lastLevel >= 0.015f) reconcileDisplays();
    }

    void refreshDisplayBinding() {
        if (lastLevel >= 0.015f) reconcileDisplays();
    }

    void forceRebind() {
        removeBlurSlot();
        clearKeepers();
        if (lastLevel >= 0.015f) reconcileDisplays();
    }

    void hide() {
        lastLevel = 0f;
        resolvedCoverDisplayId = -1;
        resolvedInnerDisplayId = -1;
        removeBlurSlot();
        clearKeepers();
    }

    private void reconcileDisplays() {
        // v0.7 deliberately uses all known built-in/hinted displays here, not
        // only ON displays. An OFF cover can receive its window before power-on.
        List<Display> candidates = allHandoffDisplays();
        if (candidates.isEmpty()) {
            removeBlurSlot();
            clearKeepers();
            resolvedCoverDisplayId = -1;
            resolvedInnerDisplayId = -1;
            return;
        }

        Display cover = resolveCoverDisplay(candidates);
        Display inner = resolveInnerDisplay(candidates, cover);
        resolvedCoverDisplayId = cover == null ? -1 : cover.getDisplayId();
        resolvedInnerDisplayId = inner == null ? -1 : inner.getDisplayId();

        if (cover != null) ensureBlurSlot(cover);
        else removeBlurSlot();

        if (keepScreenOn) {
            Set<Integer> desiredKeepers = new HashSet<>();
            for (Display display : candidates) {
                if (cover != null && display.getDisplayId() == cover.getDisplayId()) continue;
                desiredKeepers.add(display.getDisplayId());
                ensureKeeper(display);
            }
            removeStaleKeepers(desiredKeepers);
        } else {
            clearKeepers();
        }
    }

    private void ensureBlurSlot(Display display) {
        String signature = signatureOf(display);
        if (blurSlot == null
                || blurSlot.displayId != display.getDisplayId()
                || !signature.equals(blurSlot.signature)) {
            removeBlurSlot();
            blurSlot = OverlaySlot.create(appContext, display, true);
        }
        if (blurSlot == null) return;
        blurSlot.keepAwake = keepScreenOn;
        blurSlot.level = lastLevel;
        blurSlot.realBlur = blurSlot.windowManager != null
                && safeBlurEnabled(blurSlot.windowManager);
        blurSlot.ensureAdded();
        blurSlot.applyParams();
    }

    private void ensureKeeper(Display display) {
        int id = display.getDisplayId();
        String signature = signatureOf(display);
        OverlaySlot slot = keeperSlots.get(id);
        if (slot == null || !signature.equals(slot.signature)) {
            if (slot != null) slot.remove();
            slot = OverlaySlot.create(appContext, display, false);
            if (slot != null) keeperSlots.put(id, slot);
        }
        if (slot != null) {
            slot.keepAwake = true;
            slot.ensureAdded();
            slot.applyParams();
        }
    }

    private void removeStaleKeepers(Set<Integer> desired) {
        List<Integer> remove = new ArrayList<>();
        for (Map.Entry<Integer, OverlaySlot> entry : keeperSlots.entrySet()) {
            if (!desired.contains(entry.getKey())) {
                entry.getValue().remove();
                remove.add(entry.getKey());
            }
        }
        for (Integer id : remove) keeperSlots.remove(id);
    }

    private void removeBlurSlot() {
        if (blurSlot != null) blurSlot.remove();
        blurSlot = null;
    }

    private void clearKeepers() {
        for (OverlaySlot slot : keeperSlots.values()) slot.remove();
        keeperSlots.clear();
    }

    private Display resolveCoverDisplay(List<Display> candidates) {
        if (coverDisplayHint >= 0) {
            for (Display display : candidates) {
                if (display.getDisplayId() == coverDisplayHint) return display;
            }
            // If a known cover id is absent, never frost the only remaining
            // display because that is usually the large inner panel.
            if (candidates.size() == 1) return null;
        }
        return smallestDisplay(candidates);
    }

    private Display resolveInnerDisplay(List<Display> candidates, Display cover) {
        if (innerDisplayHint >= 0) {
            for (Display display : candidates) {
                if (display.getDisplayId() == innerDisplayHint) return display;
            }
        }
        Display best = null;
        long bestArea = -1L;
        for (Display display : candidates) {
            if (cover != null && display.getDisplayId() == cover.getDisplayId()) continue;
            Point p = realSize(display);
            long area = (long) Math.max(1, p.x) * Math.max(1, p.y);
            if (area > bestArea) {
                bestArea = area;
                best = display;
            }
        }
        return best;
    }

    private static Display smallestDisplay(List<Display> displays) {
        Display best = null;
        long bestArea = Long.MAX_VALUE;
        for (Display display : displays) {
            Point p = realSize(display);
            long area = (long) Math.max(1, p.x) * Math.max(1, p.y);
            if (area < bestArea) {
                bestArea = area;
                best = display;
            }
        }
        return best;
    }

    private List<Display> visibleDisplays() {
        List<Display> out = new ArrayList<>();
        for (Display display : builtInDisplays()) {
            if (isVisibleState(display)) out.add(display);
        }
        return out;
    }

    private List<Display> allHandoffDisplays() {
        List<Display> out = builtInDisplays();
        if (displayManager == null) return out;
        Set<Integer> seen = new HashSet<>();
        for (Display d : out) seen.add(d.getDisplayId());

        addHintedDisplay(out, seen, coverDisplayHint);
        addHintedDisplay(out, seen, innerDisplayHint);
        return out;
    }

    private void addHintedDisplay(List<Display> out, Set<Integer> seen, int id) {
        if (id < 0 || displayManager == null || seen.contains(id)) return;
        try {
            Display display = displayManager.getDisplay(id);
            if (display != null && seen.add(id)) out.add(display);
        } catch (Throwable ignored) {}
    }

    private List<Display> builtInDisplays() {
        List<Display> out = new ArrayList<>();
        if (displayManager == null) return out;

        Display[] candidate = new Display[0];
        try {
            candidate = displayManager.getDisplays(BUILT_IN_CATEGORY);
        } catch (Throwable ignored) {}
        if (candidate == null || candidate.length == 0) {
            candidate = displayManager.getDisplays();
        }

        Set<Integer> seen = new HashSet<>();
        if (candidate != null) {
            for (Display display : candidate) {
                if (display != null && seen.add(display.getDisplayId())) out.add(display);
            }
        }
        return out;
    }

    private static boolean isVisibleState(Display display) {
        if (display == null) return false;
        int state = display.getState();
        return state == Display.STATE_ON
                || state == Display.STATE_DOZE
                || state == Display.STATE_DOZE_SUSPEND;
    }

    private static String stateName(int state) {
        if (state == Display.STATE_ON) return "ON";
        if (state == Display.STATE_OFF) return "OFF";
        if (state == Display.STATE_DOZE) return "DOZE";
        if (state == Display.STATE_DOZE_SUSPEND) return "DOZE_SUSPEND";
        if (state == Display.STATE_UNKNOWN) return "UNKNOWN";
        return String.valueOf(state);
    }

    private static boolean safeBlurEnabled(WindowManager wm) {
        try { return wm.isCrossWindowBlurEnabled(); }
        catch (Exception ignored) { return false; }
    }

    @SuppressWarnings("deprecation")
    private static Point realSize(Display display) {
        Point p = new Point();
        try { display.getRealSize(p); } catch (Exception ignored) {}
        return p;
    }

    private static String signatureOf(Display display) {
        if (display == null) return "none";
        Point p = realSize(display);
        return display.getDisplayId() + ":" + p.x + "x" + p.y
                + ":r" + display.getRotation() + ":s" + display.getState();
    }

    private static float clamp(float value) {
        return Math.max(0f, Math.min(1f, value));
    }

    private static final class OverlaySlot {
        final int displayId;
        final String signature;
        final boolean frost;
        final WindowManager windowManager;
        final FrameLayout root;
        final FrostedGlassView glassView;
        final WindowManager.LayoutParams params;
        boolean added = false;
        boolean keepAwake = false;
        float level = 0f;
        boolean realBlur = false;

        private OverlaySlot(int displayId,
                            String signature,
                            boolean frost,
                            WindowManager windowManager,
                            FrameLayout root,
                            FrostedGlassView glassView,
                            WindowManager.LayoutParams params) {
            this.displayId = displayId;
            this.signature = signature;
            this.frost = frost;
            this.windowManager = windowManager;
            this.root = root;
            this.glassView = glassView;
            this.params = params;
        }

        static OverlaySlot create(Context appContext, Display display, boolean frost) {
            try {
                Context wc = appContext.createWindowContext(
                        display,
                        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                        null);
                WindowManager wm = wc.getSystemService(WindowManager.class);
                if (wm == null) return null;

                FrameLayout root = new FrameLayout(wc);
                FrostedGlassView view = frost ? new FrostedGlassView(wc) : null;
                if (view != null) {
                    root.addView(view, new FrameLayout.LayoutParams(
                            FrameLayout.LayoutParams.MATCH_PARENT,
                            FrameLayout.LayoutParams.MATCH_PARENT));
                }

                int flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
                if (frost) flags |= WindowManager.LayoutParams.FLAG_BLUR_BEHIND;

                int width = frost ? WindowManager.LayoutParams.MATCH_PARENT : 2;
                int height = frost ? WindowManager.LayoutParams.MATCH_PARENT : 2;
                WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                        width,
                        height,
                        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                        flags,
                        PixelFormat.TRANSLUCENT);
                lp.gravity = Gravity.TOP | Gravity.START;
                lp.alpha = frost ? 0.20f : 0.01f;
                if (frost) lp.setBlurBehindRadius(0);
                return new OverlaySlot(display.getDisplayId(), signatureOf(display), frost, wm, root, view, lp);
            } catch (Exception ignored) {
                return null;
            }
        }

        void ensureAdded() {
            if (added) return;
            try {
                windowManager.addView(root, params);
                added = true;
            } catch (Exception ignored) {
                added = false;
            }
        }

        @SuppressWarnings("deprecation")
        void applyParams() {
            if (keepAwake) {
                params.flags |= WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;
                params.flags |= WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
            } else {
                params.flags &= ~WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;
                params.flags &= ~WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
            }

            if (frost && glassView != null) {
                glassView.setGlassLevel(level, realBlur);
                params.setBlurBehindRadius(Math.round(20f + 104f * level));
                params.alpha = 0.20f + 0.17f * level;
            } else {
                params.alpha = 0.01f;
            }

            if (added) {
                try { windowManager.updateViewLayout(root, params); }
                catch (Exception ignored) {}
            }
        }

        void remove() {
            if (added) {
                try { windowManager.removeView(root); }
                catch (Exception ignored) {}
            }
            added = false;
        }
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

        @Override protected void onDraw(Canvas canvas) {
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
