from pathlib import Path
import runpy


# V31 builds on the validated V30 YouTube switch patch, changing only
# YouTube / YouTube Music task handling. No voice, Sense, PiP, avatar/UI
# or Google Home behavior is modified here.
runpy.run_path("scripts/apply-youtube-switch-v30.py", run_name="__main__")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


app = Path("android-nubo/app/build.gradle")
s = app.read_text()
s = replace_once(s, "versionCode 30", "versionCode 31", "V31 versionCode")
s = replace_once(
    s,
    'versionName "0.30.0-youtube-switch"',
    'versionName "0.31.0-youtube-force-reset"',
    "V31 versionName",
)
app.write_text(s)

main = Path("android-nubo/app/src/main/java/com/ainubo/nubo/MainActivity.java")
s = main.read_text()

old = '''        // Reuse the existing YouTube task/player instead of stacking another\n        // ACTION_VIEW activity behind the song that is already on screen.\n        // This makes a voice request for a different song replace the current\n        // track immediately instead of waiting for the user to swipe the old one away.\n        intent.addFlags(\n            Intent.FLAG_ACTIVITY_NEW_TASK\n                | Intent.FLAG_ACTIVITY_CLEAR_TOP\n                | Intent.FLAG_ACTIVITY_SINGLE_TOP\n        );\n        intent.putExtra("nubo_youtube_switch_build", "v30-instant-switch");\n'''

new = '''        // V31: YouTube can ignore CLEAR_TOP/SINGLE_TOP while its current player\n        // task remains active. CLEAR_TASK + NEW_TASK makes Android finish the\n        // existing task associated with the target activity before starting the\n        // requested track as the new root. This mirrors the user's successful\n        // manual workaround (swiping away the old YouTube task) automatically,\n        // without touching NUBO's own task or voice session.\n        intent.setFlags(\n            Intent.FLAG_ACTIVITY_NEW_TASK\n                | Intent.FLAG_ACTIVITY_CLEAR_TASK\n        );\n        intent.putExtra("nubo_youtube_switch_build", "v31-force-task-reset");\n'''

s = replace_once(s, old, new, "V31 force-reset YouTube task")
main.write_text(s)
