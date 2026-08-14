package com.ainubo.nubo;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.ComponentActivity;

import org.json.JSONObject;

public abstract class GoogleHomeActivity extends ComponentActivity {
    private GoogleHomeGateway googleHomeGateway;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        googleHomeGateway = GoogleHomeGateway.create(this);
    }

    protected final String googleHomeStatus() {
        return googleHomeGateway.status();
    }

    protected final boolean googleHomeRequestPermissions(String requestId, WebView target) {
        if (!isValidRequestId(requestId) || target == null) return false;
        runOnUiThread(() -> googleHomeGateway.requestPermissions(
            payload -> emitGoogleHomeResult(target, requestId, payload)
        ));
        return true;
    }

    protected final boolean googleHomeListDevices(String requestId, WebView target) {
        if (!isValidRequestId(requestId) || target == null) return false;
        runOnUiThread(() -> googleHomeGateway.listDevices(
            payload -> emitGoogleHomeResult(target, requestId, payload)
        ));
        return true;
    }

    protected final boolean googleHomeControl(
        String requestId,
        String action,
        String roomName,
        String deviceName,
        WebView target
    ) {
        if (!isValidRequestId(requestId) || target == null) return false;
        String safeAction = action == null ? "" : action.trim();
        String safeRoom = roomName == null ? "" : roomName.trim();
        String safeDevice = deviceName == null ? "" : deviceName.trim();
        runOnUiThread(() -> googleHomeGateway.control(
            safeAction,
            safeRoom,
            safeDevice,
            payload -> emitGoogleHomeResult(target, requestId, payload)
        ));
        return true;
    }

    private void emitGoogleHomeResult(WebView target, String requestId, String payloadJson) {
        try {
            JSONObject payload;
            try {
                payload = new JSONObject(payloadJson == null ? "{}" : payloadJson);
            } catch (Exception ignored) {
                payload = new JSONObject();
                payload.put("ok", false);
                payload.put("error", "Google Home 回傳格式錯誤");
            }
            payload.put("requestId", requestId);
            String javascript =
                "window.dispatchEvent(new CustomEvent('nubo:google-home-result',{detail:"
                    + payload.toString()
                    + "}));";
            target.post(() -> target.evaluateJavascript(javascript, null));
        } catch (Exception ignored) {
            // Keep the app alive if a malformed native callback is returned.
        }
    }

    private static boolean isValidRequestId(String requestId) {
        return requestId != null && requestId.length() >= 8 && requestId.length() <= 128;
    }

    @Override
    protected void onDestroy() {
        if (googleHomeGateway != null) {
            googleHomeGateway.destroy();
            googleHomeGateway = null;
        }
        super.onDestroy();
    }
}
