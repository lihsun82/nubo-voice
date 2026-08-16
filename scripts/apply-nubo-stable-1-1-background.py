from pathlib import Path
import re
import runpy

# NUBO Stable 1.1 Background Mode
# Start from the verified Stable 1.0 baseline, then add only a microphone
# foreground service + lifecycle keep-alive. YouTube V9, Maps V33 and
# Google Home 1.10.0 are intentionally unchanged.
runpy.run_path("scripts/apply-nubo-stable-1.py", run_name="__main__")

java_dir = Path("android-nubo/app/src/main/java/com/ainubo/nubo")
service = java_dir / "NuboBackgroundVoiceService.java"
service.write_text(r'''package com.ainubo.nubo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

public final class NuboBackgroundVoiceService extends Service {
    public static final String ACTION_START = "com.ainubo.nubo.action.BACKGROUND_VOICE_START";
    public static final String ACTION_STOP = "com.ainubo.nubo.action.BACKGROUND_VOICE_STOP";

    private static final String CHANNEL_ID = "nubo_background_voice_stable_1_1";
    private static final int NOTIFICATION_ID = 1101;
    private static volatile boolean running = false;

    public static boolean isRunning() {
        return running;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            running = false;
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        running = true;
        startForegroundCompat(buildNotification());
        return START_STICKY;
    }

    private void startForegroundCompat(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
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
        channel.setDescription("讓 NUBO 切到其他 App 時仍維持語音連線。");
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        return builder
            .setSmallIcon(R.drawable.ainubox1_launcher_uploaded)
            .setContentTitle("AINUBO X1")
            .setContentText("NUBO 背景語音持續運作中")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build();
    }

    @Override
    public void onDestroy() {
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
''')

manifest = Path("android-nubo/app/src/main/AndroidManifest.xml")
ms = manifest.read_text()

if "android.permission.FOREGROUND_SERVICE" not in ms:
    ms = ms.replace(
        '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
        '<uses-permission android:name="android.permission.RECORD_AUDIO" />\n'
        '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
        1,
    )

if "android.permission.FOREGROUND_SERVICE_MICROPHONE" not in ms:
    anchor_permission = '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />'
    if anchor_permission not in ms:
        raise SystemExit("Stable 1.1: generic foreground-service permission anchor missing")
    ms = ms.replace(
        anchor_permission,
        anchor_permission + '\n'
        '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />',
        1,
    )

ms = re.sub(
    r'\n\s*<service\b(?=[^>]*android:name="\.NuboBackgroundVoiceService")[^>]*/>\s*',
    "\n",
    ms,
    flags=re.S,
)
ms = re.sub(
    r'\n\s*<service\b(?=[^>]*android:name="\.NuboBackgroundVoiceService")[^>]*>.*?</service>\s*',
    "\n",
    ms,
    flags=re.S,
)

service_decl = '''
        <service
            android:name=".NuboBackgroundVoiceService"
            android:exported="false"
            android:foregroundServiceType="microphone"
            android:stopWithTask="false" />
'''
if "</application>" not in ms:
    raise SystemExit("Stable 1.1: application close tag missing")
ms = ms.replace("</application>", service_decl + "</application>", 1)
manifest.write_text(ms)

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 1000", "versionCode 1001", 1)
s = s.replace(
    'versionName "1.0.0-stable-youtube-v9-maps-v33"',
    'versionName "1.1.0-stable-background-voice"',
    1,
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("NUBO-Stable/1.0", "NUBO-Stable/1.1")
s = s.replace("stable-1", "stable-1-1")

anchor = '''    private boolean isNuboInPictureInPicture() {
'''
methods = '''    private void startBackgroundVoiceMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            && checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        Intent intent = new Intent(this, NuboBackgroundVoiceService.class);
        intent.setAction(NuboBackgroundVoiceService.ACTION_START);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        } catch (RuntimeException ignored) {
        }
    }

    private void stopBackgroundVoiceMode() {
        try {
            stopService(new Intent(this, NuboBackgroundVoiceService.class));
        } catch (RuntimeException ignored) {
        }
    }

'''
if methods not in s:
    if anchor not in s:
        raise SystemExit("Stable 1.1: lifecycle method anchor missing")
    s = s.replace(anchor, methods + anchor, 1)

permission_old = '''            syncSenseForVoicePhase();
        }
    }

    private static boolean isTrustedNuboUri(Uri uri) {
'''
permission_new = '''            syncSenseForVoicePhase();
            startBackgroundVoiceMode();
        }
    }

    private static boolean isTrustedNuboUri(Uri uri) {
'''
if permission_old not in s:
    raise SystemExit("Stable 1.1: permission callback anchor missing")
s = s.replace(permission_old, permission_new, 1)

resume_old = '''        webView.evaluateJavascript(
            "window.dispatchEvent(new Event('nubo:native-foreground'));",
            null
        );
        syncSenseForVoicePhase();
    }
'''
resume_new = '''        webView.evaluateJavascript(
            "window.dispatchEvent(new Event('nubo:native-foreground'));",
            null
        );
        startBackgroundVoiceMode();
        syncSenseForVoicePhase();
    }
'''
if resume_old not in s:
    raise SystemExit("Stable 1.1: onResume anchor missing")
s = s.replace(resume_old, resume_new, 1)

pause_pattern = re.compile(r'''    @Override\n    protected void onPause\(\) \{.*?\n        super\.onPause\(\);\n    \}\n''', re.S)
pause_match = pause_pattern.search(s)
if not pause_match:
    raise SystemExit("Stable 1.1: onPause block missing")
pause_new = '''    @Override
    protected void onPause() {
        final boolean backgroundVoiceActive = NuboBackgroundVoiceService.isRunning();
        final boolean keepVoiceAlive = backgroundVoiceActive
            || externalVoiceKeepAliveActive
            || isNuboInPictureInPicture();

        if (keepVoiceAlive) {
            activityForeground = false;
            stopSenseAmbientCapture();
            webView.resumeTimers();
        } else {
            activityForeground = false;
            stopSenseAmbientCapture();
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
s = s[:pause_match.start()] + pause_new + s[pause_match.end():]

destroy_old = '''    protected void onDestroy() {
        activityForeground = false;
        stopNativeWakeListener();
'''
destroy_new = '''    protected void onDestroy() {
        activityForeground = false;
        stopBackgroundVoiceMode();
        stopNativeWakeListener();
'''
if destroy_old not in s:
    raise SystemExit("Stable 1.1: onDestroy anchor missing")
s = s.replace(destroy_old, destroy_new, 1)

main.write_text(s)

app_final = app.read_text()
main_final = main.read_text()
manifest_final = manifest.read_text()
service_final = service.read_text()

for token in [
    "versionCode 1001",
    'versionName "1.1.0-stable-background-voice"',
]:
    if token not in app_final:
        raise SystemExit(f"missing Stable 1.1 app marker: {token}")

for token in [
    "NUBO-Stable/1.1",
    "NuboBackgroundVoiceService.isRunning()",
    "startBackgroundVoiceMode()",
    "webView.resumeTimers()",
    "public boolean playYouTubeNoSetup",
    "activity.launchExternalTarget(safeTarget, safeLabel)",
    "public boolean googleHomeControl",
]:
    if token not in main_final:
        raise SystemExit(f"missing Stable 1.1 Android marker: {token}")

for token in [
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_MICROPHONE",
    'android:foregroundServiceType="microphone"',
    "NuboBackgroundVoiceService",
]:
    if token not in manifest_final:
        raise SystemExit(f"missing Stable 1.1 manifest marker: {token}")

if manifest_final.count('android:name=".NuboBackgroundVoiceService"') != 1:
    raise SystemExit("Stable 1.1 must contain exactly one background voice service declaration")

for token in [
    "FOREGROUND_SERVICE_TYPE_MICROPHONE",
    "START_STICKY",
    "NUBO 背景語音持續運作中",
]:
    if token not in service_final:
        raise SystemExit(f"missing Stable 1.1 service marker: {token}")

if (java_dir / "NuboBackgroundListeningService.java").exists():
    raise SystemExit("V52 timed background service must remain excluded")
if (java_dir / "NuboYouTubeAccessibilityService.java").exists():
    raise SystemExit("YouTube accessibility agent must remain excluded")
if "NuboYouTubeAccessibilityService" in manifest_final:
    raise SystemExit("YouTube accessibility service must remain unregistered")

print("Applied NUBO Stable 1.1: continuous Android background voice keep-alive; V9 YouTube/V33 Maps preserved")
