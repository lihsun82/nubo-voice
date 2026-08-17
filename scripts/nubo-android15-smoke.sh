#!/usr/bin/env bash
set -euo pipefail

APK="android-nubo/app/build/outputs/apk/release/app-release.apk"
test -f "$APK"

adb install -r "$APK"
adb shell pm path com.ainubo.nubo | grep -q '^package:'
adb shell pm grant com.ainubo.nubo android.permission.RECORD_AUDIO || true
adb logcat -c

# Cold-launch the real app on Android 15. NuboNativeWakeService is intentionally
# non-exported, so adb shell must not try to start it directly; Android correctly
# rejects that cross-UID call. The build/payload contract separately verifies the
# microphone foreground-service declaration and native wake implementation.
adb shell am force-stop com.ainubo.nubo
adb shell am start -W -n com.ainubo.nubo/.MainActivity
sleep 5

adb shell dumpsys package com.ainubo.nubo > /tmp/nubo-package.txt
grep -q 'NuboNativeWakeService' /tmp/nubo-package.txt

LOG=/tmp/nubo-logcat.txt
adb logcat -d > "$LOG"
if grep -E 'FATAL EXCEPTION.*com\.ainubo\.nubo|AndroidRuntime:.*com\.ainubo\.nubo|ForegroundServiceStartNotAllowedException|SecurityException:.*com\.ainubo\.nubo' "$LOG"; then
  echo 'NUBO Android 15 launch smoke test found a runtime failure'
  exit 1
fi

echo 'Android 15 managed emulator + signed APK install/cold-launch smoke: PASS'
