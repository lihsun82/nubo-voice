#!/usr/bin/env bash
set -euo pipefail

APK="android-nubo/app/build/outputs/apk/release/app-release.apk"
test -f "$APK"

adb install -r "$APK"
adb shell pm path com.ainubo.nubo | grep -q '^package:'
adb shell pm grant com.ainubo.nubo android.permission.RECORD_AUDIO || true
adb logcat -c

adb shell am start -W -n com.ainubo.nubo/.MainActivity
sleep 3
adb shell am start-foreground-service -n com.ainubo.nubo/.NuboNativeWakeService -a com.ainubo.nubo.action.NATIVE_WAKE_ARM
sleep 3

adb shell dumpsys activity services com.ainubo.nubo > /tmp/nubo-services.txt
grep -q 'NuboNativeWakeService' /tmp/nubo-services.txt

if adb logcat -d | grep -E 'FATAL EXCEPTION.*com\.ainubo\.nubo|ForegroundServiceStartNotAllowedException|SecurityException:.*NuboNativeWakeService'; then
  echo 'NUBO foreground-service smoke test found a runtime failure'
  exit 1
fi

echo 'Android 15 managed emulator + native foreground-service smoke: PASS'
