#!/usr/bin/env bash
set -euo pipefail

APK="android-nubo/app/build/outputs/apk/release/app-release.apk"
test -f "$APK"

adb install -r "$APK"
adb shell pm path com.ainubo.nubo | grep -q '^package:'
adb shell pm grant com.ainubo.nubo android.permission.RECORD_AUDIO || true
adb logcat -c

# Cold-launch the real app on Android 15. NuboNativeWakeService is non-exported,
# so adb shell must not try to start it directly. The build/payload contract
# separately verifies the microphone foreground-service declaration and native
# wake implementation. Runtime smoke should verify install + launch + no crash.
adb shell am force-stop com.ainubo.nubo
adb shell am start -W -n com.ainubo.nubo/.MainActivity
sleep 5

# Verify the app is still installed and its launcher activity resolves after launch.
adb shell pm path com.ainubo.nubo | grep -q '^package:'
adb shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER com.ainubo.nubo | grep -q 'com.ainubo.nubo'

LOG=/tmp/nubo-logcat.txt
adb logcat -d > "$LOG"
if grep -E 'FATAL EXCEPTION.*com\.ainubo\.nubo|AndroidRuntime:.*com\.ainubo\.nubo|ForegroundServiceStartNotAllowedException|SecurityException:.*com\.ainubo\.nubo' "$LOG"; then
  echo 'NUBO Android 15 launch smoke test found a runtime failure'
  exit 1
fi

echo 'Android 15 managed emulator + signed APK install/cold-launch smoke: PASS'
