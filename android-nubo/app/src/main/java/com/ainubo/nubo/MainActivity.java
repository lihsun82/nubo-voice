package com.ainubo.nubo;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String NUBO_HOST = "nubo.ainubo.com";
    private static final String NUBO_URL = "https://nubo.ainubo.com/?native=android-v11";
    private static final int MICROPHONE_PERMISSION_REQUEST = 8111;

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(7, 9, 13));
        getWindow().setNavigationBarColor(Color.rgb(7, 9, 13));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 9, 13));
        setContentView(
            webView,
            new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        );

        configureWebView(webView);

        if (savedInstanceState == null) {
            webView.loadUrl(NUBO_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }

        requestMicrophonePermissionIfNeeded();
    }

    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setUserAgentString(
            settings.getUserAgentString() + " NUBO-Android/11"
        );

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(view, true);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        view.addJavascriptInterface(new NuboNativeBridge(this), "NuboNative");
        view.setWebViewClient(new TrustedNuboWebViewClient());
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                Uri origin = request.getOrigin();
                if (!isTrustedNuboUri(origin)) {
                    request.deny();
                    return;
                }

                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                    request.deny();
                    requestMicrophonePermissionIfNeeded();
                    return;
                }

                List<String> granted = new ArrayList<>();
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                        granted.add(resource);
                    }
                }

                if (granted.isEmpty()) {
                    request.deny();
                } else {
                    request.grant(granted.toArray(new String[0]));
                }
            }
        });
    }

    private void requestMicrophonePermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED) {
            return;
        }

        requestPermissions(
            new String[]{Manifest.permission.RECORD_AUDIO},
            MICROPHONE_PERMISSION_REQUEST
        );
    }

    private static boolean isTrustedNuboUri(Uri uri) {
        return uri != null
            && "https".equalsIgnoreCase(uri.getScheme())
            && NUBO_HOST.equalsIgnoreCase(uri.getHost());
    }

    private final class TrustedNuboWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(
            WebView view,
            WebResourceRequest request
        ) {
            Uri uri = request.getUrl();
            if (isTrustedNuboUri(uri)) {
                return false;
            }

            launchGenericUri(uri);
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (isTrustedNuboUri(Uri.parse(url))) {
                view.evaluateJavascript(
                    "document.documentElement.dataset.nuboNative='android-v11';window.dispatchEvent(new CustomEvent('nubo-native-ready',{detail:{version:'android-v11'}}));",
                    null
                );
            }
        }
    }

    private static final class NuboNativeBridge {
        private final MainActivity activity;

        NuboNativeBridge(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public String getNativeVersion() {
            return "android-v11";
        }

        @JavascriptInterface
        public boolean openExternalApp(String targetUrl, String label) {
            if (targetUrl == null || label == null) {
                return false;
            }

            String safeTarget = targetUrl.trim();
            String safeLabel = label.trim();
            if (safeTarget.isEmpty() || safeLabel.isEmpty()) {
                return false;
            }

            if (!activity.isAllowedBridgeTarget(safeTarget, safeLabel)) {
                return false;
            }

            activity.runOnUiThread(
                () -> activity.launchExternalTarget(safeTarget, safeLabel)
            );
            return true;
        }
    }

    private boolean isAllowedBridgeTarget(String targetUrl, String label) {
        String normalizedLabel = label.toLowerCase(Locale.ROOT);
        if (
            normalizedLabel.equals("youtube")
                || normalizedLabel.equals("youtube music")
                || normalizedLabel.equals("line")
                || normalizedLabel.equals("facebook")
                || normalizedLabel.equals("instagram")
                || normalizedLabel.equals("google maps")
                || normalizedLabel.equals("gmail")
                || normalizedLabel.equals("網站")
                || normalizedLabel.equals("手機工具")
        ) {
            return true;
        }

        Uri uri = Uri.parse(targetUrl);
        String scheme = uri.getScheme();
        return "https".equalsIgnoreCase(scheme)
            || "http".equalsIgnoreCase(scheme)
            || "tel".equalsIgnoreCase(scheme)
            || "sms".equalsIgnoreCase(scheme)
            || "mailto".equalsIgnoreCase(scheme)
            || "geo".equalsIgnoreCase(scheme);
    }

    private void launchExternalTarget(String targetUrl, String label) {
        String normalizedLabel = label.toLowerCase(Locale.ROOT);
        Uri target = Uri.parse(targetUrl);

        if (normalizedLabel.equals("youtube music")) {
            launchPackageOrFallback(
                "com.google.android.apps.youtube.music",
                target,
                target
            );
            return;
        }

        if (
            normalizedLabel.equals("youtube")
                || targetUrl.contains("youtube.com")
                || targetUrl.contains("youtu.be")
        ) {
            launchPackageOrFallback(
                "com.google.android.youtube",
                target,
                target
            );
            return;
        }

        if (
            normalizedLabel.equals("line")
                || targetUrl.startsWith("line:")
                || targetUrl.contains("line.me/")
        ) {
            launchPackageOrFallback(
                "jp.naver.line.android",
                Uri.parse("line://nv/chat"),
                Uri.parse("https://line.me/R/nv/chat")
            );
            return;
        }

        if (
            normalizedLabel.equals("instagram")
                || targetUrl.contains("instagram.com")
        ) {
            launchPackageOrFallback(
                "com.instagram.android",
                target,
                target
            );
            return;
        }

        if (
            normalizedLabel.equals("facebook")
                || targetUrl.contains("facebook.com")
                || targetUrl.contains("fb.com")
        ) {
            launchPackageOrFallback(
                "com.facebook.katana",
                target,
                target
            );
            return;
        }

        if (
            normalizedLabel.equals("google maps")
                || targetUrl.contains("google.com/maps")
                || targetUrl.contains("maps.google.")
                || targetUrl.startsWith("geo:")
        ) {
            launchPackageOrFallback(
                "com.google.android.apps.maps",
                target,
                target
            );
            return;
        }

        if (
            normalizedLabel.equals("gmail")
                || targetUrl.contains("mail.google.com")
                || targetUrl.startsWith("mailto:")
        ) {
            launchPackageOrFallback(
                "com.google.android.gm",
                target,
                target
            );
            return;
        }

        launchGenericUri(target);
    }

    private void launchPackageOrFallback(
        String packageName,
        Uri preferredUri,
        Uri fallbackUri
    ) {
        if (preferredUri != null) {
            Intent explicitIntent = new Intent(Intent.ACTION_VIEW, preferredUri);
            explicitIntent.setPackage(packageName);
            explicitIntent.addCategory(Intent.CATEGORY_BROWSABLE);

            try {
                startActivity(explicitIntent);
                return;
            } catch (ActivityNotFoundException ignored) {
                // Try the package launcher or browser fallback below.
            }
        }

        Intent launchIntent = getPackageManager()
            .getLaunchIntentForPackage(packageName);
        if (launchIntent != null) {
            try {
                startActivity(launchIntent);
                return;
            } catch (ActivityNotFoundException ignored) {
                // Continue to the browser fallback.
            }
        }

        if (fallbackUri != null) {
            launchGenericUri(fallbackUri);
        }
    }

    private void launchGenericUri(Uri uri) {
        if (uri == null) {
            return;
        }

        Intent intent;
        if ("intent".equalsIgnoreCase(uri.getScheme())) {
            try {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
            } catch (Exception ignored) {
                return;
            }
        } else {
            intent = new Intent(Intent.ACTION_VIEW, uri);
        }

        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
            Intent settingsIntent = new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getPackageName())
            );
            startActivity(settingsIntent);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        webView.resumeTimers();
        webView.evaluateJavascript(
            "window.dispatchEvent(new Event('nubo:native-foreground'));",
            null
        );
    }

    @Override
    protected void onPause() {
        webView.evaluateJavascript(
            "window.dispatchEvent(new Event('nubo:native-background'));",
            null
        );
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        webView.removeJavascriptInterface("NuboNative");
        webView.stopLoading();
        webView.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
