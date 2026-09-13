package com.ainubo.nubo;

import android.app.Activity;
import android.app.Application;
import android.media.AudioManager;
import android.os.Bundle;

public final class NuboSmartAudioApplication extends Application {
    private AudioManager audioManager;
    private int previousMode = AudioManager.MODE_NORMAL;
    private int resumedActivities = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);

        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override
            public void onActivityResumed(Activity activity) {
                resumedActivities += 1;
                enableSmartVoiceMode();
            }

            @Override
            public void onActivityPaused(Activity activity) {
                resumedActivities = Math.max(0, resumedActivities - 1);
                if (resumedActivities == 0) restoreAudioMode();
            }

            @Override public void onActivityCreated(Activity activity, Bundle state) {}
            @Override public void onActivityStarted(Activity activity) {}
            @Override public void onActivityStopped(Activity activity) {}
            @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) {}
            @Override public void onActivityDestroyed(Activity activity) {}
        });
    }

    private void enableSmartVoiceMode() {
        if (audioManager == null) return;
        previousMode = audioManager.getMode();
        try {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        } catch (SecurityException ignored) {
            // WebView/browser-level AEC/NS/AGC remains active as the fallback.
        }
    }

    private void restoreAudioMode() {
        if (audioManager == null) return;
        try {
            audioManager.setMode(previousMode);
        } catch (SecurityException ignored) {
            // No-op: Android will restore routing when the process exits.
        }
    }
}
