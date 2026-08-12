from pathlib import Path
import subprocess

ROOT = Path('.')
OLD = 'origin/agent/google-home-integration'


def run(*args):
    subprocess.run(args, check=True)


def show(path: str) -> str:
    return subprocess.check_output(['git', 'show', f'{OLD}:{path}'], text=True)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'pattern not found: {label}')
    return text.replace(old, new, 1)

# Pull the proven Home SDK 1.10.0 integration files from the preserved branch.
run('git', 'fetch', 'origin', 'agent/google-home-integration:refs/remotes/origin/agent/google-home-integration')
for path in [
    'android-nubo/build.gradle',
    'android-nubo/settings.gradle',
    'android-nubo/app/build.gradle',
    'android-nubo/app/src/main/java/com/ainubo/nubo/GoogleHomeGateway.java',
    'android-nubo/app/src/googleHome/java/com/ainubo/nubo/googlehome/GoogleHomeGatewayImpl.kt',
]:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(show(path), encoding='utf-8')

# Keep the current MainActivity (including 30s native wake) and add only the
# Google Home bridge surface. A small base activity owns Home SDK lifecycle.
base_activity = r'''package com.ainubo.nubo;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.ComponentActivity;

import org.json.JSONObject;

public abstract class GoogleHomeActivity extends ComponentActivity {
    private GoogleHomeGateway googleHomeGateway;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        googleHomeGateway = GoogleHomeGateway.create(this);
    }

    protected final String googleHomeStatus() {
        return googleHomeGateway.status();
    }

    protected final boolean googleHomeRequestPermissions(String requestId, WebView target) {
        if (!isValidRequestId(requestId) || target == null) return false;
        runOnUiThread(() -> googleHomeGateway.requestPermissions(
            payload -> emitGoogleHomeResult(target, requestId, payload)
        ));
        return true;
    }

    protected final boolean googleHomeListDevices(String requestId, WebView target) {
        if (!isValidRequestId(requestId) || target == null) return false;
        runOnUiThread(() -> googleHomeGateway.listDevices(
            payload -> emitGoogleHomeResult(target, requestId, payload)
        ));
        return true;
    }

    protected final boolean googleHomeControl(
        String requestId,
        String action,
        String roomName,
        String deviceName,
        WebView target
    ) {
        if (!isValidRequestId(requestId) || target == null) return false;
        String safeAction = action == null ? "" : action.trim();
        String safeRoom = roomName == null ? "" : roomName.trim();
        String safeDevice = deviceName == null ? "" : deviceName.trim();
        runOnUiThread(() -> googleHomeGateway.control(
            safeAction,
            safeRoom,
            safeDevice,
            payload -> emitGoogleHomeResult(target, requestId, payload)
        ));
        return true;
    }

    private void emitGoogleHomeResult(WebView target, String requestId, String payloadJson) {
        try {
            JSONObject payload;
            try {
                payload = new JSONObject(payloadJson == null ? "{}" : payloadJson);
            } catch (Exception ignored) {
                payload = new JSONObject();
                payload.put("ok", false);
                payload.put("error", "Google Home 回傳格式錯誤");
            }
            payload.put("requestId", requestId);
            String javascript =
                "window.dispatchEvent(new CustomEvent('nubo:google-home-result',{detail:"
                    + payload.toString()
                    + "}));";
            target.post(() -> target.evaluateJavascript(javascript, null));
        } catch (Exception ignored) {
            // Keep the app alive if a malformed native callback is returned.
        }
    }

    private static boolean isValidRequestId(String requestId) {
        return requestId != null && requestId.length() >= 8 && requestId.length() <= 128;
    }

    @Override
    protected void onDestroy() {
        if (googleHomeGateway != null) {
            googleHomeGateway.destroy();
            googleHomeGateway = null;
        }
        super.onDestroy();
    }
}
'''
base_path = ROOT / 'android-nubo/app/src/main/java/com/ainubo/nubo/GoogleHomeActivity.java'
base_path.write_text(base_activity, encoding='utf-8')

main_path = ROOT / 'android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java'
main = main_path.read_text(encoding='utf-8-sig')
main = replace_once(main, 'import android.app.Activity;\n', '', 'remove Activity import')
main = replace_once(
    main,
    'public final class MainActivity extends Activity {',
    'public final class MainActivity extends GoogleHomeActivity {',
    'use GoogleHomeActivity',
)
bridge_anchor = '''        public String getNativeVersion() {\n            return "android-v12";\n        }\n\n'''
bridge_methods = '''        public String getNativeVersion() {\n            return "android-v12-home-1.10.0";\n        }\n\n        @JavascriptInterface\n        public String googleHomeStatus() {\n            return activity.googleHomeStatus();\n        }\n\n        @JavascriptInterface\n        public boolean googleHomeRequestPermissions(String requestId) {\n            return activity.googleHomeRequestPermissions(requestId, activity.webView);\n        }\n\n        @JavascriptInterface\n        public boolean googleHomeListDevices(String requestId) {\n            return activity.googleHomeListDevices(requestId, activity.webView);\n        }\n\n        @JavascriptInterface\n        public boolean googleHomeControl(\n            String requestId,\n            String action,\n            String roomName,\n            String deviceName\n        ) {\n            return activity.googleHomeControl(\n                requestId,\n                action,\n                roomName,\n                deviceName,\n                activity.webView\n            );\n        }\n\n'''
main = replace_once(main, bridge_anchor, bridge_methods, 'native Google Home methods')
main_path.write_text(main, encoding='utf-8')

# Build the release APK with the Home SDK source set enabled.
workflow_path = ROOT / '.github/workflows/android-debug.yml'
workflow = workflow_path.read_text(encoding='utf-8-sig')
workflow = workflow.replace('Build signed AinuboX1 V22 release APK', 'Build signed AinuboX1 V23 Google Home release APK')
workflow = workflow.replace(
    'gradle -p android-nubo clean assembleRelease --stacktrace',
    'gradle -p android-nubo clean assembleRelease -PnuboGoogleHome=true --stacktrace',
)
workflow = workflow.replace("versionCode='22'", "versionCode='23'")
workflow = workflow.replace('Publish V22 APK', 'Publish V23 Google Home APK')
workflow = workflow.replace('AinuboX1-v22-NATIVE-MULTILINGUAL.apk', 'AinuboX1-v23-GOOGLE-HOME.apk')
workflow = workflow.replace('build(android): publish AinuboX1 V22 native multilingual APK', 'build(android): publish AinuboX1 V23 Google Home native APK')
workflow = workflow.replace('AinuboX1-v22-NATIVE-MULTILINGUAL', 'AinuboX1-v23-GOOGLE-HOME')
workflow_path.write_text(workflow, encoding='utf-8')

# Remove the one-shot migration files from the resulting product commit.
Path('.github/scripts/restore_google_home_native.py').unlink(missing_ok=True)
Path('.github/workflows/one-shot-home-sdk-restore.yml').unlink(missing_ok=True)
