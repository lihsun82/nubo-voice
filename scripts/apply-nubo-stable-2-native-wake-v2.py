from pathlib import Path

# Execute Stable 2 with narrowly-scoped materialization corrections.
source_path = Path("scripts/apply-nubo-stable-2-native-wake.py")
source = source_path.read_text()

old_dep = '''if 'com.alphacephei:vosk-android' not in s:
    s = s.replace(
        'dependencies {\\n    implementation "com.google.mediapipe:tasks-audio:1.0.0"\\n}',
        ''' + "'''dependencies {\n    implementation \"com.google.mediapipe:tasks-audio:1.0.0\"\n    implementation \"net.java.dev.jna:jna:5.18.1@aar\"\n    implementation \"com.alphacephei:vosk-android:0.3.75@aar\"\n}'''" + ''',
        1,
    )
'''

new_dep = '''if 'com.alphacephei:vosk-android' not in s:
    dep_anchor = '    implementation "com.google.mediapipe:tasks-audio:1.0.0"'
    if dep_anchor not in s:
        raise SystemExit("Stable 2: MediaPipe dependency anchor missing")
    s = s.replace(
        dep_anchor,
        dep_anchor + '\\n'
        '    implementation "net.java.dev.jna:jna:5.18.1@aar"\\n'
        '    implementation "com.alphacephei:vosk-android:0.3.75@aar"',
        1,
    )
'''

if old_dep not in source:
    raise SystemExit("Stable 2 v2: old dependency injection block not found")
source = source.replace(old_dep, new_dep, 1)
source = source.replace(
    'new RelativePath(!f.directory, f.relativePath.segments.drop(1) as String[])',
    'new org.gradle.api.file.RelativePath(!f.directory, f.relativePath.segments.drop(1) as String[])',
)

exec(compile(source, str(source_path), "exec"), {"__name__": "__main__"})

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

# Stable 2's original historical field anchor may be absent in Stable 1.0.
# Declare the active Activity reference directly after the class declaration.
if "private static volatile MainActivity stable2Activity;" not in s:
    class_anchor = "public final class MainActivity extends GoogleHomeActivity {\n"
    if class_anchor not in s:
        raise SystemExit("Stable 2 v2: MainActivity class anchor missing")
    s = s.replace(
        class_anchor,
        class_anchor + "    private static volatile MainActivity stable2Activity;\n",
        1,
    )

# Explicit user stop must tear down the native wake service and wakelock.
bridge_anchor = '''        @JavascriptInterface
        public boolean isExternalVoiceKeepAliveActive()'''
stop_bridge = '''        @JavascriptInterface
        public boolean stopNativeWakeService() {
            activity.runOnUiThread(
                () -> activity.sendNativeWakeAction(NuboNativeWakeService.ACTION_STOP)
            );
            return true;
        }

'''
if "stopNativeWakeService()" not in s:
    if bridge_anchor not in s:
        raise SystemExit("Stable 2 v2: stop bridge anchor missing")
    s = s.replace(bridge_anchor, stop_bridge + bridge_anchor, 1)

if "private static volatile MainActivity stable2Activity;" not in s:
    raise SystemExit("Stable 2 v2: Activity bridge field missing")
main.write_text(s)

print("Applied Stable 2 v2 build hardening + Activity bridge + explicit native wake shutdown")
