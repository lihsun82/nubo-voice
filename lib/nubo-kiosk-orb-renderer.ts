import type { NuboVoicePhase } from "./nubo-voice-phase";

const TAU = Math.PI * 2;
const SPHERE_RADIUS = 0.72;
const RIM_COLORS = Array.from({ length: 44 }, (_, index) => `rgb(12, ${212 + index}, 255)`);

type Point = { x: number; y: number; z: number };
type LightningArc = {
  mainPath: Point[];
  branchPath: Point[] | null;
  life: number;
  maxLife: number;
  intensity: number;
};

function createShellParticles() {
  const particles = [];
  const rows = 100;
  const maxColumns = 135;
  for (let row = 1; row < rows - 1; row++) {
    const phi = row / (rows - 1) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const columns = Math.max(14, Math.round(maxColumns * sinPhi));
    for (let column = 0; column < columns; column++) {
      const theta = column / columns * TAU;
      const pattern1 = Math.abs(Math.sin(theta * 3 + phi * 4.5 + Math.sin(phi * 7) * 0.6));
      const pattern2 = Math.abs(Math.cos(theta * 4 - phi * 3.8 + Math.cos(theta * 5) * 0.5));
      const distance = Math.min(pattern1, pattern2);
      const veinIntensity = distance < 0.182 ? 1 - distance / 0.182 : 0;
      particles.push({
        x: SPHERE_RADIUS * sinPhi * Math.sin(theta) + (Math.random() - 0.5) * 0.005,
        y: SPHERE_RADIUS * cosPhi + (Math.random() - 0.5) * 0.005,
        z: SPHERE_RADIUS * sinPhi * Math.cos(theta) + (Math.random() - 0.5) * 0.005,
        phi,
        theta,
        veinIntensity,
        veinColor: veinIntensity > 0
          ? `rgb(${Math.round(15 + 240 * veinIntensity)}, ${Math.round(215 - 35 * veinIntensity)}, ${Math.round(255 - 220 * veinIntensity)})`
          : "",
      });
    }
  }
  return particles;
}

function createCoreParticles() {
  return Array.from({ length: 2340 }, () => {
    const theta = Math.random() * TAU;
    const phi = Math.acos(2 * Math.random() - 1);
    const radiusRatio = Math.pow(Math.random(), 0.62);
    const radius = 0.34 * radiusRatio;
    const coreRatio = 1 - radiusRatio;
    return {
      x: radius * Math.sin(phi) * Math.sin(theta),
      y: radius * Math.cos(phi),
      z: radius * Math.sin(phi) * Math.cos(theta),
      phase: Math.random() * TAU,
      coreRatio,
      color: `rgb(255, ${Math.round(145 + coreRatio * 90)}, ${Math.round(18 + coreRatio * 75)})`,
    };
  });
}

function createAuraParticles() {
  return Array.from({ length: 600 }, () => {
    const theta = Math.random() * TAU;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = SPHERE_RADIUS * (1.03 + Math.random() * 0.26);
    return {
      x: radius * Math.sin(phi) * Math.sin(theta),
      y: radius * Math.cos(phi),
      z: radius * Math.sin(phi) * Math.cos(theta),
      driftPhase: Math.random() * TAU,
      size: 0.5 + Math.random() * 0.9,
      alpha: 0.25 + Math.random() * 0.55,
    };
  });
}

function buildJaggedPath(start: Point, end: Point, segments: number, jitter: number) {
  const points = [start];
  for (let segment = 1; segment < segments; segment++) {
    const progress = segment / segments;
    const envelope = Math.sin(progress * Math.PI);
    points.push({
      x: start.x + (end.x - start.x) * progress + (Math.random() - 0.5) * jitter * envelope,
      y: start.y + (end.y - start.y) * progress + (Math.random() - 0.5) * jitter * envelope,
      z: start.z + (end.z - start.z) * progress + (Math.random() - 0.5) * jitter * envelope,
    });
  }
  points.push(end);
  return points;
}

function createGoldenLightning(core: Point, vein: Point, audioLevel: number): LightningArc {
  const startScale = 0.55 + Math.random() * 0.45;
  const radialReach = 0.78 + Math.random() * (0.14 + audioLevel * 0.08);
  const start = { x: core.x * startScale, y: core.y * startScale, z: core.z * startScale };
  const end = { x: vein.x * radialReach, y: vein.y * radialReach, z: vein.z * radialReach };
  const segments = 6 + Math.floor(Math.random() * 2);
  const jitter = 0.055 + audioLevel * 0.04;
  const mainPath = buildJaggedPath(start, end, segments, jitter);
  let branchPath: Point[] | null = null;
  if (Math.random() < 0.3) {
    const branchStart = mainPath[Math.floor(segments * (0.45 + Math.random() * 0.25))];
    const branchEnd = {
      x: end.x + (Math.random() - 0.5) * 0.16,
      y: end.y + (Math.random() - 0.5) * 0.16,
      z: end.z + (Math.random() - 0.5) * 0.16,
    };
    branchPath = buildJaggedPath(branchStart, branchEnd, 4, jitter * 0.55);
  }
  const maxLife = 8 + Math.floor(Math.random() * 8);
  return { mainPath, branchPath, life: maxLife, maxLife, intensity: 0.45 + Math.random() * 0.3 };
}

// Sphere, particles, and lightning adapted from the uploaded ai (2).html renderer.
export function createKioskOrbRenderer(ctx: CanvasRenderingContext2D) {
  const shellParticles = createShellParticles();
  const veinParticles = shellParticles.filter((particle) => particle.veinIntensity > 0.25);
  const coreParticles = createCoreParticles();
  const auraParticles = createAuraParticles();
  const lightningArcs: LightningArc[] = [];
  let elapsedTime = 0;
  let smoothAudioLevel = 0.04;
  let speakingBlend = 0;

  return function draw(size: number, phase: NuboVoicePhase, measuredLevel: number, delta: number, still: boolean) {
    const speaking = phase === "speaking";
    const listening = phase === "listening";
    const animationSteps = delta * 60;
    const time = still ? 0 : (elapsedTime += delta);
    const speakingTarget = speaking ? 1 : 0;

    if (still) {
      smoothAudioLevel = speaking ? 0.45 : listening ? 0.28 : 0.04;
      speakingBlend = speakingTarget;
    } else {
      const pulse = speaking
        ? 0.48 + Math.sin(time * 10.5) * 0.24 + Math.sin(time * 22) * 0.16 + Math.cos(time * 6.5) * 0.12
        : listening ? 0.28 + Math.sin(time * 4.8) * 0.12 : 0.04 + Math.sin(time * 1.8) * 0.025;
      const targetLevel = speaking || listening ? Math.max(measuredLevel, pulse) : pulse;
      const smoothing = speaking ? 0.2 : listening ? 0.14 : 0.08;
      smoothAudioLevel += (targetLevel - smoothAudioLevel) * (1 - (1 - smoothing) ** animationSteps);
      speakingBlend += (speakingTarget - speakingBlend) * (1 - 0.86 ** animationSteps);
    }

    const centerX = size * 0.5;
    const centerY = size * 0.48;
    const scale = size * 0.43;
    const audioLevel = smoothAudioLevel;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, size, size);

    const glowRadius = scale * (0.48 + audioLevel * 0.18);
    const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
    glow.addColorStop(0, `rgba(255, 200, 55, ${0.58 + audioLevel * 0.34})`);
    glow.addColorStop(0.32, `rgba(255, 145, 12, ${0.28 + audioLevel * 0.2})`);
    glow.addColorStop(0.68, "rgba(255, 110, 0, 0.05)");
    glow.addColorStop(1, "rgba(255, 110, 0, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(centerX, centerY, glowRadius, 0, TAU);
    ctx.fill();

    const yaw = time * 0.22;
    const pitch = Math.sin(time * 0.45) * 0.06 + 0.08;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosX = Math.cos(pitch);
    const sinX = Math.sin(pitch);
    let screenX = 0;
    let screenY = 0;
    let depth = 0;
    let perspective = 1;

    function project(x: number, y: number, z: number, cosYaw: number, sinYaw: number) {
      const turnedZ = x * sinYaw + z * cosYaw;
      depth = y * sinX + turnedZ * cosX;
      perspective = 2.8 / (2.8 - depth);
      screenX = centerX + (x * cosYaw - z * sinYaw) * scale * perspective;
      screenY = centerY + (y * cosX - turnedZ * sinX) * scale * perspective;
    }

    function dot(radius: number, alpha: number) {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(screenX, screenY, radius * perspective, 0, TAU);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#1ee8ff";
    for (const particle of auraParticles) {
      project(
        particle.x + Math.sin(time * 1.1 + particle.driftPhase) * 0.03,
        particle.y + Math.cos(time * 0.9 + particle.driftPhase) * 0.03,
        particle.z,
        cosY,
        sinY,
      );
      const twinkle = 0.45 + 0.55 * Math.sin(time * 2.8 + particle.driftPhase);
      const alpha = particle.alpha * twinkle * (depth < 0 ? 0.45 : 0.85);
      if (alpha > 0.03) dot(particle.size, alpha);
    }

    const sampledCoreNodes = [];
    const coreScale = 1 + audioLevel * 0.22 + Math.sin(time * 3.2) * 0.03;
    const coreCos = Math.cos(-time * 0.35);
    const coreSin = Math.sin(-time * 0.35);
    for (const [index, particle] of coreParticles.entries()) {
      const pulse = coreScale + Math.sin(time * 6.5 + particle.phase) * (0.025 + audioLevel * 0.05);
      project(particle.x * pulse, particle.y * pulse, particle.z * pulse, coreCos, coreSin);
      if (speakingBlend > 0.03 && index % 42 === 0) {
        sampledCoreNodes.push({ x: screenX, y: screenY, perspective });
      }
      const flicker = 0.78 + 0.22 * Math.sin(time * 7.5 + particle.phase);
      const alpha = Math.min(0.95, (0.28 + particle.coreRatio * 0.65) * flicker * (0.78 + audioLevel * 0.38));
      if (alpha > 0.03) {
        ctx.fillStyle = particle.color;
        dot(0.58 + particle.coreRatio * 0.72 + audioLevel * 0.25, alpha);
      }
    }

    if (speakingBlend > 0.03) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#ffc346";
      const maxLinkDistance = scale * (0.14 + audioLevel * 0.05);
      for (let index = 0; index < sampledCoreNodes.length; index++) {
        const start = sampledCoreNodes[index];
        let links = 0;
        for (let next = index + 1; next < sampledCoreNodes.length && links < 2; next++) {
          const end = sampledCoreNodes[next];
          const distance = Math.hypot(start.x - end.x, start.y - end.y);
          if (distance >= maxLinkDistance || distance <= 6) continue;
          ctx.globalAlpha = (1 - distance / maxLinkDistance) * speakingBlend * (0.12 + audioLevel * 0.14);
          ctx.lineWidth = 0.55 * start.perspective;
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(
            (start.x + end.x) * 0.5 + (Math.random() - 0.5) * 2.5,
            (start.y + end.y) * 0.5 + (Math.random() - 0.5) * 2.5,
          );
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
          links++;
        }
      }

      const arcCount = Math.round(3 + audioLevel * 5);
      while (speaking && lightningArcs.length < arcCount) {
        const core = coreParticles[Math.floor(Math.random() * coreParticles.length)];
        const vein = veinParticles[Math.floor(Math.random() * veinParticles.length)];
        lightningArcs.push(createGoldenLightning(core, vein, audioLevel));
      }

      function strokePath(path: Point[], alpha: number, glowWidth: number, coreWidth: number) {
        ctx.beginPath();
        for (const [index, point] of path.entries()) {
          project(point.x, point.y, point.z, cosY, sinY);
          if (index === 0) ctx.moveTo(screenX, screenY);
          else ctx.lineTo(screenX, screenY);
        }
        ctx.strokeStyle = "#ffaa23";
        ctx.globalAlpha = alpha * 0.22;
        ctx.lineWidth = glowWidth;
        ctx.stroke();
        ctx.strokeStyle = "#ffe182";
        ctx.globalAlpha = alpha * 0.48;
        ctx.lineWidth = coreWidth;
        ctx.stroke();
      }

      for (let index = lightningArcs.length - 1; index >= 0; index--) {
        const arc = lightningArcs[index];
        const lifeRatio = still ? 0.65 : arc.life / arc.maxLife;
        const fade = Math.sin(lifeRatio * Math.PI);
        const flicker = 0.85 + Math.random() * 0.15;
        const alpha = Math.min(0.8, fade * arc.intensity * speakingBlend * flicker * (0.38 + audioLevel * 0.28));
        strokePath(arc.mainPath, alpha, 1.8 + audioLevel * 0.7, 0.55);
        if (arc.branchPath) strokePath(arc.branchPath, alpha * 0.6, 1.1, 0.4);
        if (!still) arc.life -= animationSteps;
        if (arc.life <= 0) lightningArcs.splice(index, 1);
      }
    } else {
      lightningArcs.length = 0;
    }

    const waveSpeed = speaking ? 9.5 : listening ? 5 : 2.2;
    const waveAmplitude = 0.008 + audioLevel * 0.038;
    for (const particle of shellParticles) {
      const radialScale = 1 + Math.sin(particle.phi * 10 - time * waveSpeed + particle.theta * 2) * waveAmplitude;
      project(particle.x * radialScale, particle.y * radialScale, particle.z * radialScale, cosY, sinY);
      const rim = Math.pow(Math.max(0, 1 - Math.abs(depth / SPHERE_RADIUS)), 1.4);

      if (particle.veinIntensity > 0) {
        const flow = 0.62 + 0.38 * Math.sin(particle.phi * 14 - time * 5.2 + particle.theta);
        const alpha = Math.min(0.95, (0.35 + rim * 0.55) * flow * (0.7 + audioLevel * 0.45));
        if (alpha > 0.03) {
          ctx.fillStyle = particle.veinColor;
          dot(0.72 + particle.veinIntensity * 0.45 + rim * 0.25, alpha);
        }
      } else {
        const depthAlpha = depth < -0.1 ? 0.22 : 0.42 + rim * 0.68;
        const scan = 0.85 + 0.15 * Math.sin(particle.phi * 28 - time * 3);
        const alpha = Math.min(0.96, depthAlpha * scan * (0.55 + rim * 0.55));
        if (alpha > 0.03) {
          ctx.fillStyle = RIM_COLORS[Math.round(rim * 43)];
          dot(0.52 + rim * 0.52, alpha);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };
}
