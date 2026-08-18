from pathlib import Path
import runpy

# V77: preserve V76 and restore the proven Stable 1.1 background architecture:
# microphone foreground service + keep WebView/Chromium timers alive while NUBO is backgrounded.
runpy.run_path("scripts/apply-v76-native-lookup-filler.py", run_name="__main__")


def replace_java_method(source: str, signature: str, replacement: str) -> str:
    """Replace one complete Java method by brace depth, never by regex."""
    start = source.find(signature)
    if start < 0:
        raise SystemExit(f"V77: method signature missing: {signature}")
    brace = source.find("{", start)
    if brace < 0:
        raise SystemExit(f"V77: opening brace missing: {signature}")
    depth = 0
    i = brace
    while i < len(source):
        ch = source[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                # Preserve one trailing newline so adjacent methods stay formatted.
                if end < len(source) and source[end] == "\n":
                    end += 1
                return source[:start] + replacement.rstrip() + "\n" + source[end:]
        i += 1
    raise SystemExit(f"V77: unmatched braces: {signature}")


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 76", "versionCode 77", 1)
s = s.replace(
    'versionName "0.76.0-native-lookup-filler"',
    'versionName "0.77.0-continuous-background-voice"',
    1,
)
app.write_text(s)

java_dir = Path("android-nubo/app/src/main/java/com/ainubo/nubo")
service = java_dir / "NuboContinuousVoiceService.java"
service.write_text(r'''package com.ainubo.nubo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

public final class NuboContinuousVoiceService extends Service {
    public static final String ACTION_START = "com.ainubo.nubo.action.CONTINUOUS_VOICE_START";
    public static final String ACTION_STOP = "com.ainubo.nubo.action.CONTINUOUS_VOICE_STOP";

    private static final String CHANNEL_ID = "nubo_continuous_voice_v77";
    private static final int NOTIFICATION_ID = 77001;
    private static volatile boolean running = false;

    public static boolean isRunning() { return running; }

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            running = false;
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
        return START_STICKY;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "NUBO 背景語音",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("讓 NUBO 切到 YouTube、Maps 或其他 App 時維持語音連線。");
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        return b.setSmallIcon(R.drawable.ainubox1_launcher_uploaded)
            .setContentTitle("AINUBO X1")
            .setContentText("NUBO 背景語音持續運作中")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build();
    }

    @Override public void onDestroy() {
        running = false;
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
''')

manifest = Path("android-nubo/app/src/main/AndroidManifest.xml")
ms = manifest.read_text()
for perm in [
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_MICROPHONE",
]:
    if perm not in ms:
        ms = ms.replace(
            "<application",
            f'    <uses-permission android:name="{perm}" />\n\n    <application',
            1,
        )
service_decl = '''
        <service
            android:name=".NuboContinuousVoiceService"
            android:exported="false"
            android:foregroundServiceType="microphone"
            android:stopWithTask="false" />
'''
if "NuboContinuousVoiceService" not in ms:
    ms = ms.replace("</application>", service_decl + "</application>", 1)
manifest.write_text(ms)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v76", "android-v77")
s = s.replace("NUBO-Android/76", "NUBO-Android/77")
s = s.replace("bundle=v76", "bundle=v77")
s = s.replace("nubo_v76_bundle_flushed", "nubo_v77_bundle_flushed")
s = s.replace("nubo-v76-hide-panels", "nubo-v77-hide-panels")

method_anchor = "    private boolean isNuboInPictureInPicture() {"
methods = r'''    private void startContinuousBackgroundVoice() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        Intent intent = new Intent(this, NuboContinuousVoiceService.class);
        intent.setAction(NuboContinuousVoiceService.ACTION_START);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        } catch (RuntimeException ignored) {}
    }

    private void stopContinuousBackgroundVoice() {
        try {
            stopService(new Intent(this, NuboContinuousVoiceService.class));
        } catch (RuntimeException ignored) {}
    }

'''
if "private void startContinuousBackgroundVoice()" not in s:
    if method_anchor not in s:
        raise SystemExit("V77: MainActivity method anchor missing")
    s = s.replace(method_anchor, methods + method_anchor, 1)

# Start after Activity startup. The helper itself refuses to start before RECORD_AUDIO is granted.
oncreate_anchor = "        requestMicrophonePermissionIfNeeded();\n"
if oncreate_anchor not in s:
    raise SystemExit("V77: onCreate microphone anchor missing")
if "requestMicrophonePermissionIfNeeded();\n        startContinuousBackgroundVoice();" not in s:
    s = s.replace(
        oncreate_anchor,
        oncreate_anchor + "        startContinuousBackgroundVoice();\n",
        1,
    )

# Start immediately after runtime RECORD_AUDIO permission is granted.
permission_anchor = "            syncSenseForVoicePhase();\n        }\n    }\n\n    private static boolean isTrustedNuboUri"
if permission_anchor in s:
    s = s.replace(
        permission_anchor,
        "            syncSenseForVoicePhase();\n            startContinuousBackgroundVoice();\n        }\n    }\n\n    private static boolean isTrustedNuboUri",
        1,
    )
else:
    # Some later materializers may already add a statement after syncSenseForVoicePhase.
    permission_probe = "grantResults[0] == PackageManager.PERMISSION_GRANTED"
    if permission_probe not in s:
        raise SystemExit("V77: permission callback anchor missing")

pause_new = r'''    @Override
    protected void onPause() {
        final boolean keepVoiceAlive = NuboContinuousVoiceService.isRunning()
            || externalVoiceKeepAliveActive
            || isNuboInPictureInPicture();

        activityForeground = false;
        stopSenseAmbientCapture();

        if (keepVoiceAlive) {
            // V77: keep Chromium/Gemini Live active while YouTube/Maps is foreground.
            webView.onResume();
            webView.resumeTimers();
        } else {
            webView.evaluateJavascript(
                "window.dispatchEvent(new Event('nubo:native-background'));",
                null
            );
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }
'''
s = replace_java_method(
    s,
    "    @Override\n    protected void onPause()",
    pause_new,
)

resume_new = r'''    @Override
    protected void onResume() {
        super.onResume();
        activityForeground = true;
        webView.onResume();
        webView.resumeTimers();
        webView.evaluateJavascript(
            "window.dispatchEvent(new Event('nubo:native-foreground'));",
            null
        );
        startContinuousBackgroundVoice();
        syncSenseForVoicePhase();
    }
'''
s = replace_java_method(
    s,
    "    @Override\n    protected void onResume()",
    resume_new,
)

# Preserve the existing destruction logic; add only the V77 service teardown at method entry.
destroy_signature = "    @Override\n    protected void onDestroy()"
destroy_start = s.find(destroy_signature)
if destroy_start < 0:
    raise SystemExit("V77: onDestroy signature missing")
destroy_brace = s.find("{", destroy_start)
if destroy_brace < 0:
    raise SystemExit("V77: onDestroy brace missing")
window = s[destroy_brace:destroy_brace + 300]
if "stopContinuousBackgroundVoice();" not in window:
    s = s[:destroy_brace + 1] + "\n        stopContinuousBackgroundVoice();" + s[destroy_brace + 1:]

main.write_text(s)

app_final = app.read_text()
main_final = main.read_text()
manifest_final = manifest.read_text()
service_final = service.read_text()

for token in ["versionCode 77", '0.77.0-continuous-background-voice']:
    if token not in app_final:
        raise SystemExit(f"missing V77 app marker: {token}")

for token in [
    "NUBO-Android/77",
    "private void startContinuousBackgroundVoice()",
    "NuboContinuousVoiceService.isRunning()",
    "webView.onResume()",
    "webView.resumeTimers()",
    "playYouTubeNoSetup",
    "speakLookupFiller(String text)",
    "googleHomeControl",
]:
    if token not in main_final:
        raise SystemExit(f"missing V77 MainActivity marker: {token}")

for token in [
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_MICROPHONE",
    'android:foregroundServiceType="microphone"',
    "NuboContinuousVoiceService",
]:
    if token not in manifest_final:
        raise SystemExit(f"missing V77 manifest marker: {token}")

for token in [
    "FOREGROUND_SERVICE_TYPE_MICROPHONE",
    "START_STICKY",
    "NUBO 背景語音持續運作中",
]:
    if token not in service_final:
        raise SystemExit(f"missing V77 service marker: {token}")

# Crude but effective structural guard: the generated Java must have balanced braces.
if main_final.count("{") != main_final.count("}"):
    raise SystemExit("V77: generated MainActivity has unbalanced braces")

print("Applied V77: brace-safe Stable 1.1-style continuous background voice on V76 baseline")
