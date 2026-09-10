package com.ainubo.foldglass;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Thin wrapper around Android's device_state shell service.
 *
 * Several foldables expose "cmd device_state" to normal apps. On devices that
 * reject it, callers can detect the failure and fall back to stock display
 * switching. The implementation is intentionally isolated so a Shizuku path
 * can be added later without touching the fold state machine.
 */
final class DeviceStateController {
    static final class StateInfo {
        final int id;
        final String name;

        StateInfo(int id, String name) {
            this.id = id;
            this.name = name == null ? "" : name;
        }

        @Override
        public String toString() {
            return id + ":" + name;
        }
    }

    static final class CommandResult {
        final boolean ok;
        final String output;

        CommandResult(boolean ok, String output) {
            this.ok = ok;
            this.output = output == null ? "" : output.trim();
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
            states.add(new StateInfo(
                    safeInt(matcher.group(1), -1),
                    matcher.group(2)));
        }
        return states;
    }

    boolean isAvailable() {
        return getCurrentState() >= 0 && !getSupportedStates().isEmpty();
    }

    CommandResult requestState(int stateId) {
        if (stateId < 0) return new CommandResult(false, "invalid state id");
        return run("cmd device_state state " + stateId);
    }

    CommandResult resetState() {
        return run("cmd device_state state reset");
    }

    int guessClosedState() {
        List<StateInfo> states = getSupportedStates();
        int bestId = -1;
        int bestScore = Integer.MIN_VALUE;

        for (StateInfo state : states) {
            String name = state.name.toUpperCase(Locale.ROOT);
            int score = 0;

            if (name.equals("CLOSED")) score += 200;
            if (name.equals("FOLDED")) score += 180;
            if (name.contains("CLOSED")) score += 120;
            if (name.contains("FOLDED")) score += 100;
            if (name.contains("CLOSE")) score += 70;
            if (name.contains("FOLD")) score += 40;

            if (name.contains("HALF")) score -= 120;
            if (name.contains("OPEN")) score -= 120;
            if (name.contains("TENT")) score -= 80;
            if (name.contains("REAR")) score -= 80;
            if (name.contains("DUAL")) score -= 80;
            if (name.contains("FLIPPED")) score -= 70;

            if (score > bestScore) {
                bestScore = score;
                bestId = state.id;
            }
        }
        return bestScore > 0 ? bestId : -1;
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

    private CommandResult run(String command) {
        StringBuilder stdout = new StringBuilder();
        StringBuilder stderr = new StringBuilder();
        Process process = null;
        try {
            process = new ProcessBuilder("sh", "-c", command).start();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
                 BufferedReader err = new BufferedReader(new InputStreamReader(process.getErrorStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    stdout.append(line).append('\n');
                }
                while ((line = err.readLine()) != null) {
                    stderr.append(line).append('\n');
                }
            }
            int exitCode = process.waitFor();
            String combined = stdout.toString();
            if (stderr.length() > 0) combined += stderr;
            boolean ok = exitCode == 0
                    && !combined.toLowerCase(Locale.ROOT).contains("permission denied")
                    && !combined.toLowerCase(Locale.ROOT).contains("security exception")
                    && !combined.toLowerCase(Locale.ROOT).contains("error:");
            return new CommandResult(ok, combined);
        } catch (Exception e) {
            return new CommandResult(false, e.getClass().getSimpleName() + ": " + e.getMessage());
        } finally {
            if (process != null) process.destroy();
        }
    }

    private static int safeInt(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (Exception ignored) {
            return fallback;
        }
    }
}
