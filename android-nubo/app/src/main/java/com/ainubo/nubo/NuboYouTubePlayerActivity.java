package com.ainubo.nubo;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

/**
 * NUBO-owned YouTube playback surface.
 *
 * The first song opens this Activity. Later song changes are delivered through an
 * in-app broadcast and switched inside the existing YouTube IFrame player with
 * loadVideoById(), so NUBO never needs to manipulate the third-party YouTube app.
 */
public final class NuboYouTubePlayerActivity extends Activity {
    public static final String EXTRA_VIDEO_ID = "nubo_video_id";
    public static final String EXTRA_TITLE = "nubo_video_title";
    public static final String EXTRA_CHANNEL = "nubo_video_channel";

    private static final String ACTION_SWITCH =
        "com.ainubo.nubo.action.SWITCH_NUBO_YOUTUBE_VIDEO";
    private static final String PLAYER_BASE_URL =
        "https://nubo.ainubo.com/youtube-player";

    private static volatile boolean running = false;

    private WebView webView;
    private boolean pageReady = false;
    private boolean receiverRegistered = false;
    private String pendingVideoId = "";
    private String pendingTitle = "";
    private String pendingChannel = "";

    public static boolean isRunning() {
        return running;
    }

    public static void sendSongSwitch(
        Context context,
        String videoId,
        String title,
        String channel
    ) {
        Intent intent = new Intent(ACTION_SWITCH);
        intent.setPackage(context.getPackageName());
        intent.putExtra(EXTRA_VIDEO_ID, videoId);
        intent.putExtra(EXTRA_TITLE, title == null ? "" : title);
        intent.putExtra(EXTRA_CHANNEL, channel == null ? "" : channel);
        context.sendBroadcast(intent);
    }

    private final BroadcastReceiver switchReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || !ACTION_SWITCH.equals(intent.getAction())) return;
            acceptSong(
                intent.getStringExtra(EXTRA_VIDEO_ID),
                intent.getStringExtra(EXTRA_TITLE),
                intent.getStringExtra(EXTRA_CHANNEL),
                false
            );
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        setContentView(
            webView,
            new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        );

        configureWebView();
        registerSwitchReceiver();
        acceptSongFromIntent(getIntent(), true);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setUserAgentString(
            settings.getUserAgentString() + " NUBO-Android-Player/37"
        );

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                pageReady = url != null && url.startsWith(PLAYER_BASE_URL);
                if (pageReady && isValidVideoId(pendingVideoId)) {
                    switchPlayerInPlace(
                        pendingVideoId,
                        pendingTitle,
                        pendingChannel
                    );
                }
            }
        });
    }

    private void registerSwitchReceiver() {
        IntentFilter filter = new IntentFilter(ACTION_SWITCH);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(switchReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(switchReceiver, filter);
        }
        receiverRegistered = true;
    }

    private void acceptSongFromIntent(Intent intent, boolean initial) {
        if (intent == null) return;
        acceptSong(
            intent.getStringExtra(EXTRA_VIDEO_ID),
            intent.getStringExtra(EXTRA_TITLE),
            intent.getStringExtra(EXTRA_CHANNEL),
            initial
        );
    }

    private void acceptSong(
        String videoId,
        String title,
        String channel,
        boolean initial
    ) {
        String safeVideoId = videoId == null ? "" : videoId.trim();
        if (!isValidVideoId(safeVideoId)) return;

        pendingVideoId = safeVideoId;
        pendingTitle = title == null ? "" : title.trim();
        pendingChannel = channel == null ? "" : channel.trim();

        runOnUiThread(() -> {
            if (!initial && pageReady) {
                switchPlayerInPlace(
                    pendingVideoId,
                    pendingTitle,
                    pendingChannel
                );
                return;
            }

            loadPlayerPage(
                pendingVideoId,
                pendingTitle,
                pendingChannel
            );
        });
    }

    private void loadPlayerPage(String videoId, String title, String channel) {
        pageReady = false;
        Uri url = Uri.parse(PLAYER_BASE_URL)
            .buildUpon()
            .appendQueryParameter("videoId", videoId)
            .appendQueryParameter("title", title)
            .appendQueryParameter("channel", channel)
            .appendQueryParameter("native", "1")
            .build();
        webView.loadUrl(url.toString());
    }

    private void switchPlayerInPlace(
        String videoId,
        String title,
        String channel
    ) {
        if (!isValidVideoId(videoId) || webView == null) return;

        String script =
            "(function(){return !!(window.nuboYouTubeLoadVideo&&"
                + "window.nuboYouTubeLoadVideo("
                + JSONObject.quote(videoId)
                + ","
                + JSONObject.quote(title == null ? "" : title)
                + ","
                + JSONObject.quote(channel == null ? "" : channel)
                + "));})();";

        webView.evaluateJavascript(script, result -> {
            if (!"true".equals(result)) {
                loadPlayerPage(videoId, title, channel);
            }
        });
    }

    private static boolean isValidVideoId(String videoId) {
        return videoId != null && videoId.matches("^[A-Za-z0-9_-]{11}$");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        acceptSongFromIntent(intent, false);
    }

    @Override
    protected void onStart() {
        super.onStart();
        running = true;
    }

    @Override
    protected void onStop() {
        running = false;
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        running = false;
        if (receiverRegistered) {
            try {
                unregisterReceiver(switchReceiver);
            } catch (IllegalArgumentException ignored) {
                // Receiver may already have been detached by the framework.
            }
            receiverRegistered = false;
        }
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
