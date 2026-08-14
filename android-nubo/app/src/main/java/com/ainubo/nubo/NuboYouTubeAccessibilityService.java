package com.ainubo.nubo;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicLong;

/**
 * V40 foreground YouTube controller.
 *
 * Android/YouTube can reuse the existing YouTube task and swallow a second
 * ACTION_VIEW deep link. This service avoids that route entirely for song
 * changes: when YouTube is already foreground it drives YouTube's own search UI
 * from an explicit NUBO voice command and selects the resolved title.
 *
 * The service is scoped to com.google.android.youtube only. It does not collect,
 * persist, or transmit accessibility content.
 */
public final class NuboYouTubeAccessibilityService extends AccessibilityService {
    private static final String YOUTUBE_PACKAGE = "com.google.android.youtube";
    private static volatile NuboYouTubeAccessibilityService instance;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final AtomicLong generation = new AtomicLong(0L);

    public static boolean isReady() {
        return instance != null;
    }

    public static boolean requestSongSwitch(String resolvedTitle) {
        NuboYouTubeAccessibilityService service = instance;
        if (service == null || resolvedTitle == null || resolvedTitle.trim().isEmpty()) {
            return false;
        }
        return service.enqueueSongSwitch(resolvedTitle.trim());
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // Commands are driven by explicit NUBO voice requests only.
    }

    @Override
    public void onInterrupt() {
        // No continuous automation is owned by this service.
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        if (instance == this) instance = null;
        generation.incrementAndGet();
        handler.removeCallbacksAndMessages(null);
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        generation.incrementAndGet();
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private boolean enqueueSongSwitch(String title) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!isYouTubeRoot(root)) return false;

        long token = generation.incrementAndGet();
        handler.removeCallbacksAndMessages(null);
        handler.post(() -> openSearch(title, token, 0));
        return true;
    }

    private boolean current(long token) {
        return generation.get() == token;
    }

    private boolean isYouTubeRoot(AccessibilityNodeInfo root) {
        if (root == null || root.getPackageName() == null) return false;
        return YOUTUBE_PACKAGE.contentEquals(root.getPackageName());
    }

    private void openSearch(String title, long token, int attempt) {
        if (!current(token)) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!isYouTubeRoot(root)) return;

        AccessibilityNodeInfo editable = findEditable(root);
        if (editable != null) {
            setSearchText(title, token, editable);
            return;
        }

        AccessibilityNodeInfo trigger = findSearchTrigger(root);
        if (trigger != null && clickNode(trigger)) {
            handler.postDelayed(() -> waitForSearchBox(title, token, 0), 240L);
            return;
        }

        if (attempt < 7) {
            handler.postDelayed(() -> openSearch(title, token, attempt + 1), 180L);
        }
    }

    private void waitForSearchBox(String title, long token, int attempt) {
        if (!current(token)) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!isYouTubeRoot(root)) return;

        AccessibilityNodeInfo editable = findEditable(root);
        if (editable != null) {
            setSearchText(title, token, editable);
            return;
        }

        if (attempt < 10) {
            handler.postDelayed(() -> waitForSearchBox(title, token, attempt + 1), 150L);
        }
    }

    private void setSearchText(String title, long token, AccessibilityNodeInfo editable) {
        if (!current(token) || editable == null) return;

        editable.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
        Bundle args = new Bundle();
        args.putCharSequence(
            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
            title
        );

        boolean set = editable.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
        if (!set) {
            tapCenter(editable);
            handler.postDelayed(() -> retrySetSearchText(title, token), 180L);
            return;
        }

        handler.postDelayed(() -> submitSearch(title, token), 160L);
    }

    private void retrySetSearchText(String title, long token) {
        if (!current(token)) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        AccessibilityNodeInfo editable = findEditable(root);
        if (editable == null) return;

        Bundle args = new Bundle();
        args.putCharSequence(
            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
            title
        );
        if (editable.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
            handler.postDelayed(() -> submitSearch(title, token), 160L);
        }
    }

    private void submitSearch(String title, long token) {
        if (!current(token)) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!isYouTubeRoot(root)) return;

        AccessibilityNodeInfo editable = findEditable(root);
        boolean submitted = false;
        if (editable != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            submitted = editable.performAction(
                AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId()
            );
        }

        long firstDelay = submitted ? 560L : 700L;
        handler.postDelayed(() -> selectResolvedVideo(title, token, 0), firstDelay);
    }

    private void selectResolvedVideo(String title, long token, int attempt) {
        if (!current(token)) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!isYouTubeRoot(root)) return;

        AccessibilityNodeInfo candidate = findBestVideoCandidate(root, title);
        if (candidate != null && clickNode(candidate)) {
            // If the first click selected an autocomplete suggestion, YouTube will
            // still show a searchable results surface. Re-evaluate once and click
            // the actual matching video. Unlike V35, do NOT use a generic Pause
            // button as a player guard because the old song's mini-player remains
            // visible during search and caused false positives.
            handler.postDelayed(() -> secondPassIfSearchStillVisible(title, token), 820L);
            return;
        }

        if (attempt < 8) {
            handler.postDelayed(() -> selectResolvedVideo(title, token, attempt + 1), 220L);
            return;
        }

        tapFirstResultArea(root);
    }

    private void secondPassIfSearchStillVisible(String title, long token) {
        if (!current(token)) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!isYouTubeRoot(root)) return;

        boolean searchSurfaceVisible = findEditable(root) != null || hasSearchLabel(root);
        if (!searchSurfaceVisible) return;

        AccessibilityNodeInfo candidate = findBestVideoCandidate(root, title);
        if (candidate != null) clickNode(candidate);
    }

    private AccessibilityNodeInfo findSearchTrigger(AccessibilityNodeInfo root) {
        if (root == null) return null;
        AccessibilityNodeInfo best = null;
        int bestScore = Integer.MIN_VALUE;

        for (AccessibilityNodeInfo node : flatten(root)) {
            if (node == null || node.isEditable()) continue;
            String id = safe(node.getViewIdResourceName()).toLowerCase(Locale.ROOT);
            String label = nodeLabel(node).toLowerCase(Locale.ROOT).trim();

            int score = 0;
            if (id.contains("search")) score += 100;
            if (label.equals("search") || label.equals("搜尋") || label.equals("搜索")) score += 95;
            if (label.startsWith("search ") || label.startsWith("搜尋 ")) score += 65;
            if (label.contains("搜尋") || label.contains("search")) score += 35;

            AccessibilityNodeInfo clickable = node.isClickable() ? node : clickableAncestor(node);
            if (clickable == null) continue;
            Rect bounds = boundsOf(clickable);
            if (bounds.width() < 20 || bounds.height() < 20) continue;

            if (score > bestScore) {
                bestScore = score;
                best = clickable;
            }
        }
        return bestScore >= 60 ? best : null;
    }

    private AccessibilityNodeInfo findEditable(AccessibilityNodeInfo root) {
        if (root == null) return null;
        for (AccessibilityNodeInfo node : flatten(root)) {
            if (node == null) continue;
            String cls = safe(node.getClassName()).toLowerCase(Locale.ROOT);
            if (node.isEditable() || cls.contains("edittext")) return node;
        }
        return null;
    }

    private boolean hasSearchLabel(AccessibilityNodeInfo root) {
        if (root == null) return false;
        for (AccessibilityNodeInfo node : flatten(root)) {
            String label = nodeLabel(node).toLowerCase(Locale.ROOT);
            if (label.equals("search") || label.equals("搜尋") || label.equals("搜索")) {
                return true;
            }
        }
        return false;
    }

    private AccessibilityNodeInfo findBestVideoCandidate(
        AccessibilityNodeInfo root,
        String title
    ) {
        if (root == null) return null;
        String normalizedTitle = normalize(title);
        if (normalizedTitle.isEmpty()) return null;

        AccessibilityNodeInfo best = null;
        int bestScore = Integer.MIN_VALUE;

        for (AccessibilityNodeInfo node : flatten(root)) {
            if (node == null || node.isEditable()) continue;
            String label = nodeLabel(node);
            String normalizedLabel = normalize(label);
            if (normalizedLabel.isEmpty()) continue;

            AccessibilityNodeInfo clickable = node.isClickable() ? node : clickableAncestor(node);
            if (clickable == null) continue;
            Rect bounds = boundsOf(clickable);
            if (bounds.width() < 40 || bounds.height() < 30) continue;

            int score = similarityScore(normalizedLabel, normalizedTitle);
            String lower = label.toLowerCase(Locale.ROOT);
            if (lower.contains("分鐘") || lower.matches(".*\\b\\d{1,2}:\\d{2}\\b.*")) score += 18;
            if (lower.contains("觀看") || lower.contains("views")) score += 10;
            if (lower.contains("官方") || lower.contains("official") || lower.contains("topic")) score += 12;
            if (lower.contains("清除搜尋") || lower.contains("clear search")) score -= 100;
            if (lower.equals("搜尋") || lower.equals("search")) score -= 100;

            if (score > bestScore) {
                bestScore = score;
                best = clickable;
            }
        }

        return bestScore >= 48 ? best : null;
    }

    private int similarityScore(String label, String title) {
        if (label.equals(title)) return 120;
        if (label.contains(title)) return 105;
        if (title.contains(label) && label.length() >= 6) return 80;

        int score = 0;
        int prefix = Math.min(10, title.length());
        if (prefix >= 4 && label.contains(title.substring(0, prefix))) score += 50;

        for (String token : splitTokens(title)) {
            if (token.length() >= 2 && label.contains(token)) score += 14;
        }
        return score;
    }

    private List<String> splitTokens(String value) {
        List<String> result = new ArrayList<>();
        String raw = safe(value).toLowerCase(Locale.ROOT);
        for (String token : raw.split("[\\s　·・|/\\-_:：]+")) {
            String normalized = normalize(token);
            if (!normalized.isEmpty()) result.add(normalized);
        }
        return result;
    }

    private boolean clickNode(AccessibilityNodeInfo node) {
        if (node == null) return false;
        AccessibilityNodeInfo target = node.isClickable() ? node : clickableAncestor(node);
        if (target != null && target.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
            return true;
        }
        return tapCenter(target != null ? target : node);
    }

    private AccessibilityNodeInfo clickableAncestor(AccessibilityNodeInfo node) {
        AccessibilityNodeInfo current = node == null ? null : node.getParent();
        int depth = 0;
        while (current != null && depth < 7) {
            if (current.isClickable()) return current;
            current = current.getParent();
            depth += 1;
        }
        return null;
    }

    private Rect boundsOf(AccessibilityNodeInfo node) {
        Rect bounds = new Rect();
        if (node != null) node.getBoundsInScreen(bounds);
        return bounds;
    }

    private boolean tapCenter(AccessibilityNodeInfo node) {
        Rect bounds = boundsOf(node);
        if (bounds.isEmpty()) return false;
        return dispatchTap(bounds.centerX(), bounds.centerY());
    }

    private void tapFirstResultArea(AccessibilityNodeInfo root) {
        Rect bounds = boundsOf(root);
        if (bounds.isEmpty()) return;
        dispatchTap(bounds.exactCenterX(), bounds.top + (bounds.height() * 0.34f));
    }

    private boolean dispatchTap(float x, float y) {
        Path path = new Path();
        path.moveTo(x, y);
        GestureDescription gesture = new GestureDescription.Builder()
            .addStroke(new GestureDescription.StrokeDescription(path, 0L, 70L))
            .build();
        return dispatchGesture(gesture, null, handler);
    }

    private List<AccessibilityNodeInfo> flatten(AccessibilityNodeInfo root) {
        List<AccessibilityNodeInfo> nodes = new ArrayList<>();
        if (root == null) return nodes;

        Deque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        int visited = 0;
        while (!queue.isEmpty() && visited < 2200) {
            AccessibilityNodeInfo node = queue.removeFirst();
            nodes.add(node);
            visited += 1;
            for (int i = 0; i < node.getChildCount(); i += 1) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) queue.addLast(child);
            }
        }
        return nodes;
    }

    private String nodeLabel(AccessibilityNodeInfo node) {
        if (node == null) return "";
        String text = safe(node.getText());
        String description = safe(node.getContentDescription());
        if (text.isEmpty()) return description;
        if (description.isEmpty() || description.equals(text)) return text;
        return text + " " + description;
    }

    private String normalize(String value) {
        return safe(value)
            .toLowerCase(Locale.ROOT)
            .replaceAll("[\\s　，,。.!！?？、:：;；'\\\"“”‘’（）()【】\\[\\]_-]+", "");
    }

    private String safe(CharSequence value) {
        return value == null ? "" : value.toString().trim();
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }
}
