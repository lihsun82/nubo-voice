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
 * NUBO Room Music playback surface backed by the official YouTube IFrame API.
 *
 * V38 deliberately starts each video muted, waits for the YouTube player to enter
 * PLAYING, and only then promotes it to speaker audio. This avoids the common
 * unmuted-autoplay rejection while preserving a zero-tap hotel-room experience.
 * Later song changes stay inside the SAME player via loadVideoById().
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
            settings.getUserAgentString() + " NUBO-Android-Player/38"
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

        String html = "<!doctype html><html><head>"
            + "<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'>"
            + "<meta name='referrer' content='strict-origin-when-cross-origin'>"
            + "<style>html,body,#player{margin:0;width:100%;height:100%;background:#000;overflow:hidden}body{position:fixed;inset:0}iframe{display:block;width:100%!important;height:100%!important;border:0}</style>"
            + "</head><body><div id='player'></div><script>"
            + "var player=null,currentId=" + initialVideo + ",playGeneration=0,unmuteTimers=[];"
            + "function clearUnmuteTimers(){while(unmuteTimers.length){clearTimeout(unmuteTimers.pop());}}"
            + "function promoteAudio(gen){if(!player||gen!==playGeneration)return;try{player.setVolume(100);player.unMute();player.playVideo();}catch(e){}}"
            + "function scheduleAudioPromotion(gen){clearUnmuteTimers();[180,450,900,1600,2800,4500].forEach(function(delay){unmuteTimers.push(setTimeout(function(){promoteAudio(gen)},delay));});}"
            + "function startExactVideo(id){if(!player||!/^[A-Za-z0-9_-]{11}$/.test(id||''))return false;currentId=id;playGeneration+=1;var gen=playGeneration;clearUnmuteTimers();try{player.mute();player.setVolume(100);player.loadVideoById({videoId:currentId,startSeconds:0});player.playVideo();return true}catch(e){return false}}"
            + "window.nuboYouTubeLoadVideo=function(id,title,channel){if(!/^[A-Za-z0-9_-]{11}$/.test(id||''))return false;currentId=id;if(!player)return true;return startExactVideo(id);};"
            + "window.nuboResumePlayback=function(){if(!player)return false;try{player.playVideo();if(player.getPlayerState()===1)scheduleAudioPromotion(playGeneration);return true}catch(e){return false}};"
            + "function onYouTubeIframeAPIReady(){player=new YT.Player('player',{width:'100%',height:'100%',videoId:currentId,playerVars:{autoplay:1,playsinline:1,controls:1,rel:0,enablejsapi:1,origin:'https://nubo.ainubo.com'},events:{"
            + "onReady:function(){startExactVideo(currentId);},"
            + "onStateChange:function(e){if(e.data===1){scheduleAudioPromotion(playGeneration);}else if(e.data===2){clearUnmuteTimers();}},"
            + "onAutoplayBlocked:function(){try{player.mute();player.playVideo();}catch(e){}},"
            + "onError:function(){clearUnmuteTimers();}"
            + "}});}"
            + "</script><script src='https://www.youtube.com/iframe_api'></script></body></html>";

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
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
            if (pageReady) {
                webView.evaluateJavascript(
                    "window.nuboResumePlayback&&window.nuboResumePlayback();",
                    null
                );
            }
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
        }
        super.onPause();
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
