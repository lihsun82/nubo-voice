from pathlib import Path
import runpy

# V55 starts from V54 embedded playback, but fixes Android WebView client identity
# and changes the player from a full-screen dialog to a compact bottom 16:9 banner.
runpy.run_path("scripts/apply-youtube-v54-embedded-player.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 54", "versionCode 55", "V55 versionCode")
s = replace_once(
    s,
    'versionName "0.54.0-youtube-embedded-player"',
    'versionName "0.55.0-youtube-bottom-banner-referer"',
    "V55 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v54", "android-v55")
s = s.replace("NUBO-Android/54", "NUBO-Android/55")
s = s.replace("bundle=v54", "bundle=v55")
s = s.replace("nubo_v54_bundle_flushed", "nubo_v55_bundle_flushed")
s = s.replace("nubo_youtube_v54", "nubo_youtube_v55")
s = s.replace("handleYouTubeIntentV54", "handleYouTubeIntentV55")
s = s.replace("isDuplicateYouTubeLaunchV54", "isDuplicateYouTubeLaunchV55")
s = s.replace("startYouTubeIntentV54", "startYouTubeIntentV55")
s = s.replace("prepareYouTubeMediaRouteV54", "prepareYouTubeMediaRouteV55")
s = s.replace("EmbeddedYouTubeBridgeV54", "EmbeddedYouTubeBridgeV55")
s = s.replace("embeddedYouTubeDialogV54", "embeddedYouTubeDialogV55")
s = s.replace("embeddedYouTubeWebViewV54", "embeddedYouTubeWebViewV55")
s = s.replace("embeddedYouTubeVideoIdV54", "embeddedYouTubeVideoIdV55")
s = s.replace("dismissEmbeddedYouTubeV54", "dismissEmbeddedYouTubeV55")
s = s.replace("showEmbeddedYouTubeV54", "showEmbeddedYouTubeV55")
s = s.replace("v54-embed-error-fallback-", "v55-embed-error-fallback-")
s = s.replace("v54-external-fallback-exact", "v55-external-fallback-exact")
s = s.replace("v54-external-fallback-search", "v55-external-fallback-search")
s = s.replace("v54-external-fallback-url", "v55-external-fallback-url")

if "import android.webkit.CookieManager;" not in s:
    s = replace_once(
        s,
        "import android.webkit.WebChromeClient;\n",
        "import android.webkit.WebChromeClient;\nimport android.webkit.CookieManager;\n",
        "CookieManager import",
    )

old_method = r'''    private boolean showEmbeddedYouTubeV55(String videoId) {
        if (videoId == null || !videoId.matches("[A-Za-z0-9_-]{11}")) return false;
        try {
            prepareYouTubeMediaRouteV55();
            dismissEmbeddedYouTubeV55();
            embeddedYouTubeVideoIdV55 = videoId;

            Dialog dialog = new Dialog(this, android.R.style.Theme_DeviceDefault_NoActionBar);
            LinearLayout shell = new LinearLayout(this);
            shell.setOrientation(LinearLayout.VERTICAL);
            shell.setBackgroundColor(Color.BLACK);

            Button close = new Button(this);
            close.setText("✕  關閉影片");
            close.setAllCaps(false);
            close.setTextSize(15f);
            close.setGravity(Gravity.CENTER);
            close.setOnClickListener(v -> dismissEmbeddedYouTubeV55());
            shell.addView(close, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                (int) (52 * getResources().getDisplayMetrics().density)
            ));

            WebView player = new WebView(this);
            player.setBackgroundColor(Color.BLACK);
            player.getSettings().setJavaScriptEnabled(true);
            player.getSettings().setDomStorageEnabled(true);
            player.getSettings().setMediaPlaybackRequiresUserGesture(false);
            player.setWebChromeClient(new WebChromeClient());
            player.addJavascriptInterface(new EmbeddedYouTubeBridgeV55(), "NuboYouTubeNative");
            shell.addView(player, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            ));

            String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'><style>html,body,#p{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style></head><body><div id='p'></div><script src='https://www.youtube.com/iframe_api'></script><script>var p;function onYouTubeIframeAPIReady(){p=new YT.Player('p',{width:'100%',height:'100%',videoId:'" + videoId + "',playerVars:{autoplay:1,playsinline:1,rel:0,modestbranding:1,enablejsapi:1},events:{onReady:function(e){try{e.target.playVideo()}catch(x){}},onError:function(e){try{NuboYouTubeNative.onPlayerError(e.data||0)}catch(x){}}}})}</script></body></html>";
            player.loadDataWithBaseURL("https://www.youtube.com", html, "text/html", "UTF-8", null);

            dialog.setContentView(shell);
            dialog.setOnDismissListener(d -> {
                if (embeddedYouTubeDialogV55 == d) {
                    embeddedYouTubeDialogV55 = null;
                    embeddedYouTubeVideoIdV55 = "";
                    embeddedYouTubeWebViewV55 = null;
                }
            });
            dialog.show();
            if (dialog.getWindow() != null) {
                dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.BLACK));
                dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            }
            embeddedYouTubeDialogV55 = dialog;
            embeddedYouTubeWebViewV55 = player;
            return true;
        } catch (RuntimeException ignored) {
            dismissEmbeddedYouTubeV55();
            return false;
        }
    }
'''

new_method = r'''    private boolean showEmbeddedYouTubeV55(String videoId) {
        if (videoId == null || !videoId.matches("[A-Za-z0-9_-]{11}")) return false;
        try {
            prepareYouTubeMediaRouteV55();

            if (embeddedYouTubeDialogV55 != null
                && embeddedYouTubeDialogV55.isShowing()
                && embeddedYouTubeWebViewV55 != null) {
                embeddedYouTubeVideoIdV55 = videoId;
                String js = "try{if(window.p&&p.loadVideoById){p.loadVideoById('" + videoId + "');p.playVideo();}}catch(e){}";
                embeddedYouTubeWebViewV55.evaluateJavascript(js, null);
                return true;
            }

            dismissEmbeddedYouTubeV55();
            embeddedYouTubeVideoIdV55 = videoId;

            Dialog dialog = new Dialog(this, android.R.style.Theme_DeviceDefault_NoActionBar);
            LinearLayout shell = new LinearLayout(this);
            shell.setOrientation(LinearLayout.VERTICAL);
            shell.setBackgroundColor(Color.BLACK);

            Button close = new Button(this);
            close.setText("✕  關閉 YouTube");
            close.setAllCaps(false);
            close.setTextSize(13f);
            close.setGravity(Gravity.CENTER);
            close.setOnClickListener(v -> dismissEmbeddedYouTubeV55());
            shell.addView(close, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                (int) (38 * getResources().getDisplayMetrics().density)
            ));

            WebView player = new WebView(this);
            player.setBackgroundColor(Color.BLACK);
            player.getSettings().setJavaScriptEnabled(true);
            player.getSettings().setDomStorageEnabled(true);
            player.getSettings().setMediaPlaybackRequiresUserGesture(false);
            player.setWebChromeClient(new WebChromeClient());
            CookieManager cookies = CookieManager.getInstance();
            cookies.setAcceptCookie(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                cookies.setAcceptThirdPartyCookies(player, true);
            }
            player.addJavascriptInterface(new EmbeddedYouTubeBridgeV55(), "NuboYouTubeNative");
            shell.addView(player, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            ));

            String html = "<!doctype html><html><head>"
                + "<meta name='referrer' content='strict-origin-when-cross-origin'>"
                + "<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'>"
                + "<style>html,body,#p{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style>"
                + "</head><body><div id='p'></div><script src='https://www.youtube.com/iframe_api'></script>"
                + "<script>var p;function onYouTubeIframeAPIReady(){p=new YT.Player('p',{width:'100%',height:'100%',videoId:'" + videoId + "',"
                + "playerVars:{autoplay:1,playsinline:1,rel:0,modestbranding:1,enablejsapi:1,origin:'https://nubo.ainubo.com',widget_referrer:'https://nubo.ainubo.com/'},"
                + "events:{onReady:function(e){try{e.target.playVideo()}catch(x){}},onError:function(e){try{NuboYouTubeNative.onPlayerError(e.data||0)}catch(x){}}}})}</script>"
                + "</body></html>";
            player.loadDataWithBaseURL("https://nubo.ainubo.com/", html, "text/html", "UTF-8", null);

            dialog.setContentView(shell);
            dialog.setCanceledOnTouchOutside(false);
            dialog.setOnDismissListener(d -> {
                if (embeddedYouTubeDialogV55 == d) {
                    embeddedYouTubeDialogV55 = null;
                    embeddedYouTubeVideoIdV55 = "";
                    embeddedYouTubeWebViewV55 = null;
                }
            });
            dialog.show();
            if (dialog.getWindow() != null) {
                int width = getResources().getDisplayMetrics().widthPixels;
                int playerHeight = Math.max((int)(200 * getResources().getDisplayMetrics().density), (int)(width * 9f / 16f));
                int totalHeight = playerHeight + (int)(38 * getResources().getDisplayMetrics().density);
                dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
                dialog.getWindow().setDimAmount(0f);
                dialog.getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
                dialog.getWindow().setGravity(Gravity.BOTTOM);
                dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, totalHeight);
            }
            embeddedYouTubeDialogV55 = dialog;
            embeddedYouTubeWebViewV55 = player;
            return true;
        } catch (RuntimeException ignored) {
            dismissEmbeddedYouTubeV55();
            return false;
        }
    }
'''

s = replace_once(s, old_method, new_method, "V55 bottom banner + referer player")
main.write_text(s)

final_source = main.read_text()
for token in [
    "NUBO-Android/55",
    "android-v55",
    "showEmbeddedYouTubeV55",
    "EmbeddedYouTubeBridgeV55",
    'loadDataWithBaseURL("https://nubo.ainubo.com/"',
    "strict-origin-when-cross-origin",
    "widget_referrer:'https://nubo.ainubo.com/'",
    "setGravity(Gravity.BOTTOM)",
    "setDimAmount(0f)",
    "loadVideoById",
    "setAcceptThirdPartyCookies",
    "YOUTUBE_RELAUNCH_GUARD_MS = 60_000L",
    "AudioManager.MODE_NORMAL",
    '"com.google.android.youtube"',
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V55 marker: {token}")

print("Applied V55: YouTube bottom banner + WebView Referer/client identity fix")
