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
 * Local deterministic YouTube UI controller used only for an explicit NUBO
 * "play/switch to <song>" command while the YouTube app is already foreground.
 *
 * This deliberately does not scrape account/private data, run continuously, or
 * automate arbitrary apps. The service package filter is YouTube-only and each
 * action starts from a user voice command received by NUBO.
 */
public final class NuboYouTubeAccessibilityService extends AccessibilityService {
    private static final String YOUTUBE_PACKAGE = "com.google.android.youtube";
    private static volatile NuboYouTubeAccessibilityService instance;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final AtomicLong commandGeneration = new AtomicLong(0L);

    public static boolean isReady() {
        return instance != null;
    }

    public static boolean requestSongSwitch(String query) {
        NuboYouTubeAccessibilityService service = instance;
        if (service == null || query == null || query.trim().isEmpty()) return false;
        return service.enqueueSongSwitch(query.trim());
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // Commands are explicitly driven by NUBO. Events are intentionally not
        // harvested or persisted; they only keep the service alive for UI actions.
    }

    @Override
    public void onInterrupt() {
        // No continuous speech/audio behavior is owned by this service.
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        if (instance == this) instance = null;
        commandGeneration.incrementAndGet();
        handler.removeCallbacksAndMessages(null);
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        commandGeneration.incrementAndGet();
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private boolean enqueueSongSwitch(String query) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!isYouTubeRoot(root)) return false;

        long generation = commandGeneration.incrementAndGet();
        handler.removeCallbacksAndMessages(null);
        handler.post(() -> startSearch(query, generation, 0));
        return true;
    }

    private boolean isCurrent(long generation) {
        return commandGeneration.get() == generation;
    }

    private boolean isYouTubeRoot(AccessibilityNodeInfo root) {
        if (root == null || root.getPackageName() == null) return false;
        return YOUTUBE_PACKAGE.contentEquals(root.getPackageName());
    }

    private void startSearch(String query, long generation, int attempt) {
        if (!isCurrent(generation)) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!isYouTubeRoot(root)) return;

        AccessibilityNodeInfo editable = findEditable(root);
        if (editable != null) {
            fillSearch(query, generation, editable);
            return;
        }

        AccessibilityNodeInfo search = findSearchTrigger(root);
        if (search != null && clickNode(search)) {
            handler.postDelayed(() -> findAndFillSearch(query, generation, 0), 220L);
            return;
        }

        if (attempt < 5) {
            handler.postDelayed(() -> startSearch(query, generation, attempt + 1), 180L);
        }
    }

    private void findAndFillSearch(String query, long generation, int attempt) {
        if (!isCurrent(generation)) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!isYouTubeRoot(root)) return;

        AccessibilityNodeInfo editable = findEditable(root);
        if (editable != null) {
            fillSearch(query, generation, editable);
            return;
        }

        if (attempt < 8) {
            handler.postDelayed(() -> findAndFillSearch(query, generation, attempt + 1), 160L);
        }
    }

    private void fillSearch(String query, long generation, AccessibilityNodeInfo editable) {
        if (!isCurrent(generation)) return;

        editable.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
        Bundle args = new Bundle();
        args.putCharSequence(
            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
            query
        );
        boolean set = editable.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
        if (!set) {
            tapCenter(editable);
            handler.postDelayed(() -> retryFillAfterTap(query, generation), 180L);
            return;
        }

        handler.postDelayed(() -> submitSearch(query, generation), 180L);
    }

    private void retryFillAfterTap(String query, long generation) {
        if (!isCurrent(generation)) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        AccessibilityNodeInfo editable = findEditable(root);
        if (editable == null) return;
        Bundle args = new Bundle();
        args.putCharSequence(
            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
            query
        );
        editable.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
        handler.postDelayed(() -> submitSearch(query, generation), 180L);
    }

    private void submitSearch(String query, long generation) {
        if (!isCurrent(generation)) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!isYouTubeRoot(root)) return;

        AccessibilityNodeInfo editable = findEditable(root);
        boolean submitted = false;
        if (editable != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            submitted = editable.performAction(
                AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId()
            );
        }

        // YouTube usually shows live suggestions even without IME_ENTER. Whether
        // Enter was accepted or not, resolve the best visible query/result node.
        long delay = submitted ? 520L : 650L;
        handler.postDelayed(() -> clickBestCandidate(query, generation, 0), delay);
    }

    private void clickBestCandidate(String query, long generation, int attempt) {
        if (!isCurrent(generation)) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!isYouTubeRoot(root)) return;

        AccessibilityNodeInfo candidate = findBestTextCandidate(root, query);
        if (candidate != null && clickNode(candidate)) {
            // First click may select a search suggestion. Make one guarded second
            // pass after the results page settles; if a video is already playing,
            // the player-state guard stops further clicks.
            handler.postDelayed(() -> clickResultIfNeeded(query, generation), 720L);
            return;
        }

        if (attempt < 5) {
            handler.postDelayed(() -> clickBestCandidate(query, generation, attempt + 1), 220L);
            return;
        }

        // Last-resort deterministic tap in the first normal video-result region.
        tapFirstResultArea(root);
    }

    private void clickResultIfNeeded(String query, long generation) {
        if (!isCurrent(generation)) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!isYouTubeRoot(root) || looksLikePlayer(root)) return;

        AccessibilityNodeInfo candidate = findBestTextCandidate(root, query);
        if (candidate != null) {
            clickNode(candidate);
            return;
        }
        tapFirstResultArea(root);
    }

    private AccessibilityNodeInfo findSearchTrigger(AccessibilityNodeInfo root) {
        if (root == null) return null;
        for (AccessibilityNodeInfo node : flatten(root)) {
            if (node == null || node.isEditable()) continue;
            String id = safe(node.getViewIdResourceName()).toLowerCase(Locale.ROOT);
            String label = nodeLabel(node).toLowerCase(Locale.ROOT).trim();
            boolean namedSearch =
                id.contains("search") ||
                label.equals("search") ||
                label.equals("搜尋") ||
                label.equals("搜索") ||
                label.startsWith("搜尋 ") ||
                label.startsWith("search ");
            if (namedSearch && (node.isClickable() || clickableAncestor(node) != null)) {
                return node;
            }
        }
        return null;
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

    private AccessibilityNodeInfo findBestTextCandidate(AccessibilityNodeInfo root, String query) {
        if (root == null) return null;
        String normalizedQuery = normalize(query);
        if (normalizedQuery.isEmpty()) return null;

        AccessibilityNodeInfo best = null;
        int bestScore = Integer.MIN_VALUE;
        for (AccessibilityNodeInfo node : flatten(root)) {
            if (node == null || node.isEditable()) continue;
            String label = normalize(nodeLabel(node));
            if (label.isEmpty()) continue;

            AccessibilityNodeInfo clickable = node.isClickable() ? node : clickableAncestor(node);
            if (clickable == null) continue;

            int score = similarityScore(label, normalizedQuery);
            if (score > bestScore) {
                Rect bounds = new Rect();
                clickable.getBoundsInScreen(bounds);
                if (bounds.width() > 20 && bounds.height() > 20) {
                    bestScore = score;
                    best = clickable;
                }
            }
        }

        return bestScore >= 35 ? best : null;
    }

    private int similarityScore(String label, String query) {
        if (label.equals(query)) return 100;
        if (label.contains(query)) return 90;
        if (query.contains(label) && label.length() >= 5) return 75;

        int score = 0;
        int chunk = Math.min(8, query.length());
        if (chunk >= 4 && label.contains(query.substring(0, chunk))) score += 45;

        for (String token : query.split("[\\s·・|/\\-]+")) {
            if (token.length() >= 2 && label.contains(token)) score += 12;
        }
        return score;
    }

    private boolean looksLikePlayer(AccessibilityNodeInfo root) {
        for (AccessibilityNodeInfo node : flatten(root)) {
            String label = nodeLabel(node).toLowerCase(Locale.ROOT);
            if (
                label.equals("pause") ||
                label.equals("暫停") ||
                label.contains("暫停影片") ||
                label.contains("pause video")
            ) {
                return true;
            }
        }
        return false;
    }

    private boolean clickNode(AccessibilityNodeInfo node) {
        if (node == null) return false;
        AccessibilityNodeInfo target = node.isClickable() ? node : clickableAncestor(node);
        if (target != null && target.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
        return tapCenter(target != null ? target : node);
    }

    private AccessibilityNodeInfo clickableAncestor(AccessibilityNodeInfo node) {
        AccessibilityNodeInfo current = node == null ? null : node.getParent();
        int depth = 0;
        while (current != null && depth < 6) {
            if (current.isClickable()) return current;
            current = current.getParent();
            depth += 1;
        }
        return null;
    }

    private boolean tapCenter(AccessibilityNodeInfo node) {
        if (node == null) return false;
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        if (bounds.isEmpty()) return false;
        return dispatchTap(bounds.centerX(), bounds.centerY());
    }

    private void tapFirstResultArea(AccessibilityNodeInfo root) {
        if (root == null) return;
        Rect bounds = new Rect();
        root.getBoundsInScreen(bounds);
        if (bounds.isEmpty()) return;
        float x = bounds.exactCenterX();
        float y = bounds.top + (bounds.height() * 0.36f);
        dispatchTap(x, y);
    }

    private boolean dispatchTap(float x, float y) {
        Path path = new Path();
        path.moveTo(x, y);
        GestureDescription gesture = new GestureDescription.Builder()
            .addStroke(new GestureDescription.StrokeDescription(path, 0L, 80L))
            .build();
        return dispatchGesture(gesture, null, handler);
    }

    private List<AccessibilityNodeInfo> flatten(AccessibilityNodeInfo root) {
        List<AccessibilityNodeInfo> nodes = new ArrayList<>();
        if (root == null) return nodes;
        Deque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        int visited = 0;
        while (!queue.isEmpty() && visited < 1800) {
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
            .replaceAll("[\\s　，,。.!！?？、:：;；'\"“”‘’（）()【】\\[\\]_-]+", "");
    }

    private String safe(CharSequence value) {
        return value == null ? "" : value.toString().trim();
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }
}
