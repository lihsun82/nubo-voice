# NUBO Android Native App V8

This Android app loads `https://nubo.ainubo.com` inside a trusted WebView and injects the `window.NuboNative` bridge.

The bridge launches allowlisted Android apps with explicit native intents, so YouTube, LINE, Instagram, Facebook, Gmail and Google Maps do not pass through Chrome's external-app confirmation prompt when the target app is installed.

## Open in Android Studio

1. Open the `android-nubo` folder as an Android project.
2. Use JDK 17.
3. Let Android Studio install Android SDK 35 and Build Tools 35.0.0.
4. Run the `app` configuration on an Android device.
5. Allow microphone access on first launch.

## Command-line debug build

```bash
gradle -p android-nubo assembleDebug
```

Output:

```text
android-nubo/app/build/outputs/apk/debug/app-debug.apk
```

## Security boundaries

- Only HTTPS pages on `nubo.ainubo.com` stay inside the WebView.
- External navigation is sent to Android instead of being rendered inside NUBO.
- File access and cleartext traffic are disabled.
- The JavaScript bridge accepts only the NUBO launch categories and standard external URI schemes.
