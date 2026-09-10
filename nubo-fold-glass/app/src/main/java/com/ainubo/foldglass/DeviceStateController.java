package com.ainubo.foldglass;

import android.content.pm.PackageManager;
import android.os.Binder;
import android.os.IBinder;
import android.os.IInterface;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.reflect.Array;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import rikka.shizuku.Shizuku;
import rikka.shizuku.ShizukuBinderWrapper;
import rikka.shizuku.ShizukuRemoteProcess;
import rikka.shizuku.SystemServiceHelper;

/**
 * OPPO Find N6 DeviceState / physical display bridge for NUBO Fold Glass v0.6.
 *
 * v0.6 deliberately separates three different concepts:
 *  1) hinge posture (HALF_OPENED etc),
 *  2) logical Displays visible to an ordinary app,
 *  3) physical INTERNAL display devices reported by DisplayManagerService.
 *
 * Only #3 is accepted as proof that both real panels are powered during the
 * hand-off. Shizuku is preferred when available. A binder-level device_state
 * fallback is included for OEM builds where cmd device_state is incomplete.
 */
final class DeviceStateController {
    static final class StateInfo {
        final int id;
        final String name;

        StateInfo(int id, String name) {
            this.id = id;
            this.name = name == null ? "" : name.trim();
        }

        @Override public String toString() {
            return id + ":" + name;
        }
    }

    static final class CommandResult {
        final boolean ok;
        final String output;
        final String backend;

        CommandResult(boolean ok, String output, String backend) {
            this.ok = ok;
            this.output = output == null ? "" : output.trim();
            this.backend = backend == null ? "none" : backend;
        }
    }

    static final class PanelSnapshot {
        final int totalInternalPanels;
        final int activeInternalPanels;
        final boolean reliable;
        final String summary;
        final String backend;

        PanelSnapshot(int totalInternalPanels,
                      int activeInternalPanels,
                      boolean reliable,
                      String summary,
                      String backend) {
            this.totalInternalPanels = totalInternalPanels;
            this.activeInternalPanels = activeInternalPanels;
            this.reliable = reliable;
            this.summary = summary == null ? "" : summary;
            this.backend = backend == null ? "none" : backend;
        }

        boolean bothOn() {
            return activeInternalPanels >= 2;
        }
    }

    private static final Pattern STATE_PATTERN = Pattern.compile(
            "DeviceState\\{identifier=(\\d+),\\s*name='([^']*)'.*?\\}");
    private static final Pattern FLEX_STATE_PATTERN = Pattern.compile(
            "identifier\\s*[=:]\\s*(\\d+).*?name\\s*[=:]\\s*['\"]?([^,'\"}\\]]+)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern SIMPLE_LINE_PATTERN = Pattern.compile(
            "(?m)^\\s*(\\d+)\\s*[:=]\\s*([A-Za-z][A-Za-z0-9_ \\-]{1,80})\\s*$");
    private static final Pattern INT_PATTERN = Pattern.compile("-?\\d+");
    private static final Pattern DISPLAY_DEVICE_LINE = Pattern.compile(
            "(?m)^.*DisplayDeviceInfo\\{([^\\n]*)$");
    private static final Pattern UNIQUE_ID_PATTERN = Pattern.compile(
            "uniqueId\\s*(?:=|\\s)\\s*[\"']?([^,\"'\\s}]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern REAL_SIZE_PATTERN = Pattern.compile(
            "(?:real|width)[ =](\\d+).*?(?:x|height[ =])(\\d+)", Pattern.CASE_INSENSITIVE);

    private HiddenDeviceStateBridge hiddenBridge;

    int getCurrentState() {
        CommandResult result = runPreferPrivileged("cmd device_state print-state");
        if (result.ok) {
            Matcher matcher = INT_PATTERN.matcher(result.output);
            if (matcher.find()) return safeInt(matcher.group(), -1);
        }
        HiddenDeviceStateBridge bridge = getHiddenBridge();
        return bridge == null ? -1 : bridge.getCurrentState();
    }

    List<StateInfo> getSupportedStates() {
        Map<Integer, StateInfo> unique = new LinkedHashMap<>();

        CommandResult result = runPreferPrivileged("cmd device_state print-states");
        parseStates(result.output, unique);

        // Some OEMs return exit code 0 but hide names/states from cmd. Ask the
        // binder service through Shizuku as the authoritative fallback.
        if (unique.isEmpty()) {
            HiddenDeviceStateBridge bridge = getHiddenBridge();
            if (bridge != null) {
                for (StateInfo state : bridge.getSupportedStates()) {
                    unique.put(state.id, state);
                }
            }
        }

        return new ArrayList<>(unique.values());
    }

    boolean isAvailable() {
        return getCurrentState() >= 0 && !getSupportedStates().isEmpty();
    }

    boolean isShizukuRunning() {
        try { return Shizuku.pingBinder(); }
        catch (Throwable ignored) { return false; }
    }

    boolean hasShizukuPermission() {
        try {
            return Shizuku.pingBinder()
                    && Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED;
        } catch (Throwable ignored) {
            return false;
        }
    }

    CommandResult requestState(int stateId) {
        if (stateId < 0) return new CommandResult(false, "invalid state id", "none");

        CommandResult shell = runPreferPrivileged("cmd device_state state " + stateId);
        if (shell.ok) return shell;

        HiddenDeviceStateBridge bridge = getHiddenBridge();
        if (bridge != null && bridge.requestState(stateId)) {
            return new CommandResult(true, "binder requestState(" + stateId + ")", "shizuku-binder");
        }
        return shell;
    }

    CommandResult resetState() {
        CommandResult shell = runPreferPrivileged("cmd device_state state reset");
        if (shell.ok) return shell;

        HiddenDeviceStateBridge bridge = getHiddenBridge();
        if (bridge != null && bridge.cancelStateRequest()) {
            return new CommandResult(true, "binder cancelStateRequest", "shizuku-binder");
        }
        return shell;
    }

    /**
     * System-level proof of panel power. We parse physical DisplayDeviceInfo
     * records from dumpsys display instead of relying on the app-visible
     * DisplayManager list. This is important on ColorOS where a physical panel
     * may be hidden from ordinary apps during a fold transition.
     */
    PanelSnapshot getPhysicalPanelSnapshot() {
        CommandResult result = runPreferPrivileged("dumpsys display");
        if (!result.ok || result.output.isEmpty()) {
            return new PanelSnapshot(0, 0, false,
                    "dumpsys display unavailable: " + result.output,
                    result.backend);
        }

        Set<String> total = new LinkedHashSet<>();
        Set<String> on = new LinkedHashSet<>();
        List<String> details = new ArrayList<>();

        Matcher matcher = DISPLAY_DEVICE_LINE.matcher(result.output);
        while (matcher.find()) {
            String info = matcher.group(1);
            if (!isInternalDisplayInfo(info)) continue;

            String key = extractUniqueId(info);
            if (key.isEmpty()) key = "panel-" + Integer.toHexString(info.hashCode());
            total.add(key);

            String state = extractDisplayState(info);
            if ("ON".equals(state)) on.add(key);
            details.add(shortPanel(key) + "=" + (state.isEmpty() ? "?" : state));
        }

        // Vendor dumps occasionally omit the DisplayDeviceInfo prefix but keep
        // DisplayInfo entries with type INTERNAL. Use them only as a fallback,
        // because logical entries can otherwise duplicate physical devices.
        if (total.isEmpty()) {
            Pattern fallback = Pattern.compile("(?m)^.*DisplayInfo\\{([^\\n]*)$");
            Matcher f = fallback.matcher(result.output);
            while (f.find()) {
                String info = f.group(1);
                if (!isInternalDisplayInfo(info)) continue;
                String key = extractUniqueId(info);
                if (key.isEmpty()) key = "logical-" + Integer.toHexString(info.hashCode());
                total.add(key);
                String state = extractDisplayState(info);
                if ("ON".equals(state)) on.add(key);
                details.add(shortPanel(key) + "=" + (state.isEmpty() ? "?" : state));
            }
        }

        boolean reliable = !total.isEmpty();
        String summary = "physical INTERNAL ON " + on.size() + "/" + total.size();
        if (!details.isEmpty()) summary += " [" + join(details, ", ") + "]";
        return new PanelSnapshot(total.size(), on.size(), reliable, summary, result.backend);
    }

    /**
     * Returns all non-endpoint states. Names only influence ordering; the caller
     * must prove a candidate by observing two physical INTERNAL panels ON.
     */
    List<StateInfo> getTransitionCandidates(int closedStateId, int openStateId) {
        List<StateInfo> states = getSupportedStates();
        List<StateInfo> candidates = new ArrayList<>();
        for (StateInfo state : states) {
            if (state.id < 0) continue;
            if (state.id == closedStateId || state.id == openStateId) continue;
            if (isDefiniteEndpointName(state.name)) continue;
            candidates.add(state);
        }
        Collections.sort(candidates, new Comparator<StateInfo>() {
            @Override public int compare(StateInfo a, StateInfo b) {
                int scoreCompare = Integer.compare(score(b.name), score(a.name));
                return scoreCompare != 0 ? scoreCompare : Integer.compare(a.id, b.id);
            }
        });
        return candidates;
    }

    String describeStates() {
        List<StateInfo> states = getSupportedStates();
        if (states.isEmpty()) return "無法讀取 device_state";
        StringBuilder out = new StringBuilder();
        for (StateInfo state : states) {
            if (out.length() > 0) out.append(" | ");
            out.append(state.id).append(":").append(state.name);
        }
        return out.toString();
    }

    CommandResult run(String command) {
        return runPreferPrivileged(command);
    }

    private CommandResult runPreferPrivileged(String command) {
        if (hasShizukuPermission()) {
            CommandResult elevated = runShizuku(command);
            if (elevated.ok) return elevated;
            CommandResult normal = runNormal(command);
            if (normal.ok) return normal;
            return new CommandResult(false,
                    "shizuku=" + elevated.output + " ; normal=" + normal.output,
                    "shizuku+app-shell");
        }
        return runNormal(command);
    }

    private void parseStates(String input, Map<Integer, StateInfo> unique) {
        if (input == null || input.isEmpty()) return;
        Matcher matcher = STATE_PATTERN.matcher(input);
        while (matcher.find()) {
            int id = safeInt(matcher.group(1), -1);
            if (id >= 0) unique.put(id, new StateInfo(id, matcher.group(2)));
        }
        if (!unique.isEmpty()) return;

        matcher = FLEX_STATE_PATTERN.matcher(input);
        while (matcher.find()) {
            int id = safeInt(matcher.group(1), -1);
            if (id >= 0) unique.put(id, new StateInfo(id, matcher.group(2)));
        }
        if (!unique.isEmpty()) return;

        matcher = SIMPLE_LINE_PATTERN.matcher(input);
        while (matcher.find()) {
            int id = safeInt(matcher.group(1), -1);
            if (id >= 0) unique.put(id, new StateInfo(id, matcher.group(2)));
        }
    }

    private static int score(String name) {
        String n = name == null ? "" : name.toUpperCase(Locale.ROOT);
        int score = 50;
        if (n.contains("CONCURRENT")) score += 2000;
        if (n.contains("DUAL_DISPLAY") || n.contains("DUAL DISPLAY")) score += 1900;
        else if (n.contains("DUAL")) score += 1700;
        if (n.contains("BOTH")) score += 1500;
        if (n.contains("TWO_DISPLAY") || n.contains("TWO DISPLAY")) score += 1400;
        if (n.contains("MULTI_DISPLAY") || n.contains("MULTI DISPLAY")) score += 1300;
        if (n.contains("REAR_DISPLAY_OUTER_DEFAULT")) score += 900;
        if (n.contains("HALF_FOLDED") || n.contains("HALF FOLDED")) score += 350;
        else if (n.contains("HALF")) score += 250;
        if (n.contains("TABLETOP")) score += 180;
        if (n.contains("TENT")) score += 120;
        // Hidden OEM states must still be tested even without a meaningful name.
        if (n.startsWith("HIDDEN_")) score += 80;
        return score;
    }

    private static boolean isDefiniteEndpointName(String name) {
        String n = name == null ? "" : name.trim().toUpperCase(Locale.ROOT);
        if (n.isEmpty()) return false;
        if (n.equals("CLOSED") || n.equals("FOLDED") || n.equals("OPEN")
                || n.equals("OPENED") || n.equals("UNFOLDED") || n.equals("FLAT")) return true;
        if (n.contains("CLOSED") || n.contains("COVER_ONLY")) return true;
        if ((n.contains("OPENED") || n.contains("UNFOLDED")) && !n.contains("HALF")) return true;
        return false;
    }

    private static boolean isInternalDisplayInfo(String info) {
        String u = info == null ? "" : info.toUpperCase(Locale.ROOT);
        return u.contains("TYPE INTERNAL")
                || u.contains("TYPE=INTERNAL")
                || u.contains("TYPE BUILT_IN")
                || u.contains("TYPE=BUILT_IN")
                || u.contains("TYPE=DISPLAY_TYPE_BUILT_IN")
                || u.contains("TYPE=TYPE_BUILT_IN")
                || u.contains("UNIQUEID \"LOCAL:")
                || u.contains("UNIQUEID=\"LOCAL:");
    }

    private static String extractUniqueId(String info) {
        Matcher m = UNIQUE_ID_PATTERN.matcher(info == null ? "" : info);
        if (m.find()) return m.group(1);

        Matcher size = REAL_SIZE_PATTERN.matcher(info == null ? "" : info);
        if (size.find()) return "size:" + size.group(1) + "x" + size.group(2);
        return "";
    }

    private static String extractDisplayState(String info) {
        String u = info == null ? "" : info.toUpperCase(Locale.ROOT);
        Pattern p = Pattern.compile("\\bSTATE\\s*(?:=|\\s)\\s*(ON_SUSPEND|DOZE_SUSPEND|DOZE|ON|OFF|UNKNOWN|VR)\\b");
        Matcher m = p.matcher(u);
        return m.find() ? m.group(1) : "";
    }

    private static String shortPanel(String key) {
        if (key == null) return "?";
        return key.length() <= 18 ? key : key.substring(0, 18) + "…";
    }

    private static String join(List<String> values, String delimiter) {
        StringBuilder out = new StringBuilder();
        for (String value : values) {
            if (out.length() > 0) out.append(delimiter);
            out.append(value);
        }
        return out.toString();
    }

    private CommandResult runNormal(String command) {
        Process process = null;
        try {
            process = new ProcessBuilder("sh", "-c", command).start();
            String stdout = readAll(process.getInputStream());
            String stderr = readAll(process.getErrorStream());
            int exitCode = process.waitFor();
            String combined = (stdout + (stderr.isEmpty() ? "" : "\n" + stderr)).trim();
            return new CommandResult(isSuccess(exitCode, combined), combined, "app-shell");
        } catch (Exception e) {
            return new CommandResult(false, e.getClass().getSimpleName() + ": " + e.getMessage(), "app-shell");
        } finally {
            if (process != null) process.destroy();
        }
    }

    @SuppressWarnings("deprecation")
    private CommandResult runShizuku(String command) {
        ShizukuRemoteProcess process = null;
        try {
            Method method = Shizuku.class.getDeclaredMethod(
                    "newProcess", String[].class, String[].class, String.class);
            method.setAccessible(true);
            Object obj = method.invoke(null,
                    (Object) new String[]{"sh", "-c", command},
                    null,
                    null);
            if (!(obj instanceof ShizukuRemoteProcess)) {
                return new CommandResult(false, "Shizuku process unavailable", "shizuku");
            }
            process = (ShizukuRemoteProcess) obj;
            String stdout = readAll(process.getInputStream());
            String stderr = readAll(process.getErrorStream());
            int exitCode = process.waitFor();
            String combined = (stdout + (stderr.isEmpty() ? "" : "\n" + stderr)).trim();
            return new CommandResult(isSuccess(exitCode, combined), combined, "shizuku");
        } catch (Throwable e) {
            return new CommandResult(false, e.getClass().getSimpleName() + ": " + e.getMessage(), "shizuku");
        } finally {
            if (process != null) process.destroy();
        }
    }

    private HiddenDeviceStateBridge getHiddenBridge() {
        if (!hasShizukuPermission()) return null;
        if (hiddenBridge != null && hiddenBridge.available) return hiddenBridge;
        try {
            hiddenBridge = new HiddenDeviceStateBridge();
            return hiddenBridge.available ? hiddenBridge : null;
        } catch (Throwable ignored) {
            hiddenBridge = null;
            return null;
        }
    }

    /** Binder fallback based on Android's device_state system service. */
    private static final class HiddenDeviceStateBridge {
        final boolean available;
        private final IInterface manager;
        private final Class<?> managerClass;
        private IBinder requestToken;

        HiddenDeviceStateBridge() throws Exception {
            IBinder raw = SystemServiceHelper.getSystemService("device_state");
            if (raw == null) throw new IllegalStateException("device_state binder missing");
            IBinder wrapped = new ShizukuBinderWrapper(raw);
            Class<?> stub = Class.forName("android.hardware.devicestate.IDeviceStateManager$Stub");
            Method asInterface = stub.getMethod("asInterface", IBinder.class);
            manager = (IInterface) asInterface.invoke(null, wrapped);
            if (manager == null) throw new IllegalStateException("device_state interface missing");
            managerClass = manager.getClass();
            available = true;
        }

        int getCurrentState() {
            try {
                Object info = invokeNoArg(manager, managerClass, "getDeviceStateInfo");
                Object current = readMember(info, "getCurrentState", "currentState");
                return extractStateId(current, -1);
            } catch (Throwable ignored) {
                return -1;
            }
        }

        List<StateInfo> getSupportedStates() {
            List<StateInfo> out = new ArrayList<>();
            try {
                Object info = invokeNoArg(manager, managerClass, "getDeviceStateInfo");
                Object supported = readMember(info, "getSupportedStates", "supportedStates");
                if (supported == null) return out;

                if (supported instanceof int[]) {
                    for (int id : (int[]) supported) out.add(new StateInfo(id, "HIDDEN_" + id));
                } else if (supported instanceof Iterable) {
                    for (Object item : (Iterable<?>) supported) addState(out, item);
                } else if (supported.getClass().isArray()) {
                    int n = Array.getLength(supported);
                    for (int i = 0; i < n; i++) addState(out, Array.get(supported, i));
                }
            } catch (Throwable ignored) {}
            return out;
        }

        boolean requestState(int stateId) {
            try {
                Method target = findMethod(managerClass, "requestState", 3);
                if (target == null) return false;
                requestToken = new Binder();
                Class<?>[] types = target.getParameterTypes();
                Object stateArg = numericArg(types[1], stateId);
                Object flagsArg = numericArg(types[2], 0);
                target.invoke(manager, requestToken, stateArg, flagsArg);
                return true;
            } catch (Throwable ignored) {
                return false;
            }
        }

        boolean cancelStateRequest() {
            try {
                Method target = findMethod(managerClass, "cancelStateRequest", 0);
                if (target == null) return false;
                target.invoke(manager);
                requestToken = null;
                return true;
            } catch (Throwable ignored) {
                return false;
            }
        }

        private static void addState(List<StateInfo> out, Object item) {
            int id = extractStateId(item, -1);
            if (id < 0) return;
            String name = extractStateName(item, "HIDDEN_" + id);
            out.add(new StateInfo(id, name));
        }

        private static int extractStateId(Object state, int fallback) {
            if (state == null) return fallback;
            if (state instanceof Number) return ((Number) state).intValue();
            try {
                Method m = state.getClass().getMethod("getIdentifier");
                Object value = m.invoke(state);
                if (value instanceof Number) return ((Number) value).intValue();
            } catch (Throwable ignored) {}
            try {
                Field f = state.getClass().getDeclaredField("identifier");
                f.setAccessible(true);
                Object value = f.get(state);
                if (value instanceof Number) return ((Number) value).intValue();
            } catch (Throwable ignored) {}
            return fallback;
        }

        private static String extractStateName(Object state, String fallback) {
            if (state == null) return fallback;
            try {
                Method m = state.getClass().getMethod("getName");
                Object value = m.invoke(state);
                if (value != null && !value.toString().trim().isEmpty()) return value.toString();
            } catch (Throwable ignored) {}
            try {
                Field f = state.getClass().getDeclaredField("name");
                f.setAccessible(true);
                Object value = f.get(state);
                if (value != null && !value.toString().trim().isEmpty()) return value.toString();
            } catch (Throwable ignored) {}
            return fallback;
        }

        private static Object readMember(Object object, String methodName, String fieldName) throws Exception {
            if (object == null) return null;
            try {
                Method m = object.getClass().getMethod(methodName);
                return m.invoke(object);
            } catch (NoSuchMethodException ignored) {
                Field f = object.getClass().getDeclaredField(fieldName);
                f.setAccessible(true);
                return f.get(object);
            }
        }

        private static Object invokeNoArg(Object object, Class<?> cls, String methodName) throws Exception {
            Method m = cls.getMethod(methodName);
            return m.invoke(object);
        }

        private static Method findMethod(Class<?> cls, String name, int parameterCount) {
            for (Method m : cls.getMethods()) {
                if (m.getName().equals(name) && m.getParameterTypes().length == parameterCount) {
                    m.setAccessible(true);
                    return m;
                }
            }
            return null;
        }

        private static Object numericArg(Class<?> type, int value) {
            if (type == long.class || type == Long.class) return (long) value;
            if (type == short.class || type == Short.class) return (short) value;
            if (type == byte.class || type == Byte.class) return (byte) value;
            return value;
        }
    }

    private static String readAll(java.io.InputStream stream) throws Exception {
        StringBuilder out = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream))) {
            String line;
            while ((line = reader.readLine()) != null) out.append(line).append('\n');
        }
        return out.toString().trim();
    }

    private static boolean isSuccess(int exitCode, String text) {
        String low = text == null ? "" : text.toLowerCase(Locale.ROOT);
        return exitCode == 0
                && !low.contains("permission denied")
                && !low.contains("security exception")
                && !low.contains("not allowed")
                && !low.contains("error:");
    }

    private static int safeInt(String value, int fallback) {
        try { return Integer.parseInt(value); }
        catch (Exception ignored) { return fallback; }
    }
}
