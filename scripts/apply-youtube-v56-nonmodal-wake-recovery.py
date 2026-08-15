from pathlib import Path
import runpy

# V56 starts from successful V55 bottom banner. It removes the modal Dialog window
# so the underlying NUBO UI and native wake listener remain interactive while
# YouTube is playing. It also adds a light buffering watchdog without rebuilding
# the player or changing any non-YouTube route.
runpy.run_path("scripts/apply-youtube-v55-bottom-banner.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 55", "versionCode 56", "V56 versionCode")
s = replace_once(
    s,
    'versionName "0.55.0-youtube-bottom-banner-referer"',
    'versionName "0.56.0-youtube-nonmodal-wake-recovery"',
    "V56 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v55", "android-v56")
s = s.replace("NUBO-Android/55", "NUBO-Android/56")
s = s.replace("bundle=v55", "bundle=v56")
s = s.replace("nubo_v55_bundle_flushed", "nubo_v56_bundle_flushed")
s = s.replace("nubo_youtube_v55", "nubo_youtube_v56")
s = s.replace("handleYouTubeIntentV55", "handleYouTubeIntentV56")
s = s.replace("isDuplicateYouTubeLaunchV55", "isDuplicateYouTubeLaunchV56")
s = s.replace("startYouTubeIntentV55", "startYouTubeIntentV56")
s = s.replace("prepareYouTubeMediaRouteV55", "prepareYouTubeMediaRouteV56")
s = s.replace("EmbeddedYouTubeBridgeV55", "EmbeddedYouTubeBridgeV56")
s = s.replace("embeddedYouTubeDialogV55", "embeddedYouTubeDialogV56")
s = s.replace("embeddedYouTubeWebViewV55", "embeddedYouTubeWebViewV56")
s = s.replace("embeddedYouTubeVideoIdV55", "embeddedYouTubeVideoIdV56")
s = s.replace("dismissEmbeddedYouTubeV55", "dismissEmbeddedYouTubeV56")
s = s.replace("showEmbeddedYouTubeV55", "showEmbeddedYouTubeV56")
s = s.replace("v55-embed-error-fallback-", "v56-embed-error-fallback-")
s = s.replace("v55-external-fallback-exact", "v56-external-fallback-exact")
s = s.replace("v55-external-fallback-search", "v56-external-fallback-search")
s = s.replace("v55-external-fallback-url", "v56-external-fallback-url")

# The V54/V55 field is a modal Dialog. Replace it with a same-window overlay.
s = replace_once(
    s,
    "    private Dialog embeddedYouTubeDialogV56;\n",
    "    private FrameLayout embeddedYouTubeOverlayV56;\n",
    "V56 non-modal overlay field",
)

start = s.index("    private void dismissEmbeddedYouTubeV56() {")
end = s.index("    private void prepareYouTubeMediaRouteV56() {", start)

new_helpers = r'''    private void dismissEmbeddedYouTubeV56() {
        try {
            if (embeddedYouTubeWebViewV56 != null) {
                embeddedYouTubeWebViewV56.loadUrl("about:blank");
                embeddedYouTubeWebViewV56.stopLoading();
                embeddedYouTubeWebViewV56.destroy();
            }
        } catch (RuntimeException ignored) {}
        embeddedYouTubeWebViewV56 = null;
        embeddedYouTubeVideoIdV56 = "";
        try {
            if (embeddedYouTubeOverlayV56 != null) {
                android.view.ViewParent parent = embeddedYouTubeOverlayV56.getParent();
                if (parent instanceof ViewGroup) {
                    ((ViewGroup) parent).removeView(embeddedYouTubeOverlayV56);
                }
            }
        } catch (RuntimeException ignored) {}
        embeddedYouTubeOverlayV56 = null;
        // Never leave the NUBO surface paused after closing the player.
        try {
            activityForeground = true;
            webView.resumeTimers();
            webView.onResume();
        } catch (RuntimeException ignored) {}
    }

    private boolean showEmbeddedYouTubeV56(String videoId) {
        if (videoId == null || !videoId.matches("[A-Za-z0-9_-]{11}")) return false;
        try {
            prepareYouTubeMediaRouteV56();
            activityForeground = true;
            webView.resumeTimers();
            webView.onResume();

            if (embeddedYouTubeOverlayV56 != null
                && embeddedYouTubeOverlayV56.getParent() != null
                && embeddedYouTubeWebViewV56 != null) {
                embeddedYouTubeVideoIdV56 = videoId;
                String js = "try{if(window.p&&p.loadVideoById){p.loadVideoById('" + videoId + "');p.playVideo();}}catch(e){}";
                embeddedYouTubeWebViewV56.evaluateJavascript(js, null);
                return true;
            }

            dismissEmbeddedYouTubeV56();
            embeddedYouTubeVideoIdV56 = videoId;

            FrameLayout overlay = new FrameLayout(this);
            overlay.setBackgroundColor(Color.BLACK);
            overlay.setClickable(true);
            overlay.setFocusable(false);

            WebView player = new WebView(this);
            player.setBackgroundColor(Color.BLACK);
            player.setKeepScreenOn(true);
            player.getSettings().setJavaScriptEnabled(true);
            player.getSettings().setDomStorageEnabled(true);
            player.getSettings().setMediaPlaybackRequiresUserGesture(false);
            player.setWebChromeClient(new WebChromeClient());
            player.setFocusable(false);
            CookieManager cookies = CookieManager.getInstance();
            cookies.setAcceptCookie(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                cookies.setAcceptThirdPartyCookies(player, true);
            }
            player.addJavascriptInterface(new EmbeddedYouTubeBridgeV56(), "NuboYouTubeNative");
            overlay.addView(player, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            ));

            Button close = new Button(this);
            close.setText("✕");
            close.setAllCaps(false);
            close.setTextSize(16f);
            close.setOnClickListener(v -> dismissEmbeddedYouTubeV56());
            int closePx = (int)(42 * getResources().getDisplayMetrics().density);
            FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(closePx, closePx, Gravity.TOP | Gravity.END);
            overlay.addView(close, closeParams);

            String html = "<!doctype html><html><head>"
                + "<meta name='referrer' content='strict-origin-when-cross-origin'>"
                + "<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'>"
                + "<style>html,body,#p{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style>"
                + "</head><body><div id='p'></div><script src='https://www.youtube.com/iframe_api'></script>"
                + "<script>var p,bt=null;function clearBt(){if(bt){clearTimeout(bt);bt=null;}}"
                + "function onYouTubeIframeAPIReady(){p=new YT.Player('p',{width:'100%',height:'100%',videoId:'" + videoId + "',"
                + "playerVars:{autoplay:1,playsinline:1,rel:0,modestbranding:1,enablejsapi:1,origin:'https://nubo.ainubo.com',widget_referrer:'https://nubo.ainubo.com/'},"
                + "events:{onReady:function(e){try{e.target.playVideo()}catch(x){}},"
                + "onStateChange:function(e){clearBt();if(e.data===3){bt=setTimeout(function(){try{if(p&&p.getPlayerState&&p.getPlayerState()===3){p.playVideo();}}catch(x){}},9000)}else if(e.data===5){try{p.playVideo()}catch(x){}}},"
                + "onError:function(e){try{NuboYouTubeNative.onPlayerError(e.data||0)}catch(x){}}}})}</script>"
                + "</body></html>";
            player.loadDataWithBaseURL("https://nubo.ainubo.com/", html, "text/html", "UTF-8", null);

            ViewGroup root = (ViewGroup) findViewById(android.R.id.content);
            int width = getResources().getDisplayMetrics().widthPixels;
            int minHeight = (int)(200 * getResources().getDisplayMetrics().density);
            int playerHeight = Math.max(minHeight, (int)(width * 9f / 16f));
            FrameLayout.LayoutParams overlayParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                playerHeight,
                Gravity.BOTTOM
            );
            root.addView(overlay, overlayParams);

            embeddedYouTubeOverlayV56 = overlay;
            embeddedYouTubeWebViewV56 = player;
            return true;
        } catch (RuntimeException ignored) {
            dismissEmbeddedYouTubeV56();
            return false;
        }
    }

'''

s = s[:start] + new_helpers + s[end:]

# Guarantee native wake dispatch revives the WebView before notifying React/Gemini.
old_dispatch = '''    private void dispatchNativeWake() {
        wakeListenerEnabled = false;
        if (wakeRecognizer != null) {
            try { wakeRecognizer.cancel(); } catch (Exception ignored) {}
        }
        webView.evaluateJavascript(
'''
new_dispatch = '''    private void dispatchNativeWake() {
        wakeListenerEnabled = false;
        if (wakeRecognizer != null) {
            try { wakeRecognizer.cancel(); } catch (Exception ignored) {}
        }
        activityForeground = true;
        try {
            webView.resumeTimers();
            webView.onResume();
        } catch (RuntimeException ignored) {}
        webView.evaluateJavascript(
'''
s = replace_once(s, old_dispatch, new_dispatch, "V56 wake resumes WebView")

main.write_text(s)

final_source = main.read_text()
for token in [
    "NUBO-Android/56",
    "android-v56",
    "embeddedYouTubeOverlayV56",
    "root.addView(overlay, overlayParams)",
    "Gravity.BOTTOM",
    "webView.resumeTimers();",
    "onStateChange:function(e)",
    "getPlayerState()===3",
    'loadDataWithBaseURL("https://nubo.ainubo.com/"',
    "YOUTUBE_RELAUNCH_GUARD_MS = 60_000L",
    "AudioManager.MODE_NORMAL",
    '"com.google.android.youtube"',
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V56 marker: {token}")

if "private Dialog embeddedYouTubeDialogV56" in final_source:
    raise SystemExit("modal YouTube Dialog still present in V56")

print("Applied V56: non-modal YouTube banner + buffering watchdog + wake recovery")
