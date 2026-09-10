package com.ainubo.foldglass;

import android.content.pm.PackageManager;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import rikka.shizuku.Shizuku;
import rikka.shizuku.ShizukuRemoteProcess;

/**
 * Foldable DeviceState helper.
 *
 * v0.4 intentionally does NOT force CLOSED/FOLDED during the transition.
 * It looks for a dual/concurrent/half-fold state so the cover and inner panel
 * can coexist while the hinge is between the two endpoints. Normal shell is
 * attempted first; Shizuku is an optional privilege fallback.
 */
final class DeviceStateController {
    static final class StateInfo {
        final int id;
        final String name;

        StateInfo(int id, String name) {
            this.id = id;
            this.name = name == null ? "" : name;
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

    private static final Pattern STATE_PATTERN = Pattern.compile(
            "DeviceState\\{identifier=(\\d+), name='([^']*)'.*?\\}");
    private static final Pattern INT_PATTERN = Pattern.compile("-?\\d+");

    int getCurrentState() {
        CommandResult result = run("cmd device_state print-state");
        if (!result.ok) return -1;
        Matcher matcher = INT_PATTERN.matcher(result.output);
        return matcher.find() ? safeInt(matcher.group(), -1) : -1;
    }

    List<StateInfo> getSupportedStates() {
        CommandResult result = run("cmd device_state print-states");
        List<StateInfo> states = new ArrayList<>();
        if (!result.ok) return states;
        Matcher matcher = STATE_PATTERN.matcher(result.output);
        while (matcher.find()) {
            states.add(new StateInfo(safeInt(matcher.group(1), -1), matcher.group(2)));
        }
        return states;
    }

    boolean isAvailable() {
        return getCurrentState() >= 0 && !getSupportedStates().isEmpty();
    }

    boolean isShizukuRunning() {
        try { return Shizuku.pingBinder(); } catch (Throwable ignored) { return false; }
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
        return run("cmd device_state state " + stateId);
    }

    CommandResult resetState() {
        return run("cmd device_state state reset");
    }

    /**
     * Prefer explicit dual/concurrent states. HALF_FOLDED is the next safest
     * candidate because some OEMs expose the two-panel transition under that
     * name. Never select CLOSED/FOLDED/OPEN as a transition target.
     */
    StateInfo guessTransitionState() {
        List<StateInfo> states = getSupportedStates();
        StateInfo best = null;
        int bestScore = 0;
        for (StateInfo state : states) {
            String n = state.name.toUpperCase(Locale.ROOT);
            int score = 0;
            if (n.contains("DUAL_DISPLAY")) score += 500;
            if (n.contains("DUAL DISPLAY")) score += 500;
            if (n.contains("DUAL")) score += 420;
            if (n.contains("CONCURRENT")) score += 420;
            if (n.contains("TWO_DISPLAY")) score += 380;
            if (n.contains("TWO DISPLAY")) score += 380;
            if (n.contains("HALF_FOLDED")) score += 260;
            if (n.contains("HALF FOLDED")) score += 260;
            if (n.contains("HALF")) score += 180;
            if (n.contains("TABLETOP")) score += 120;
            if (n.contains("TENT")) score += 80;

            if (n.contains("CLOSED") || n.equals("FOLDED") || n.contains("COVER_ONLY")) score -= 600;
            if (n.equals("OPEN") || n.contains("UNFOLDED")) score -= 500;
            if (n.contains("REAR") && !n.contains("DUAL")) score -= 180;

            if (score > bestScore) {
                bestScore = score;
                best = state;
            }
        }
        return bestScore >= 100 ? best : null;
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
        CommandResult normal = runNormal(command);
        if (normal.ok) return normal;
        if (hasShizukuPermission()) {
            CommandResult elevated = runShizuku(command);
            if (elevated.ok) return elevated;
            return new CommandResult(false,
                    "normal=" + normal.output + " ; shizuku=" + elevated.output,
                    "shizuku");
        }
        return normal;
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
                && !low.contains("error:");
    }

    private static int safeInt(String value, int fallback) {
        try { return Integer.parseInt(value); }
        catch (Exception ignored) { return fallback; }
    }
}
