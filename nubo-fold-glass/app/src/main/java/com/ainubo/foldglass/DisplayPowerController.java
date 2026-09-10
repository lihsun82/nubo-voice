package com.ainubo.foldglass;

import android.os.IBinder;
import android.view.Display;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import rikka.shizuku.ShizukuBinderWrapper;
import rikka.shizuku.SystemServiceHelper;

/**
 * v0.7 direct display-power bridge.
 *
 * Android 16's DisplayManagerService has a hidden requestDisplayPower(displayId,
 * state) API guarded by MANAGE_DISPLAYS. Shizuku runs with shell identity and the
 * Android shell package holds that permission. This lets us request STATE_ON for
 * the cover and inner logical displays during the fold hand-off, instead of only
 * asking ColorOS not to sleep the currently-active display.
 */
final class DisplayPowerController {
    static final class LogicalDisplayInfo {
        final int id;
        final String name;
        final String state;
        final String uniqueId;
        final int width;
        final int height;

        LogicalDisplayInfo(int id, String name, String state, String uniqueId,
                           int width, int height) {
            this.id = id;
            this.name = name == null ? "" : name;
            this.state = state == null ? "UNKNOWN" : state.toUpperCase(Locale.ROOT);
            this.uniqueId = uniqueId == null ? "" : uniqueId;
            this.width = width;
            this.height = height;
        }

        boolean isOnLike() {
            return "ON".equals(state)
                    || "DOZE".equals(state)
                    || "DOZE_SUSPEND".equals(state)
                    || "ON_SUSPEND".equals(state);
        }

        long area() {
            return (long) Math.max(1, width) * Math.max(1, height);
        }

        @Override public String toString() {
            return "#" + id + " " + width + "x" + height + " " + state
                    + (name.isEmpty() ? "" : " " + name);
        }
    }

    static final class PowerResult {
        final boolean ok;
        final String backend;
        final String detail;

        PowerResult(boolean ok, String backend, String detail) {
            this.ok = ok;
            this.backend = backend == null ? "none" : backend;
            this.detail = detail == null ? "" : detail;
        }
    }

    private static final Pattern DISPLAY_ID = Pattern.compile("Display id\\s+(\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern DISPLAY_NAME = Pattern.compile("DisplayInfo\\{\\\"([^\\\"]*)\\\"");
    private static final Pattern DISPLAY_STATE = Pattern.compile(
            "\\bstate\\s+(ON_SUSPEND|DOZE_SUSPEND|DOZE|ON|OFF|UNKNOWN|VR)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern UNIQUE_ID = Pattern.compile("uniqueId\\s+\\\"([^\\\"]+)\\\"", Pattern.CASE_INSENSITIVE);
    private static final Pattern REAL_SIZE = Pattern.compile("\\breal\\s+(\\d+)\\s*x\\s*(\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern LOGICAL_SIZE = Pattern.compile("\\blogical\\s+(\\d+)\\s*x\\s*(\\d+)", Pattern.CASE_INSENSITIVE);

    private final DeviceStateController shell;
    private Object displayManager;
    private Method requestPowerInt;
    private Method requestPowerBoolean;
    private String initError = "";

    DisplayPowerController(DeviceStateController shell) {
        this.shell = shell;
    }

    boolean isPrivilegedReady() {
        return shell != null && shell.hasShizukuPermission();
    }

    List<LogicalDisplayInfo> listInternalDisplays() {
        if (shell == null) return new ArrayList<>();

        DeviceStateController.CommandResult result =
                shell.run("cmd display get-displays -t internal");
        List<LogicalDisplayInfo> parsed = parseDisplays(result.output, true);
        if (!parsed.isEmpty()) return parsed;

        result = shell.run("cmd display get-displays");
        return parseDisplays(result.output, false);
    }

    String summarizeInternalDisplays() {
        List<LogicalDisplayInfo> displays = listInternalDisplays();
        if (displays.isEmpty()) return "logical INTERNAL: unavailable";
        StringBuilder out = new StringBuilder("logical INTERNAL: ");
        for (LogicalDisplayInfo info : displays) {
            if (out.length() > 18) out.append(" | ");
            out.append(info.toString());
        }
        return out.toString();
    }

    int countOn(List<LogicalDisplayInfo> displays) {
        int count = 0;
        if (displays == null) return 0;
        for (LogicalDisplayInfo info : displays) if (info.isOnLike()) count++;
        return count;
    }

    int chooseOuterId(List<LogicalDisplayInfo> displays, int knownInner) {
        LogicalDisplayInfo best = null;
        if (displays == null) return -1;
        for (LogicalDisplayInfo info : displays) {
            if (info.id == knownInner) continue;
            if (best == null || info.area() < best.area()) best = info;
        }
        return best == null ? -1 : best.id;
    }

    int chooseInnerId(List<LogicalDisplayInfo> displays, int knownOuter) {
        LogicalDisplayInfo best = null;
        if (displays == null) return -1;
        for (LogicalDisplayInfo info : displays) {
            if (info.id == knownOuter) continue;
            if (best == null || info.area() > best.area()) best = info;
        }
        return best == null ? -1 : best.id;
    }

    int chooseActiveId(List<LogicalDisplayInfo> displays, boolean preferSmallest) {
        LogicalDisplayInfo best = null;
        if (displays == null) return -1;
        for (LogicalDisplayInfo info : displays) {
            if (!info.isOnLike()) continue;
            if (best == null) {
                best = info;
            } else if (preferSmallest && info.area() < best.area()) {
                best = info;
            } else if (!preferSmallest && info.area() > best.area()) {
                best = info;
            }
        }
        return best == null ? -1 : best.id;
    }

    PowerResult requestOn(int displayId) {
        if (displayId < 0) return new PowerResult(false, "none", "invalid display id");
        if (!isPrivilegedReady()) {
            return new PowerResult(false, "none", "Shizuku permission required");
        }

        PowerResult binder = requestPowerByBinder(displayId, Display.STATE_ON);
        if (binder.ok) return binder;

        // Some OEM branches still retain the old power-on shell command.
        DeviceStateController.CommandResult fallback =
                shell.run("cmd display power-on " + displayId);
        if (fallback.ok) {
            return new PowerResult(true, fallback.backend,
                    "cmd display power-on " + displayId);
        }
        return new PowerResult(false, "shizuku-binder",
                binder.detail + " ; shell=" + fallback.output);
    }

    PowerResult resetPower(int displayId) {
        if (displayId < 0) return new PowerResult(false, "none", "invalid display id");
        if (!isPrivilegedReady()) {
            return new PowerResult(false, "none", "Shizuku permission required");
        }

        PowerResult binder = requestPowerByBinder(displayId, Display.STATE_UNKNOWN);
        if (binder.ok) return binder;

        DeviceStateController.CommandResult fallback =
                shell.run("cmd display power-reset " + displayId);
        if (fallback.ok) {
            return new PowerResult(true, fallback.backend,
                    "cmd display power-reset " + displayId);
        }
        return new PowerResult(false, "shizuku-binder",
                binder.detail + " ; reset-shell=" + fallback.output);
    }

    PowerResult forceBothOn(int outerId, int innerId) {
        if (outerId < 0 && innerId < 0) {
            return new PowerResult(false, "none", "no logical display ids");
        }
        PowerResult outer = outerId >= 0
                ? requestOn(outerId)
                : new PowerResult(true, "skip", "outer unknown");
        PowerResult inner = innerId >= 0
                ? requestOn(innerId)
                : new PowerResult(true, "skip", "inner unknown");
        boolean ok = outer.ok && inner.ok;
        return new PowerResult(ok,
                outer.ok ? outer.backend : inner.backend,
                "outer=" + outerId + ":" + (outer.ok ? "ON" : outer.detail)
                        + " ; inner=" + innerId + ":" + (inner.ok ? "ON" : inner.detail));
    }

    void resetKnown(int outerId, int innerId) {
        if (!isPrivilegedReady()) return;
        if (outerId >= 0) resetPower(outerId);
        if (innerId >= 0 && innerId != outerId) resetPower(innerId);
    }

    private synchronized PowerResult requestPowerByBinder(int displayId, int state) {
        try {
            ensureDisplayManager();
            if (displayManager == null) {
                return new PowerResult(false, "shizuku-binder", initError);
            }

            Object result;
            if (requestPowerInt != null) {
                result = requestPowerInt.invoke(displayManager, displayId, state);
            } else if (requestPowerBoolean != null) {
                // Older vendor API only supports explicit ON/OFF. It cannot express
                // reset, so use shell power-reset for STATE_UNKNOWN.
                if (state == Display.STATE_UNKNOWN) {
                    return new PowerResult(false, "shizuku-binder",
                            "boolean requestDisplayPower cannot reset");
                }
                result = requestPowerBoolean.invoke(displayManager,
                        displayId, state == Display.STATE_ON);
            } else {
                return new PowerResult(false, "shizuku-binder",
                        "requestDisplayPower method unavailable");
            }

            boolean ok = !(result instanceof Boolean) || (Boolean) result;
            return new PowerResult(ok, "shizuku-binder",
                    "requestDisplayPower(" + displayId + "," + state + ")=" + result);
        } catch (Throwable e) {
            return new PowerResult(false, "shizuku-binder",
                    e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private void ensureDisplayManager() throws Exception {
        if (displayManager != null || !initError.isEmpty()) return;
        try {
            IBinder raw = SystemServiceHelper.getSystemService("display");
            if (raw == null) throw new IllegalStateException("display service binder is null");
            IBinder wrapped = new ShizukuBinderWrapper(raw);
            Class<?> stub = Class.forName("android.hardware.display.IDisplayManager$Stub");
            Method asInterface = stub.getMethod("asInterface", IBinder.class);
            displayManager = asInterface.invoke(null, wrapped);
            if (displayManager == null) throw new IllegalStateException("IDisplayManager is null");

            for (Method method : displayManager.getClass().getMethods()) {
                if (!"requestDisplayPower".equals(method.getName())) continue;
                Class<?>[] p = method.getParameterTypes();
                if (p.length != 2 || p[0] != int.class) continue;
                method.setAccessible(true);
                if (p[1] == int.class) requestPowerInt = method;
                else if (p[1] == boolean.class) requestPowerBoolean = method;
            }
            if (requestPowerInt == null && requestPowerBoolean == null) {
                throw new NoSuchMethodException("requestDisplayPower(int, state)");
            }
        } catch (Exception e) {
            displayManager = null;
            requestPowerInt = null;
            requestPowerBoolean = null;
            initError = e.getClass().getSimpleName() + ": " + e.getMessage();
            throw e;
        }
    }

    private static List<LogicalDisplayInfo> parseDisplays(String text, boolean alreadyFiltered) {
        Map<Integer, LogicalDisplayInfo> unique = new LinkedHashMap<>();
        if (text == null || text.isEmpty()) return new ArrayList<>();

        String[] lines = text.split("\\r?\\n");
        for (String line : lines) {
            Matcher idMatcher = DISPLAY_ID.matcher(line);
            if (!idMatcher.find()) continue;

            String upper = line.toUpperCase(Locale.ROOT);
            boolean internal = alreadyFiltered
                    || upper.contains("TYPE INTERNAL")
                    || upper.contains("TYPE BUILT_IN");
            if (!internal) continue;

            int id = safeInt(idMatcher.group(1), -1);
            if (id < 0) continue;

            String name = match(DISPLAY_NAME, line);
            String state = match(DISPLAY_STATE, line);
            String uniqueId = match(UNIQUE_ID, line);
            int width = 0;
            int height = 0;
            Matcher size = REAL_SIZE.matcher(line);
            if (!size.find()) size = LOGICAL_SIZE.matcher(line);
            if (size.find(0)) {
                width = safeInt(size.group(1), 0);
                height = safeInt(size.group(2), 0);
            }

            unique.put(id, new LogicalDisplayInfo(id, name, state, uniqueId, width, height));
        }
        return new ArrayList<>(unique.values());
    }

    private static String match(Pattern p, String text) {
        Matcher m = p.matcher(text == null ? "" : text);
        return m.find() ? m.group(1) : "";
    }

    private static int safeInt(String value, int fallback) {
        try { return Integer.parseInt(value); }
        catch (Exception ignored) { return fallback; }
    }
}
