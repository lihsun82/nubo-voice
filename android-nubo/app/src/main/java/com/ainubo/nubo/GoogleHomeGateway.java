package com.ainubo.nubo;

import androidx.activity.ComponentActivity;

public final class GoogleHomeGateway {
    public interface Callback {
        void onResult(String payloadJson);
    }

    public interface Delegate {
        String status();
        void requestPermissions(Callback callback);
        void listDevices(Callback callback);
        void control(String action, String roomName, String deviceName, Callback callback);
        void destroy();
    }

    private static final String IMPLEMENTATION_CLASS =
        "com.ainubo.nubo.googlehome.GoogleHomeGatewayImpl";

    private final Delegate delegate;

    private GoogleHomeGateway(Delegate delegate) {
        this.delegate = delegate;
    }

    static GoogleHomeGateway create(ComponentActivity activity) {
        if (!BuildConfig.GOOGLE_HOME_ENABLED) {
            return new GoogleHomeGateway(new DisabledDelegate(
                "Google Home 模組尚未啟用。請使用 -PnuboGoogleHome=true 建置測試 APK。"
            ));
        }

        try {
            Class<?> implementation = Class.forName(IMPLEMENTATION_CLASS);
            Object instance = implementation
                .getConstructor(ComponentActivity.class)
                .newInstance(activity);
            return new GoogleHomeGateway((Delegate) instance);
        } catch (Exception error) {
            return new GoogleHomeGateway(new DisabledDelegate(
                "Google Home 模組載入失敗：" + safeMessage(error)
            ));
        }
    }

    String status() {
        return delegate.status();
    }

    void requestPermissions(Callback callback) {
        delegate.requestPermissions(callback);
    }

    void listDevices(Callback callback) {
        delegate.listDevices(callback);
    }

    void control(
        String action,
        String roomName,
        String deviceName,
        Callback callback
    ) {
        delegate.control(action, roomName, deviceName, callback);
    }

    void destroy() {
        delegate.destroy();
    }

    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty()
            ? error.getClass().getSimpleName()
            : message;
    }

    private static final class DisabledDelegate implements Delegate {
        private final String reason;

        DisabledDelegate(String reason) {
            this.reason = reason;
        }

        @Override
        public String status() {
            return "{\"ok\":true,\"available\":false,\"enabled\":false,\"message\":\""
                + escapeJson(reason)
                + "\"}";
        }

        @Override
        public void requestPermissions(Callback callback) {
            callback.onResult(errorPayload(reason));
        }

        @Override
        public void listDevices(Callback callback) {
            callback.onResult(errorPayload(reason));
        }

        @Override
        public void control(
            String action,
            String roomName,
            String deviceName,
            Callback callback
        ) {
            callback.onResult(errorPayload(reason));
        }

        @Override
        public void destroy() {
            // Nothing to release.
        }

        private static String errorPayload(String message) {
            return "{\"ok\":false,\"error\":\""
                + escapeJson(message)
                + "\"}";
        }

        private static String escapeJson(String value) {
            return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
        }
    }
}
