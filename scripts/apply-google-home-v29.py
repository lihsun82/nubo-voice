from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


# This patch intentionally touches ONLY Android Google Home build/bridge wiring.
# V28 voice, Sense, PiP, avatar and web behavior remain unchanged.

root = Path("android-nubo/build.gradle")
s = root.read_text()
if 'id "org.jetbrains.kotlin.android"' not in s:
    s = replace_once(
        s,
        '    id "com.android.application" version "8.10.1" apply false\n',
        '    id "com.android.application" version "8.10.1" apply false\n'
        '    id "org.jetbrains.kotlin.android" version "2.2.21" apply false\n',
        "root kotlin plugin",
    )
root.write_text(s)

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
if 'id "org.jetbrains.kotlin.android"' not in s:
    s = replace_once(
        s,
        'plugins {\n    id "com.android.application"\n}\n',
        'plugins {\n    id "com.android.application"\n    id "org.jetbrains.kotlin.android"\n}\n\n'
        'def googleHomeEnabled = providers.gradleProperty("nuboGoogleHome").orNull == "true"\n',
        "app kotlin plugin",
    )

s = s.replace("versionCode 28", "versionCode 29")
s = s.replace('versionName "0.28.0"', 'versionName "0.29.0-googlehome"')

if 'minSdk googleHomeEnabled ? 29 : 26' not in s:
    s = replace_once(s, '        minSdk 26\n', '        minSdk googleHomeEnabled ? 29 : 26\n', "Google Home minSdk")

if 'buildConfigField "boolean", "GOOGLE_HOME_ENABLED"' not in s:
    marker = '        versionName "0.29.0-googlehome"\n'
    s = replace_once(
        s,
        marker,
        marker + '        buildConfigField "boolean", "GOOGLE_HOME_ENABLED", googleHomeEnabled.toString()\n',
        "Google Home BuildConfig flag",
    )

if 'java.srcDir "src/googleHome/java"' not in s:
    marker = '    compileOptions {\n'
    source_sets = (
        '    sourceSets {\n'
        '        main {\n'
        '            if (googleHomeEnabled) {\n'
        '                java.srcDir "src/googleHome/java"\n'
        '            }\n'
        '        }\n'
        '    }\n\n'
    )
    s = replace_once(s, marker, source_sets + marker, "Google Home source set")

if 'kotlinOptions {' not in s:
    marker = (
        '    compileOptions {\n'
        '        sourceCompatibility JavaVersion.VERSION_17\n'
        '        targetCompatibility JavaVersion.VERSION_17\n'
        '    }\n'
    )
    s = replace_once(
        s,
        marker,
        marker + '\n    kotlinOptions {\n        jvmTarget = "17"\n    }\n',
        "Kotlin jvmTarget",
    )

if 'play-services-home:17.1.0' not in s:
    marker = 'dependencies {\n'
    deps = (
        'dependencies {\n'
        '    implementation "androidx.activity:activity:1.10.1"\n\n'
        '    if (googleHomeEnabled) {\n'
        '        implementation "com.google.android.gms:play-services-home:17.1.0"\n'
        '        implementation "com.google.android.gms:play-services-home-types:17.1.0"\n'
        '        implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2"\n'
        '    }\n'
    )
    s = replace_once(s, marker, deps, "Google Home dependencies")

app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
if 'public final class MainActivity extends GoogleHomeActivity' not in s:
    s = replace_once(
        s,
        'public final class MainActivity extends Activity {',
        'public final class MainActivity extends GoogleHomeActivity {',
        "Google Home ComponentActivity base",
    )

if 'public String googleHomeStatus()' not in s:
    marker = '''        @JavascriptInterface\n        public String getNativeVersion() {\n            return "android-v28";\n        }\n'''
    bridge = marker + '''\n        @JavascriptInterface\n        public String googleHomeStatus() {\n            return activity.googleHomeStatus();\n        }\n\n        @JavascriptInterface\n        public boolean googleHomeRequestPermissions(String requestId) {\n            return activity.googleHomeRequestPermissions(requestId, activity.webView);\n        }\n\n        @JavascriptInterface\n        public boolean googleHomeListDevices(String requestId) {\n            return activity.googleHomeListDevices(requestId, activity.webView);\n        }\n\n        @JavascriptInterface\n        public boolean googleHomeControl(\n            String requestId,\n            String action,\n            String roomName,\n            String deviceName\n        ) {\n            return activity.googleHomeControl(\n                requestId,\n                action,\n                roomName,\n                deviceName,\n                activity.webView\n            );\n        }\n'''
    s = replace_once(s, marker, bridge, "Google Home JS bridge")

main.write_text(s)
