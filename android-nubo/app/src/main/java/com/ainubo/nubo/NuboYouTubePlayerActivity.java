package com.ainubo.nubo;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

/**
 * NUBO-owned YouTube playback surface backed by the official YouTube IFrame API.
 *
 * The first song opens this Activity. Later song changes are delivered through an
 * in-app broadcast and switched in the SAME player with loadVideoById(). No
 * AccessibilityService, NotificationListener, third-party YouTube task or user
 * setup is required.
 */
public final class NuboYouTubePlayerActivity extends Activity {
    public static final String EXTRA_VIDEO_ID = "nubo_video_id";
    public static final String EXTRA_TITLE = "nubo_video_title";
    public static final String EXTRA_CHANNEL = "nubo_video_channel";

    private static final String ACTION_SWITCH =
        "com.ainubo.nubo.action.SWITCH_NUBO_YOUTUBE_VIDEO";
    private static final String BASE_ORIGIN = "https://nubo.ainubo.com/";

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
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
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
                pageReady = true;
                if (isValidVideoId(pendingVideoId)) {
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
            loadNativePlayerDocument();
        });
    }

    private void loadNativePlayerDocument() {
        pageReady = false;
        String initialVideo = JSONObject.quote(pendingVideoId);
        String initialTitle = JSONObject.quote(pendingTitle);
        String initialChannel = JSONObject.quote(pendingChannel);

        String html = "<!doctype html><html><head>"
            + "<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'>"
            + "<style>html,body{margin:0;width:100%;height:100%;background:#000;color:#fff;font-family:Arial,sans-serif;overflow:hidden}"
            + "#wrap{position:fixed;inset:0;background:#000}#player{position:absolute;inset:0;width:100%;height:100%}"
            + "#meta{position:absolute;left:12px;right:12px;top:12px;z-index:4;padding:10px 12px;border-radius:12px;background:rgba(0,0,0,.55);pointer-events:none}"
            + "#title{font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
            + "#channel{font-size:12px;opacity:.72;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
            + "#status{position:absolute;left:12px;bottom:14px;z-index:5;padding:7px 10px;border-radius:10px;background:rgba(0,0,0,.58);font-size:12px;pointer-events:none}"
            + "</style></head><body><div id='wrap'><div id='player'></div><div id='meta'><div id='title'></div><div id='channel'></div></div><div id='status'>NUBO PLAYER</div></div>"
            + "<script>"
            + "var player=null,currentId=" + initialVideo + ",currentTitle=" + initialTitle + ",currentChannel=" + initialChannel + ";"
            + "function setText(){document.getElementById('title').textContent=currentTitle||'NUBO YouTube';document.getElementById('channel').textContent=currentChannel||'';}"
            + "function status(t){document.getElementById('status').textContent=t;}"
            + "function promoteAudio(){if(!player)return;try{player.setVolume(100);player.unMute();player.playVideo();}catch(e){}}"
            + "function playCurrent(){if(!player||!currentId)return false;try{setText();status('正在切換…');player.setVolume(100);player.unMute();player.loadVideoById(currentId);player.playVideo();[120,350,800,1500,3000].forEach(function(d){setTimeout(promoteAudio,d)});return true}catch(e){status('播放器重試中…');return false}}"
            + "window.nuboYouTubeLoadVideo=function(id,title,channel){if(!/^[A-Za-z0-9_-]{11}$/.test(id||''))return false;currentId=id;currentTitle=title||'';currentChannel=channel||'';setText();if(!player){status('播放器載入中…');return true}return playCurrent();};"
            + "function onYouTubeIframeAPIReady(){player=new YT.Player('player',{width:'100%',height:'100%',videoId:currentId,playerVars:{autoplay:1,playsinline:1,controls:1,rel:0,enablejsapi:1,origin:'https://nubo.ainubo.com'},events:{"
            + "onReady:function(e){status('正在播放');try{e.target.setVolume(100);e.target.unMute();e.target.loadVideoById(currentId);e.target.playVideo();[150,500,1200,2500].forEach(function(d){setTimeout(promoteAudio,d)})}catch(x){}},"
            + "onStateChange:function(e){if(e.data===1)status('播放中');else if(e.data===3)status('載入中…');else if(e.data===2)status('已暫停')},"
            + "onAutoplayBlocked:function(e){status('正在自動啟動播放…');try{e.target.mute();e.target.loadVideoById(currentId);e.target.playVideo();setTimeout(promoteAudio,300);setTimeout(promoteAudio,1000)}catch(x){}},"
            + "onError:function(){status('此影片無法播放，請再指定另一首')}'"
            + "}});setText();}"
            + "</script><script src='https://www.youtube.com/iframe_api'></script></body></html>";

        // Fix the final JS object quote generated above while keeping the Java string
        // readable. This exact replacement is local and deterministic.
        html = html.replace("onError:function(){status('此影片無法播放，請再指定另一首')}'", "onError:function(){status('此影片無法播放，請再指定另一首')}");

        webView.loadDataWithBaseURL(
            BASE_ORIGIN,
            html,
            "text/html",
            "UTF-8",
            null
        );
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
                loadNativePlayerDocument();
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
