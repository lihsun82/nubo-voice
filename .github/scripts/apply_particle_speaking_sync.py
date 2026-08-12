from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"pattern not found: {label}")
    return text.replace(old, new, 1)

# 1) PCM playback lifecycle -> visual speaking event.
audio_path = Path("lib/browser-audio.ts")
audio = audio_path.read_text(encoding="utf-8-sig")

audio = replace_once(
    audio,
    '''function dispatchVoiceLevel(level: number) {\n  if (typeof window === "undefined") return;\n  window.dispatchEvent(\n    new CustomEvent("nubo:voice-level", {\n      detail: { level: Math.max(0, Math.min(1, level)) },\n    }),\n  );\n}\n''',
    '''function dispatchVoiceLevel(level: number) {\n  if (typeof window === "undefined") return;\n  window.dispatchEvent(\n    new CustomEvent("nubo:voice-level", {\n      detail: { level: Math.max(0, Math.min(1, level)) },\n    }),\n  );\n}\n\nfunction dispatchPlaybackState(active: boolean) {\n  if (typeof window === "undefined") return;\n  window.dispatchEvent(\n    new CustomEvent("nubo:audio-playback-state", {\n      detail: { active },\n    }),\n  );\n}\n''',
    "dispatch playback state helper",
)

audio = replace_once(
    audio,
    '''  private readonly scheduleLeadSeconds = 0.08;\n  private foregroundListenersAttached = false;\n  private retired = false;\n''',
    '''  private readonly scheduleLeadSeconds = 0.08;\n  private foregroundListenersAttached = false;\n  private retired = false;\n  private playbackActive = false;\n  private playbackTailTimer: number | null = null;\n''',
    "playback state fields",
)

audio = replace_once(
    audio,
    '''  constructor() {\n    this.claimExclusiveOutput();\n  }\n\n  private claimExclusiveOutput() {\n''',
    '''  constructor() {\n    this.claimExclusiveOutput();\n  }\n\n  private setPlaybackActive(active: boolean) {\n    if (this.playbackActive === active) return;\n    this.playbackActive = active;\n    dispatchPlaybackState(active);\n  }\n\n  private clearPlaybackTailTimer() {\n    if (this.playbackTailTimer === null) return;\n    window.clearTimeout(this.playbackTailTimer);\n    this.playbackTailTimer = null;\n  }\n\n  private claimExclusiveOutput() {\n''',
    "playback state methods",
)

audio = replace_once(
    audio,
    '''    source.start(startAt);\n    this.nextStart = startAt + audioBuffer.duration;\n    this.sources.add(source);\n    source.onended = () => {\n      this.sources.delete(source);\n      if (this.sources.size === 0 && this.nextStart <= context.currentTime + 0.02) {\n        dispatchVoiceLevel(0);\n      }\n    };\n''',
    '''    source.start(startAt);\n    this.nextStart = startAt + audioBuffer.duration;\n    this.clearPlaybackTailTimer();\n    this.sources.add(source);\n    this.setPlaybackActive(true);\n    source.onended = () => {\n      this.sources.delete(source);\n      if (this.sources.size === 0 && this.nextStart <= context.currentTime + 0.02) {\n        dispatchVoiceLevel(0);\n        this.clearPlaybackTailTimer();\n        this.playbackTailTimer = window.setTimeout(() => {\n          this.playbackTailTimer = null;\n          if (\n            !this.retired &&\n            this.sources.size === 0 &&\n            this.nextStart <= context.currentTime + 0.04\n          ) {\n            this.setPlaybackActive(false);\n          }\n        }, 180);\n      }\n    };\n''',
    "enqueue lifecycle",
)

audio = replace_once(
    audio,
    '''  interrupt() {\n    for (const source of this.sources) {\n''',
    '''  interrupt() {\n    this.clearPlaybackTailTimer();\n    for (const source of this.sources) {\n''',
    "interrupt clear tail",
)

audio = replace_once(
    audio,
    '''    this.sources.clear();\n    this.nextStart = this.context?.currentTime ?? 0;\n    dispatchVoiceLevel(0);\n  }\n''',
    '''    this.sources.clear();\n    this.nextStart = this.context?.currentTime ?? 0;\n    dispatchVoiceLevel(0);\n    this.setPlaybackActive(false);\n  }\n''',
    "interrupt playback inactive",
)

audio_path.write_text(audio, encoding="utf-8")

# 2) Hologram visual: +40% face molecules and exact audio-playback speaking sync.
orb_path = Path("components/NuboEnergyOrb.tsx")
orb = orb_path.read_text(encoding="utf-8-sig")

orb = replace_once(
    orb,
    '''  // 366 orange particles: 70% small, 23% medium, 7% large.\n  for (let i = 0; i < 366; i += 1) {\n''',
    '''  // 512 orange particles: about +40%, still 70% small / 23% medium / 7% large.\n  for (let i = 0; i < 512; i += 1) {\n''',
    "face particle +40 percent",
)

orb = replace_once(
    orb,
    '''    const shimmer =\n      0.42 +\n      0.58 * Math.max(0, Math.sin(time * 0.015 + i * 0.91 + angle));\n    const edge = Math.max(0.08, 1 - radial * 0.62);\n    const alpha =\n      baseAlpha *\n      edge *\n      (0.58 + shimmer * 0.7) *\n      (speaking ? 1.12 + drive * 0.48 : 0.84 + breathe * 0.13);\n''',
    '''    const shimmer =\n      0.42 +\n      0.58 * Math.max(0, Math.sin(time * 0.015 + i * 0.91 + angle));\n    const speechSpark = speaking\n      ? 0.5 + 0.5 * Math.sin(time * 0.022 + i * 0.77 + angle)\n      : 0;\n    const edge = Math.max(0.08, 1 - radial * 0.62);\n    const alpha =\n      baseAlpha *\n      edge *\n      (0.58 + shimmer * 0.7) *\n      (speaking\n        ? 1.18 + drive * 0.52 + speechSpark * 0.24\n        : 0.84 + breathe * 0.13);\n''',
    "face speaking sparkle",
)

orb = replace_once(
    orb,
    '''    ctx.fillStyle = gold(alpha);\n    ctx.beginPath();\n    ctx.arc(x, y, size, 0, Math.PI * 2);\n    ctx.fill();\n''',
    '''    ctx.fillStyle = gold(alpha);\n    ctx.beginPath();\n    ctx.arc(\n      x,\n      y,\n      size * (speaking ? 1 + speechSpark * 0.1 + drive * 0.035 : 1),\n      0,\n      Math.PI * 2,\n    );\n    ctx.fill();\n''',
    "face speaking size pulse",
)

orb = replace_once(
    orb,
    '''    const neckDriftX =\n      Math.sin(time * 0.0018 + i * 0.63) *\n      (0.42 + seededRandom(i + 5251) * 0.72);\n    const neckDriftY =\n      Math.cos(time * 0.00145 + i * 0.47) *\n      (0.3 + seededRandom(i + 5279) * 0.56);\n''',
    '''    const speechMotion = speaking ? 1 + drive * 0.62 : 1;\n    const neckDriftX =\n      Math.sin(time * 0.0018 + i * 0.63) *\n      (0.42 + seededRandom(i + 5251) * 0.72) *\n      speechMotion;\n    const neckDriftY =\n      Math.cos(time * 0.00145 + i * 0.47) *\n      (0.3 + seededRandom(i + 5279) * 0.56) *\n      speechMotion;\n''',
    "neck speaking motion",
)

orb = replace_once(
    orb,
    '''    const sizeClass = seededRandom(i + 5181);\n    const shimmer = 0.46 + 0.54 * Math.sin(time * 0.016 + i * 0.79);\n''',
    '''    const sizeClass = seededRandom(i + 5181);\n    const shimmer = 0.46 + 0.54 * Math.sin(time * 0.016 + i * 0.79);\n    const speechSpark = speaking\n      ? 0.5 + 0.5 * Math.sin(time * 0.023 + i * 0.71)\n      : 0;\n''',
    "neck speaking sparkle",
)

orb = replace_once(
    orb,
    '''    ctx.fillStyle = gold(\n      alpha * (0.64 + shimmer * 0.64) * (1 + drive * 0.88),\n    );\n''',
    '''    ctx.fillStyle = gold(\n      alpha *\n        (0.64 + shimmer * 0.64) *\n        (1 + drive * 0.88 + speechSpark * 0.24),\n    );\n''',
    "neck speaking alpha",
)

# Replace only the neck particle arc occurrence after its beginPath.
old_neck_arc = '''    ctx.beginPath();\n    ctx.arc(x, y, size, 0, Math.PI * 2);\n    ctx.fill();\n  }\n\n  ctx.shadowBlur = 0;\n  ctx.restore();\n}\n\nfunction drawParticles('''
new_neck_arc = '''    ctx.beginPath();\n    ctx.arc(\n      x,\n      y,\n      size * (speaking ? 1 + speechSpark * 0.09 + drive * 0.035 : 1),\n      0,\n      Math.PI * 2,\n    );\n    ctx.fill();\n  }\n\n  ctx.shadowBlur = 0;\n  ctx.restore();\n}\n\nfunction drawParticles('''
orb = replace_once(orb, old_neck_arc, new_neck_arc, "neck speaking size pulse")

orb = replace_once(
    orb,
    '''    const motionScale =\n      region === "ambient"\n        ? 0.84\n        : region === "head"\n          ? 0.31\n          : 0.27;\n    const driftX =\n      Math.sin(t * particle.speed + particle.phase) *\n      motionScale *\n      particle.depth *\n      particle.drift;\n    const driftY =\n      Math.cos(t * particle.speed * 0.73 + particle.phase) *\n      motionScale *\n      0.8 *\n      particle.depth *\n      particle.drift;\n\n    const sparkle = 0.46 + 0.54 * Math.sin(t * 2.35 + particle.phase);\n''',
    '''    const speaking = speechLift > 0.01;\n    const speechPulse = speaking\n      ? 0.5 + 0.5 * Math.sin(t * 8.4 + particle.phase * 1.37)\n      : 0;\n    const motionScale =\n      (region === "ambient"\n        ? 0.84\n        : region === "head"\n          ? 0.31\n          : 0.27) *\n      (speaking ? 1 + speechLift * 0.46 + speechPulse * 0.16 : 1);\n    const speechBounce = speaking\n      ? Math.sin(t * (6.2 + particle.flash * 0.8) + particle.phase) *\n        particle.depth *\n        (0.1 + speechLift * 0.34)\n      : 0;\n    const driftX =\n      Math.sin(t * particle.speed + particle.phase) *\n      motionScale *\n      particle.depth *\n      particle.drift +\n      speechBounce * 0.42;\n    const driftY =\n      Math.cos(t * particle.speed * 0.73 + particle.phase) *\n      motionScale *\n      0.8 *\n      particle.depth *\n      particle.drift +\n      speechBounce;\n\n    const sparkle = 0.46 + 0.54 * Math.sin(t * 2.35 + particle.phase);\n''',
    "all-particle speaking motion",
)

orb = replace_once(
    orb,
    '''      (0.75 + particle.depth * 0.38) *\n      (1 + speechLift * 0.82);\n\n    const brightSpark = particle.size > 1.55 && flash > 0.42;\n''',
    '''      (0.75 + particle.depth * 0.38) *\n      (1 + speechLift * 0.82) *\n      (speaking ? 1 + speechPulse * 0.34 : 1);\n\n    const brightSpark =\n      (particle.size > 1.55 && flash > 0.42) ||\n      (speaking && particle.size > 0.72 && flash > 0.72);\n''',
    "all-particle speaking alpha",
)

orb = replace_once(
    orb,
    '''      particle.size * 0.84 * (0.76 + power * 0.19 + speechLift * 0.06),\n''',
    '''      particle.size *\n        0.84 *\n        (0.76 + power * 0.19 + speechLift * 0.06) *\n        (speaking ? 1 + speechPulse * 0.075 : 1),\n''',
    "all-particle speaking size pulse",
)

orb = replace_once(
    orb,
    '''    let phase: NuboVoicePhase = "idle";\n    let audioLevel = 0;\n''',
    '''    let phase: NuboVoicePhase = "idle";\n    let playbackActive = false;\n    let audioLevel = 0;\n''',
    "playback active state",
)

orb = replace_once(
    orb,
    '''    const onAudioLevel = (event: Event) => {\n      const level = (event as CustomEvent<{ level?: number }>).detail?.level;\n      if (typeof level === "number" && Number.isFinite(level)) {\n        targetAudioLevel = clamp01(level);\n      }\n    };\n\n    const onAssistantText = (event: Event) => {\n''',
    '''    const onAudioLevel = (event: Event) => {\n      const level = (event as CustomEvent<{ level?: number }>).detail?.level;\n      if (typeof level === "number" && Number.isFinite(level)) {\n        targetAudioLevel = clamp01(level);\n      }\n    };\n\n    const onPlaybackState = (event: Event) => {\n      const active = (event as CustomEvent<{ active?: boolean }>).detail?.active;\n      if (typeof active === "boolean") playbackActive = active;\n    };\n\n    const onAssistantText = (event: Event) => {\n''',
    "playback event listener",
)

orb = replace_once(
    orb,
    '''        renderHologram(ctx, particles, time, phase, audioLevel, gesture);\n''',
    '''        renderHologram(\n          ctx,\n          particles,\n          time,\n          playbackActive ? "speaking" : phase,\n          audioLevel,\n          gesture,\n        );\n''',
    "effective speaking phase",
)

orb = replace_once(
    orb,
    '''    window.addEventListener("nubo-voice-phase", onPhase);\n    window.addEventListener("nubo:voice-level", onAudioLevel);\n    window.addEventListener("nubo:assistant-text", onAssistantText);\n''',
    '''    window.addEventListener("nubo-voice-phase", onPhase);\n    window.addEventListener("nubo:voice-level", onAudioLevel);\n    window.addEventListener("nubo:audio-playback-state", onPlaybackState);\n    window.addEventListener("nubo:assistant-text", onAssistantText);\n''',
    "register playback event",
)

orb = replace_once(
    orb,
    '''      window.removeEventListener("nubo-voice-phase", onPhase);\n      window.removeEventListener("nubo:voice-level", onAudioLevel);\n      window.removeEventListener("nubo:assistant-text", onAssistantText);\n''',
    '''      window.removeEventListener("nubo-voice-phase", onPhase);\n      window.removeEventListener("nubo:voice-level", onAudioLevel);\n      window.removeEventListener("nubo:audio-playback-state", onPlaybackState);\n      window.removeEventListener("nubo:assistant-text", onAssistantText);\n''',
    "unregister playback event",
)

orb_path.write_text(orb, encoding="utf-8")

print("Applied: face +40%, exact PCM speaking lifecycle, full-body speaking shimmer/pulse.")
