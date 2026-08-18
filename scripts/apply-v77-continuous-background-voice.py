from pathlib import Path
import re
import runpy

# V77: preserve V76 and restore the proven Stable 1.1 background architecture:
# microphone foreground service + keep WebView/Chromium timers alive while NUBO is backgrounded.
runpy.run_path("scripts/apply-v76-native-lookup-filler.py", run_name="__main__")

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = s.replace("versionCode 76", "versionCode 77", 1)
s = s.replace('versionName "0.76.0-native-lookup-filler"', 'versionName "0.77.0-continuous-background-voice"', 1)
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
            '<application',
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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent);
            else startService(intent);
        } catch (RuntimeException ignored) {}
    }

    private void stopContinuousBackgroundVoice() {
        Intent intent = new Intent(this, NuboContinuousVoiceService.class);
        intent.setAction(NuboContinuousVoiceService.ACTION_STOP);
        try { startService(intent); }
        catch (RuntimeException ignored) { stopService(new Intent(this, NuboContinuousVoiceService.class)); }
    }

'''
if "startContinuousBackgroundVoice()" not in s:
    if method_anchor not in s:
        raise SystemExit("V77: MainActivity method anchor missing")
    s = s.replace(method_anchor, methods + method_anchor, 1)

# Start the foreground microphone service as soon as the Activity has permission.
oncreate_anchor = "        requestMicrophonePermissionIfNeeded();\n"
if oncreate_anchor in s and "startContinuousBackgroundVoice();" not in s.split(oncreate_anchor, 1)[0][-300:]:
    s = s.replace(oncreate_anchor, oncreate_anchor + "        startContinuousBackgroundVoice();\n", 1)

# Also start after runtime permission is granted.
permission_pattern = re.compile(r'(requestCode == MICROPHONE_PERMISSION_REQUEST.*?syncSenseForVoicePhase\(\);)', re.S)
m = permission_pattern.search(s)
if m and "startContinuousBackgroundVoice();" not in m.group(1):
    replacement = m.group(1).replace("syncSenseForVoicePhase();", "syncSenseForVoicePhase();\n            startContinuousBackgroundVoice();", 1)
    s = s[:m.start()] + replacement + s[m.end():]

# Replace onPause with the proven Stable 1.1 behavior: keep Chromium live while FGS is running.
pause_pattern = re.compile(r'    @Override\n    protected void onPause\(\) \{.*?\n    \}\n', re.S)
pause = pause_pattern.search(s)
if not pause:
    raise SystemExit("V77: onPause block missing")
pause_new = r'''    @Override
    protected void onPause() {
        final boolean keepVoiceAlive = NuboContinuousVoiceService.isRunning()
            || externalVoiceKeepAliveActive
            || isNuboInPictureInPicture();

        activityForeground = false;
        stopSenseAmbientCapture();

        if (keepVoiceAlive) {
            // V77: do NOT pause WebView/Chromium/Gemini Live when another app is foreground.
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
s = s[:pause.start()] + pause_new + s[pause.end():]

# Reassert keep-alive on resume.
resume_pattern = re.compile(r'    @Override\n    protected void onResume\(\) \{(.*?)\n    \}\n', re.S)
resume = resume_pattern.search(s)
if resume and "startContinuousBackgroundVoice();" not in resume.group(1):
    body = resume.group(1) + "\n        startContinuousBackgroundVoice();"
    s = s[:resume.start()] + "    @Override\n    protected void onResume() {" + body + "\n    }\n" + s[resume.end():]

# Tear down only when Activity really dies.
destroy_pattern = re.compile(r'    @Override\n    protected void onDestroy\(\) \{', re.S)
destroy = destroy_pattern.search(s)
if destroy and "stopContinuousBackgroundVoice();" not in s[destroy.start():destroy.start()+500]:
    insert_at = destroy.end()
    s = s[:insert_at] + "\n        stopContinuousBackgroundVoice();" + s[insert_at:]

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
    "startContinuousBackgroundVoice()",
    "NuboContinuousVoiceService.isRunning()",
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
for token in ["FOREGROUND_SERVICE_TYPE_MICROPHONE", "START_STICKY", "NUBO 背景語音持續運作中"]:
    if token not in service_final:
        raise SystemExit(f"missing V77 service marker: {token}")

print("Applied V77: Stable 1.1-style continuous background voice on V76 baseline")