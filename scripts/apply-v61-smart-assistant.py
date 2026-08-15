from pathlib import Path
import runpy

# Preserve V60 stable Android baseline.
runpy.run_path("scripts/apply-ui-v60-hide-capabilities.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"missing V61 pattern: {label}")
    return text.replace(old, new, 1)

app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 60", "versionCode 61", "versionCode")
s = replace_once(
    s,
    'versionName "0.60.0-native-hide-panels-capabilities"',
    'versionName "0.61.0-smart-assistant-persistent-home"',
    "versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()
s = s.replace("android-v60", "android-v61")
s = s.replace("NUBO-Android/60", "NUBO-Android/61")
s = s.replace("bundle=v60", "bundle=v61")
s = s.replace("nubo_v60_bundle_flushed", "nubo_v61_bundle_flushed")
s = s.replace("nubo-v60-hide-panels", "nubo-v61-hide-panels")
main.write_text(s)

gh = Path("android-nubo/app/src/googleHome/java/com/ainubo/nubo/googlehome/GoogleHomeGatewayImpl.kt")
g = gh.read_text()

g = replace_once(
    g,
    "    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)\n",
    "    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)\n"
    "    private val permissionPrefs by lazy {\n"
    "        activity.getSharedPreferences(\"nubo_google_home_permission_v61\", 0)\n"
    "    }\n",
    "Google Home permission prefs",
)

old_request = '''    override fun requestPermissions(callback: GoogleHomeGateway.Callback) {
        scope.launch {
            try {
                val result = client.requestPermissions(
                    ForcePermissionFlow.FORCE_LAUNCH,
                )
                val ok = result.status == PermissionsResultStatus.SUCCESS
                val payload = JSONObject()
                    .put("ok", ok)
                    .put("status", result.status.name)
                    .put("message", result.errorMessage ?: "")
                callback.onResult(payload.toString())
            } catch (error: Exception) {
                callback.onResult(errorPayload(error))
            }
        }
    }
'''
new_request = '''    override fun requestPermissions(callback: GoogleHomeGateway.Callback) {
        scope.launch {
            try {
                if (permissionPrefs.getBoolean("granted", false)) {
                    callback.onResult(
                        JSONObject()
                            .put("ok", true)
                            .put("status", "CACHED_GRANTED")
                            .put("message", "Google Home 已完成設定，沿用既有授權")
                            .put("reused", true)
                            .toString(),
                    )
                    return@launch
                }

                // V61 migration path: existing V60/older Google Home permission is owned by
                // the platform Home SDK, not by this new preference key. Probe the existing
                // session first; if structures are readable, adopt it without reopening setup.
                try {
                    withTimeout(3_500L) {
                        client.structures().list()
                    }
                    permissionPrefs.edit().putBoolean("granted", true).apply()
                    callback.onResult(
                        JSONObject()
                            .put("ok", true)
                            .put("status", "REUSED_EXISTING")
                            .put("message", "已沿用原本 Google Home 設定")
                            .put("reused", true)
                            .toString(),
                    )
                    return@launch
                } catch (_: Exception) {
                    // Existing authorization is not usable; fall through to explicit setup.
                }

                val result = client.requestPermissions(
                    ForcePermissionFlow.FORCE_LAUNCH,
                )
                val ok = result.status == PermissionsResultStatus.SUCCESS
                if (ok) {
                    permissionPrefs.edit().putBoolean("granted", true).apply()
                }
                val payload = JSONObject()
                    .put("ok", ok)
                    .put("status", result.status.name)
                    .put("message", result.errorMessage ?: "")
                    .put("reused", false)
                callback.onResult(payload.toString())
            } catch (error: Exception) {
                callback.onResult(errorPayload(error))
            }
        }
    }
'''
g = replace_once(g, old_request, new_request, "persistent permission request")

# Clear the cached flag only when device enumeration itself fails. The next explicit setup
# action can then reopen the permission flow; normal launches never force onboarding.
needle = '''            } catch (error: Exception) {
                callback.onResult(errorPayload(error))
            }
        }
    }

    override fun control(
'''
replacement = '''            } catch (error: Exception) {
                permissionPrefs.edit().remove("granted").apply()
                callback.onResult(errorPayload(error))
            }
        }
    }

    override fun control(
'''
g = replace_once(g, needle, replacement, "clear stale permission on list failure")

gh.write_text(g)

for token in ["versionCode 61", '0.61.0-smart-assistant-persistent-home']:
    if token not in app.read_text():
        raise SystemExit(f"missing V61 app marker: {token}")

main_final = main.read_text()
for token in [
    "NUBO-Android/61",
    "android-v61",
    ".question-history,.task-center,.capabilities{display:none!important}",
    "p.setVolume(72)",
    "createOnDeviceSpeechRecognizer",
]:
    if token not in main_final:
        raise SystemExit(f"missing V61 Android marker: {token}")

home_final = gh.read_text()
for token in [
    "nubo_google_home_permission_v61",
    "CACHED_GRANTED",
    "REUSED_EXISTING",
    'putBoolean("granted", true)',
    'remove("granted")',
    'sdk", "1.10.0"',
]:
    if token not in home_final:
        raise SystemExit(f"missing V61 Google Home marker: {token}")

print("Applied V61 Android: V60 baseline + persistent/reused Google Home permission")
