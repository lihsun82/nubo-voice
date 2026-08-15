from pathlib import Path
import runpy

# V54 starts from proven V51 playback. Exact YouTube videos stay inside the same
# NUBO Activity in an embedded player so Gemini/WebView microphone remains foreground.
# External YouTube V51 remains fallback for embed errors or search-only cases.
runpy.run_path("scripts/apply-youtube-v51-exact-play.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 51", "versionCode 54", "V54 versionCode")
s = replace_once(
    s,
    'versionName "0.51.0-youtube-exact-play-media-route"',
    'versionName "0.54.0-youtube-embedded-player"',
    "V54 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v51", "android-v54")
s = s.replace("NUBO-Android/51", "NUBO-Android/54")
s = s.replace("bundle=v51", "bundle=v54")
s = s.replace("nubo_v51_bundle_flushed", "nubo_v54_bundle_flushed")
s = s.replace("nubo_youtube_v51", "nubo_youtube_v54")
s = s.replace("handleYouTubeIntentV51", "handleYouTubeIntentV54")
s = s.replace("isDuplicateYouTubeLaunchV51", "isDuplicateYouTubeLaunchV54")
s = s.replace("startYouTubeIntentV51", "startYouTubeIntentV54")
s = s.replace("prepareYouTubeMediaRouteV51", "prepareYouTubeMediaRouteV54")
s = s.replace("v51-native-exact-media", "v54-external-fallback-exact")
s = s.replace("v51-native-play-from-search-media", "v54-external-fallback-search")
s = s.replace("v51-native-url-fallback-media", "v54-external-fallback-url")

# Extra Android UI imports for same-Activity embedded player dialog.
imports_marker = "import android.app.PictureInPictureParams;\n"
extra_imports = "import android.app.PictureInPictureParams;\nimport android.app.Dialog;\nimport android.graphics.Color;\nimport android.graphics.drawable.ColorDrawable;\nimport android.view.Gravity;\nimport android.view.ViewGroup;\nimport android.widget.Button;\nimport android.widget.LinearLayout;\n"
s = replace_once(s, imports_marker, extra_imports, "V54 dialog imports")

field_marker = '    private static final long YOUTUBE_RELAUNCH_GUARD_MS = 60_000L;\n'
fields = '''    private static final long YOUTUBE_RELAUNCH_GUARD_MS = 60_000L;\n    private Dialog embeddedYouTubeDialogV54;\n    private WebView embeddedYouTubeWebViewV54;\n    private String embeddedYouTubeVideoIdV54 = "";\n'''
s = replace_once(s, field_marker, fields, "V54 embedded player fields")

method_marker = "    private void prepareYouTubeMediaRouteV54() {\n"
helpers = r'''    private final class EmbeddedYouTubeBridgeV54 {
        @JavascriptInterface
        public void onPlayerError(int code) {
            if (code != 101 && code != 150 && code != 153 && code != 5 && code != 100) return;
            final String videoId = embeddedYouTubeVideoIdV54;
            runOnUiThread(() -> {
                dismissEmbeddedYouTubeV54();
                if (videoId == null || !videoId.matches("[A-Za-z0-9_-]{11}")) return;
                Uri exact = Uri.parse("https://www.youtube.com/watch?v=" + videoId);
                Intent fallback = new Intent(Intent.ACTION_VIEW, exact);
                fallback.setPackage("com.google.android.youtube");
                fallback.addCategory(Intent.CATEGORY_BROWSABLE);
                fallback.putExtra("nubo_youtube_build", "v54-embed-error-fallback-" + code);
                startYouTubeIntentV54(fallback);
            });
        }
    }

    private void dismissEmbeddedYouTubeV54() {
        try {
            if (embeddedYouTubeWebViewV54 != null) {
                embeddedYouTubeWebViewV54.loadUrl("about:blank");
                embeddedYouTubeWebViewV54.stopLoading();
                embeddedYouTubeWebViewV54.destroy();
            }
        } catch (RuntimeException ignored) {}
        embeddedYouTubeWebViewV54 = null;
        embeddedYouTubeVideoIdV54 = "";
        try {
            if (embeddedYouTubeDialogV54 != null && embeddedYouTubeDialogV54.isShowing()) {
                embeddedYouTubeDialogV54.dismiss();
            }
        } catch (RuntimeException ignored) {}
        embeddedYouTubeDialogV54 = null;
    }

    private boolean showEmbeddedYouTubeV54(String videoId) {
        if (videoId == null || !videoId.matches("[A-Za-z0-9_-]{11}")) return false;
        try {
            prepareYouTubeMediaRouteV54();
            dismissEmbeddedYouTubeV54();
            embeddedYouTubeVideoIdV54 = videoId;

            Dialog dialog = new Dialog(this, android.R.style.Theme_DeviceDefault_NoActionBar);
            dialog.getWindow();
            LinearLayout shell = new LinearLayout(this);
            shell.setOrientation(LinearLayout.VERTICAL);
            shell.setBackgroundColor(Color.BLACK);

            Button close = new Button(this);
            close.setText("✕  關閉影片");
            close.setAllCaps(false);
            close.setTextSize(15f);
            close.setGravity(Gravity.CENTER);
            close.setOnClickListener(v -> dismissEmbeddedYouTubeV54());
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
            player.addJavascriptInterface(new EmbeddedYouTubeBridgeV54(), "NuboYouTubeNative");
            shell.addView(player, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            ));

            String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'><style>html,body,#p{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style></head><body><div id='p'></div><script src='https://www.youtube.com/iframe_api'></script><script>var p;function onYouTubeIframeAPIReady(){p=new YT.Player('p',{width:'100%',height:'100%',videoId:'" + videoId + "',playerVars:{autoplay:1,playsinline:1,rel:0,modestbranding:1,enablejsapi:1},events:{onReady:function(e){try{e.target.playVideo()}catch(x){}},onError:function(e){try{NuboYouTubeNative.onPlayerError(e.data||0)}catch(x){}}}})}</script></body></html>";
            player.loadDataWithBaseURL("https://www.youtube.com", html, "text/html", "UTF-8", null);

            dialog.setContentView(shell);
            dialog.setOnDismissListener(d -> {
                if (embeddedYouTubeDialogV54 == d) {
                    embeddedYouTubeDialogV54 = null;
                    embeddedYouTubeVideoIdV54 = "";
                    embeddedYouTubeWebViewV54 = null;
                }
            });
            dialog.show();
            if (dialog.getWindow() != null) {
                dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.BLACK));
                dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            }
            embeddedYouTubeDialogV54 = dialog;
            embeddedYouTubeWebViewV54 = player;
            return true;
        } catch (RuntimeException ignored) {
            dismissEmbeddedYouTubeV54();
            return false;
        }
    }

'''
s = replace_once(s, method_marker, helpers + method_marker, "V54 embedded helpers")

# Exact video: embed in NUBO first. Preserve V51 external exact launch as fallback only.
old_exact = '''        if (videoId != null && videoId.matches("[A-Za-z0-9_-]{11}")) {
            String signature = "video:" + videoId;
            if (isDuplicateYouTubeLaunchV54(signature)) return true;
            Uri exact = Uri.parse("https://www.youtube.com/watch?v=" + videoId);
            Intent exactIntent = new Intent(Intent.ACTION_VIEW, exact);
            exactIntent.setPackage("com.google.android.youtube");
            exactIntent.addCategory(Intent.CATEGORY_BROWSABLE);
            exactIntent.putExtra("nubo_youtube_build", "v54-external-fallback-exact");
            if (startYouTubeIntentV54(exactIntent)) return true;
        }
'''
new_exact = '''        if (videoId != null && videoId.matches("[A-Za-z0-9_-]{11}")) {
            String signature = "video:" + videoId;
            if (isDuplicateYouTubeLaunchV54(signature)) return true;
            if (showEmbeddedYouTubeV54(videoId)) return true;
            Uri exact = Uri.parse("https://www.youtube.com/watch?v=" + videoId);
            Intent exactIntent = new Intent(Intent.ACTION_VIEW, exact);
            exactIntent.setPackage("com.google.android.youtube");
            exactIntent.addCategory(Intent.CATEGORY_BROWSABLE);
            exactIntent.putExtra("nubo_youtube_build", "v54-external-fallback-exact");
            if (startYouTubeIntentV54(exactIntent)) return true;
        }
'''
s = replace_once(s, old_exact, new_exact, "V54 exact embed first")

# Clean up embedded player when the Activity is destroyed.
old_destroy = '''    protected void onDestroy() {
        activityForeground = false;
'''
new_destroy = '''    protected void onDestroy() {
        activityForeground = false;
        dismissEmbeddedYouTubeV54();
'''
s = replace_once(s, old_destroy, new_destroy, "V54 destroy cleanup")

main.write_text(s)

final_source = main.read_text()
for token in [
    "NUBO-Android/54",
    "android-v54",
    "showEmbeddedYouTubeV54",
    "EmbeddedYouTubeBridgeV54",
    "youtube.com/iframe_api",
    "setMediaPlaybackRequiresUserGesture(false)",
    "onPlayerError",
    "v54-embed-error-fallback-",
    "prepareYouTubeMediaRouteV54",
    "YOUTUBE_RELAUNCH_GUARD_MS = 60_000L",
    '"com.google.android.youtube"',
    "public boolean googleHomeControl",
]:
    if token not in final_source:
        raise SystemExit(f"missing V54 marker: {token}")

print("Applied V54: embedded YouTube player in NUBO Activity + V51 external fallback")
