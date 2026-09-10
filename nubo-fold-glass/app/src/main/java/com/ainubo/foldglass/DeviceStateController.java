package com.ainubo.foldglass;

import android.content.pm.PackageManager;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import rikka.shizuku.Shizuku;
import rikka.shizuku.ShizukuRemoteProcess;

/**
 * Foldable DeviceState helper for NUBO Fold Glass v0.5.
 *
 * Important: HALF_OPENED/HALF_FOLDED does not imply that both physical panels
 * are powered. v0.5 therefore returns a ranked candidate list and lets the
 * service verify the result against the actually-active built-in displays.
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

    private static final Pattern STATE_PATTERN = Pattern.compile(
            "DeviceState\\{identifier=(\\d+),\\s*name='([^']*)'.*?\\}");
    private static final Pattern FLEX_STATE_PATTERN = Pattern.compile(
            "identifier\\s*[=:]\\s*(\\d+).*?name\\s*[=:]\\s*['\"]?([^,'\"}\\]]+)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern SIMPLE_LINE_PATTERN = Pattern.compile(
            "(?m)^\\s*(\\d+)\\s*[:=]\\s*([A-Za-z][A-Za-z0-9_ \\-]{1,80})\\s*$");
    private static final Pattern INT_PATTERN = Pattern.compile("-?\\d+");

    int getCurrentState() {
        CommandResult result = run("cmd device_state print-state");
        if (!result.ok) return -1;
        Matcher matcher = INT_PATTERN.matcher(result.output);
        return matcher.find() ? safeInt(matcher.group(), -1) : -1;
    }

    List<StateInfo> getSupportedStates() {
        CommandResult result = run("cmd device_state print-states");
        Map<Integer, StateInfo> unique = new LinkedHashMap<>();
        if (!result.ok) return new ArrayList<>();

        Matcher matcher = STATE_PATTERN.matcher(result.output);
        while (matcher.find()) {
            int id = safeInt(matcher.group(1), -1);
            if (id >= 0) unique.put(id, new StateInfo(id, matcher.group(2)));
        }

        if (unique.isEmpty()) {
            matcher = FLEX_STATE_PATTERN.matcher(result.output);
            while (matcher.find()) {
                int id = safeInt(matcher.group(1), -1);
                if (id >= 0) unique.put(id, new StateInfo(id, matcher.group(2)));
            }
        }

        if (unique.isEmpty()) {
            matcher = SIMPLE_LINE_PATTERN.matcher(result.output);
            while (matcher.find()) {
                int id = safeInt(matcher.group(1), -1);
                if (id >= 0) unique.put(id, new StateInfo(id, matcher.group(2)));
            }
        }

        return new ArrayList<>(unique.values());
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
     * Returns all safe transition candidates ordered from most likely to least
     * likely. The caller MUST verify that both built-in displays are actually ON.
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

    StateInfo guessTransitionState() {
        List<StateInfo> candidates = getTransitionCandidates(-1, -1);
        return candidates.isEmpty() ? null : candidates.get(0);
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

    private static int score(String name) {
        String n = name == null ? "" : name.toUpperCase(Locale.ROOT);
        int score = 50;
        if (n.contains("CONCURRENT")) score += 1200;
        if (n.contains("DUAL_DISPLAY") || n.contains("DUAL DISPLAY")) score += 1150;
        else if (n.contains("DUAL")) score += 1000;
        if (n.contains("BOTH")) score += 900;
        if (n.contains("TWO_DISPLAY") || n.contains("TWO DISPLAY")) score += 850;
        if (n.contains("MULTI_DISPLAY") || n.contains("MULTI DISPLAY")) score += 800;
        if (n.contains("HALF_FOLDED") || n.contains("HALF FOLDED")) score += 500;
        else if (n.contains("HALF")) score += 400;
        if (n.contains("TABLETOP")) score += 350;
        if (n.contains("TENT")) score += 250;
        if (n.contains("REAR") && !n.contains("DUAL") && !n.contains("CONCURRENT")) score += 100;
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
                && !low.contains("not allowed")
                && !low.contains("error:");
    }

    private static int safeInt(String value, int fallback) {
        try { return Integer.parseInt(value); }
        catch (Exception ignored) { return fallback; }
    }
}
