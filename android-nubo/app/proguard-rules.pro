# NUBO V8 currently keeps release minification disabled.
# Keep JavaScript bridge methods if minification is enabled later.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
