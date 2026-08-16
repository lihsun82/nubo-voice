from pathlib import Path

# Execute Stable 2 with two build-materialization corrections without widening
# the runtime change surface:
# 1) inject Vosk/JNA after the known MediaPipe dependency line instead of
#    matching an entire dependencies block;
# 2) fully qualify Gradle RelativePath so model unpack is runner-independent.
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

# Explicit user stop must tear down the native wake service and wakelock.
main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
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
main.write_text(s)

print("Applied Stable 2 v2 build hardening + explicit native wake shutdown bridge")
