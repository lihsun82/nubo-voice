package com.ainubo.foldglass;

final class AngleMapper {
    private AngleMapper() {}

    static float toGlassLevel(float rawAngleDegrees) {
        if (Float.isNaN(rawAngleDegrees) || Float.isInfinite(rawAngleDegrees)) {
            return 0f;
        }

        float angle = rawAngleDegrees % 360f;
        if (angle < 0f) angle += 360f;
        if (angle > 180f) angle = 360f - angle;

        final float center = 90f;
        final float radius = 65f;
        float distance = Math.abs(angle - center);
        if (distance >= radius) return 0f;

        float x = 1f - (distance / radius);
        return x * x * (3f - 2f * x);
    }
}
