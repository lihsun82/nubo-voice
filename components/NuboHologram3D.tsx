"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { NuboEnergyOrb } from "@/components/NuboEnergyOrb";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

type GestureKind =
  | "neutral"
  | "nod"
  | "shake"
  | "question"
  | "think"
  | "shrug"
  | "emphasis";

type GestureState = {
  kind: GestureKind;
  startedAt: number;
  duration: number;
};

type PointCloudData = {
  geometry: THREE.BufferGeometry;
  count: number;
};

const TAU = Math.PI * 2;
const ACTION_AMPLITUDE = 1.4;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function seeded(index: number) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function buildGeometry(
  positions: number[],
  sizes: number[],
  phases: number[],
  drifts: number[],
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute("aDrift", new THREE.Float32BufferAttribute(drifts, 1));
  return geometry;
}

function makeCyanHead(count: number): PointCloudData {
  const positions: number[] = [];
  const sizes: number[] = [];
  const phases: number[] = [];
  const drifts: number[] = [];

  for (let i = 0; i < count; i += 1) {
    const theta = seeded(i + 1001) * TAU;
    const phi = Math.acos(2 * seeded(i + 1019) - 1);
    const shell = 0.96 + (seeded(i + 1031) - 0.5) * 0.12;
    const sinPhi = Math.sin(phi);
    const x = 0.92 * sinPhi * Math.cos(theta) * shell;
    const y = 1.15 + 1.18 * Math.cos(phi) * shell;
    const z = 0.78 * sinPhi * Math.sin(theta) * shell;

    positions.push(x, y, z);
    const sizeRoll = seeded(i + 1061);
    sizes.push(sizeRoll > 0.965 ? 2.25 : sizeRoll > 0.78 ? 1.25 : 0.62 + seeded(i + 1087) * 0.42);
    phases.push(seeded(i + 1097) * TAU);
    drifts.push(0.7 + seeded(i + 1117) * 0.7);
  }

  return { geometry: buildGeometry(positions, sizes, phases, drifts), count };
}

function makeCyanBody(count: number): PointCloudData {
  const positions: number[] = [];
  const sizes: number[] = [];
  const phases: number[] = [];
  const drifts: number[] = [];

  for (let i = 0; i < count; i += 1) {
    const t = seeded(i + 2003);
    const theta = seeded(i + 2029) * TAU;
    const y = 0.08 - t * 2.12;
    const width = 0.92 + Math.pow(t, 0.72) * 1.58;
    const shoulderLift = Math.pow(1 - t, 2.4) * (0.2 + 0.2 * Math.abs(Math.cos(theta)));
    const x = Math.cos(theta) * width * (0.96 + seeded(i + 2053) * 0.08);
    const z = Math.sin(theta) * (0.54 + t * 0.22) * (0.93 + seeded(i + 2069) * 0.14);

    positions.push(x, y + shoulderLift, z);
    const sizeRoll = seeded(i + 2081);
    sizes.push(sizeRoll > 0.972 ? 2.1 : sizeRoll > 0.8 ? 1.18 : 0.58 + seeded(i + 2099) * 0.4);
    phases.push(seeded(i + 2111) * TAU);
    drifts.push(0.66 + seeded(i + 2131) * 0.62);
  }

  return { geometry: buildGeometry(positions, sizes, phases, drifts), count };
}

function makeAmbient(count: number): PointCloudData {
  const positions: number[] = [];
  const sizes: number[] = [];
  const phases: number[] = [];
  const drifts: number[] = [];

  for (let i = 0; i < count; i += 1) {
    const headZone = seeded(i + 3001) < 0.48;
    const a = seeded(i + 3023) * TAU;
    const r = headZone ? 1.08 + seeded(i + 3041) * 0.78 : 1.55 + seeded(i + 3049) * 1.2;
    const x = Math.cos(a) * r * (headZone ? 0.9 : 1.08);
    const y = headZone
      ? 1.1 + Math.sin(a) * r * 0.95 + (seeded(i + 3067) - 0.5) * 0.68
      : -0.78 + (seeded(i + 3079) - 0.5) * 2.35;
    const z = (seeded(i + 3089) - 0.5) * (headZone ? 1.75 : 2.25);

    positions.push(x, y, z);
    const roll = seeded(i + 3109);
    sizes.push(roll > 0.97 ? 1.85 : 0.45 + seeded(i + 3121) * 0.5);
    phases.push(seeded(i + 3137) * TAU);
    drifts.push(1.15 + seeded(i + 3163) * 1.05);
  }

  return { geometry: buildGeometry(positions, sizes, phases, drifts), count };
}

function makeFaceParticles(count: number): PointCloudData {
  const positions: number[] = [];
  const sizes: number[] = [];
  const phases: number[] = [];
  const drifts: number[] = [];

  for (let i = 0; i < count; i += 1) {
    const angle = seeded(i + 4001) * TAU;
    const halo = seeded(i + 4013) > 0.73;
    const r = halo
      ? 0.78 + seeded(i + 4021) * 0.5
      : Math.pow(seeded(i + 4027), 0.72) * 0.95;
    const x = Math.cos(angle) * (halo ? 0.66 : 0.5) * r;
    const y = 1.18 + Math.sin(angle) * (halo ? 0.82 : 0.64) * r;
    const z = 0.75 + (seeded(i + 4049) - 0.5) * (halo ? 0.3 : 0.18);

    positions.push(x, y, z);
    const c = seeded(i + 4061);
    sizes.push(c < 0.72 ? 0.48 + seeded(i + 4073) * 0.42 : c < 0.94 ? 0.92 + seeded(i + 4091) * 0.58 : 1.58 + seeded(i + 4111) * 0.85);
    phases.push(seeded(i + 4127) * TAU);
    drifts.push(0.55 + seeded(i + 4139) * 0.62);
  }

  return { geometry: buildGeometry(positions, sizes, phases, drifts), count };
}

function makeFaceLines() {
  const positions: number[] = [];
  const bands = 58;
  const segments = 24;

  for (let band = 0; band < bands; band += 1) {
    const ny = -1 + (band / (bands - 1)) * 2;
    const half = Math.sqrt(Math.max(0, 1 - ny * ny)) * 0.53;
    const y = 1.18 + ny * 0.66;
    if (half < 0.02) continue;

    for (let s = 0; s < segments; s += 1) {
      const a = s / segments;
      const b = (s + 1) / segments;
      const x1 = -half + a * half * 2;
      const x2 = -half + b * half * 2;
      const z1 = 0.77 + 0.12 * (1 - Math.pow(x1 / half, 2));
      const z2 = 0.77 + 0.12 * (1 - Math.pow(x2 / half, 2));
      positions.push(x1, y, z1, x2, y, z2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function makeNeckCurves() {
  const curves: THREE.CatmullRomCurve3[] = [];
  const lineObjects: THREE.Line[] = [];

  for (const side of [-1, 1]) {
    for (let branch = 0; branch < 9; branch += 1) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * (0.14 + branch * 0.028), 0.13 - branch * 0.01, 0.66),
        new THREE.Vector3(side * (0.34 + branch * 0.052), -0.18, 0.7),
        new THREE.Vector3(side * (0.4 + branch * 0.052), -0.42, 0.68),
        new THREE.Vector3(side * (0.28 + branch * 0.032), -0.72, 0.66),
        new THREE.Vector3(side * (0.08 + branch * 0.02), -1.42, 0.62),
      ]);
      curves.push(curve);
      const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(44));
      const material = new THREE.LineBasicMaterial({
        color: 0xffa52b,
        transparent: true,
        opacity: 0.46 - branch * 0.025,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geometry, material);
      lineObjects.push(line);
    }
  }

  for (let stem = -3; stem <= 3; stem += 1) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(stem * 0.08, -0.38, 0.69),
      new THREE.Vector3(stem * 0.068, -0.78, 0.67),
      new THREE.Vector3(stem * 0.045, -1.25, 0.64),
      new THREE.Vector3(stem * 0.025, -1.72, 0.6),
    ]);
    curves.push(curve);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(36));
    const material = new THREE.LineBasicMaterial({
      color: 0xffa52b,
      transparent: true,
      opacity: stem === 0 ? 0.58 : 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    lineObjects.push(new THREE.Line(geometry, material));
  }

  return { curves, lineObjects };
}

function makeNeckParticles(curves: THREE.CatmullRomCurve3[], count: number): PointCloudData {
  const positions: number[] = [];
  const sizes: number[] = [];
  const phases: number[] = [];
  const drifts: number[] = [];

  for (let i = 0; i < count; i += 1) {
    const curve = curves[Math.floor(seeded(i + 5003) * curves.length)];
    const point = curve.getPoint(seeded(i + 5021));
    const spread = 0.018 + seeded(i + 5039) * 0.09;
    point.x += (seeded(i + 5051) - 0.5) * spread;
    point.y += (seeded(i + 5077) - 0.5) * spread * 0.72;
    point.z += (seeded(i + 5099) - 0.5) * spread * 1.3;
    positions.push(point.x, point.y, point.z);
    const c = seeded(i + 5119);
    sizes.push(c > 0.94 ? 1.55 + seeded(i + 5147) * 0.7 : c > 0.72 ? 0.9 + seeded(i + 5167) * 0.5 : 0.45 + seeded(i + 5189) * 0.38);
    phases.push(seeded(i + 5209) * TAU);
    drifts.push(0.72 + seeded(i + 5231) * 0.8);
  }

  return { geometry: buildGeometry(positions, sizes, phases, drifts), count };
}

function makeNLogo() {
  const positions: number[] = [];
  const sizes: number[] = [];
  const phases: number[] = [];
  const drifts: number[] = [];
  const samples = 70;
  const top = -1.2;
  const bottom = -1.78;
  const left = -0.32;
  const right = 0.32;

  for (let stroke = 0; stroke < 3; stroke += 1) {
    for (let i = 0; i < samples; i += 1) {
      const p = i / (samples - 1);
      let x = 0;
      let y = 0;
      if (stroke === 0) {
        x = left;
        y = bottom + p * (top - bottom);
      } else if (stroke === 1) {
        x = left + p * (right - left);
        y = top + p * (bottom - top);
      } else {
        x = right;
        y = bottom + p * (top - bottom);
      }
      positions.push(x + (seeded(i + stroke * 101) - 0.5) * 0.025, y, 0.73);
      sizes.push(1.1 + seeded(i + stroke * 131) * 0.55);
      phases.push(seeded(i + stroke * 151) * TAU);
      drifts.push(0.18);
    }
  }

  return buildGeometry(positions, sizes, phases, drifts);
}

function createParticleMaterial(color: number, baseOpacity: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSpeech: { value: 0 },
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: baseOpacity },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aPhase;
      attribute float aDrift;
      uniform float uTime;
      uniform float uSpeech;
      uniform float uPixelRatio;
      varying float vPulse;
      void main() {
        vec3 p = position;
        float slow = uTime * 0.42;
        p.x += sin(slow + aPhase) * 0.010 * aDrift;
        p.y += cos(slow * 0.73 + aPhase * 1.17) * 0.008 * aDrift;
        p.z += sin(slow * 0.61 + aPhase * 0.83) * 0.012 * aDrift;
        float sparkle = 0.62 + 0.38 * max(0.0, sin(uTime * 2.2 + aPhase * 2.4));
        vPulse = sparkle * (1.0 + uSpeech * 0.78);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = max(0.75, aSize * uPixelRatio * (8.8 / max(3.2, -mvPosition.z)) * (1.0 + uSpeech * 0.12));
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vPulse;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.04, d);
        float halo = smoothstep(0.5, 0.18, d) * 0.45;
        float alpha = (core + halo) * uOpacity * vPulse;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
}

function gestureDuration(kind: GestureKind) {
  switch (kind) {
    case "nod": return 1450;
    case "shake": return 1600;
    case "question": return 1850;
    case "think": return 1900;
    case "shrug": return 1500;
    case "emphasis": return 1250;
    default: return 0;
  }
}

function classifyGesture(text: string): GestureKind {
  const t = text.trim();
  if (!t) return "neutral";
  if (/不知道|不確定|不清楚|難說|可能吧|我不確定/.test(t)) return "shrug";
  if (/不是|不行|不要|沒有|無法|不能|錯|否|不對/.test(t)) return "shake";
  if (/[?？]|嗎|呢|是不是|是否|要不要|好不好|可以嗎/.test(t)) return "question";
  if (/當然|可以|好的|好啊|沒問題|對|是的|沒錯|收到|了解/.test(t)) return "nod";
  if (/一定|特別|重點|最重要|務必|記得|注意/.test(t)) return "emphasis";
  return "neutral";
}

function poseAt(gesture: GestureState, now: number) {
  if (gesture.duration <= 0) return { x: 0, y: 0, z: 0, lift: 0 };
  const elapsed = now - gesture.startedAt;
  if (elapsed < 0 || elapsed >= gesture.duration) return { x: 0, y: 0, z: 0, lift: 0 };
  const p = clamp01(elapsed / gesture.duration);
  const envelope = Math.sin(Math.PI * p);
  const wave2 = Math.sin(TAU * p);
  const wave3 = Math.sin(TAU * 1.5 * p);

  switch (gesture.kind) {
    case "nod": return { x: wave2 * 0.18 * ACTION_AMPLITUDE, y: 0, z: 0, lift: 0 };
    case "shake": return { x: 0, y: wave3 * 0.2 * ACTION_AMPLITUDE, z: 0, lift: 0 };
    case "question": return { x: -0.075 * envelope * ACTION_AMPLITUDE, y: 0.04 * envelope, z: 0.12 * envelope * ACTION_AMPLITUDE, lift: 0 };
    case "think": return { x: -0.16 * envelope * ACTION_AMPLITUDE, y: 0.035 * envelope, z: -0.025 * envelope, lift: 0 };
    case "shrug": return { x: 0, y: 0, z: 0, lift: 0.13 * envelope * ACTION_AMPLITUDE };
    case "emphasis": return { x: wave2 * 0.11 * ACTION_AMPLITUDE, y: 0, z: 0, lift: 0 };
    default: return { x: 0, y: 0, z: 0, lift: 0 };
  }
}

export function NuboHologram3D() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("hologram") === "2d") {
      setFallback(true);
      return;
    }

    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      setFallback(true);
      return;
    }

    const mobile = window.matchMedia("(pointer: coarse)").matches;
    const lowCore = (navigator.hardwareConcurrency || 8) <= 4;
    const headCount = lowCore ? 2600 : mobile ? 5200 : 9800;
    const bodyCount = lowCore ? 3000 : mobile ? 6200 : 11600;
    const ambientCount = lowCore ? 700 : mobile ? 1500 : 2800;
    const faceCount = lowCore ? 420 : mobile ? 720 : 1050;
    const neckCount = lowCore ? 300 : mobile ? 520 : 820;

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.45 : 1.85));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    camera.position.set(0, 0.05, 7.2);
    camera.lookAt(0, -0.05, 0);

    const root = new THREE.Group();
    const headGroup = new THREE.Group();
    const bodyGroup = new THREE.Group();
    scene.add(root);
    root.add(bodyGroup, headGroup);

    const cyanMaterial = createParticleMaterial(0x27e7f5, 0.72);
    const orangeMaterial = createParticleMaterial(0xffa624, 0.8);
    const nMaterial = createParticleMaterial(0x66f4ff, 0.94);

    const head = makeCyanHead(headCount);
    const body = makeCyanBody(bodyCount);
    const ambient = makeAmbient(ambientCount);
    const face = makeFaceParticles(faceCount);

    const headPoints = new THREE.Points(head.geometry, cyanMaterial);
    const bodyPoints = new THREE.Points(body.geometry, cyanMaterial);
    const ambientPoints = new THREE.Points(ambient.geometry, cyanMaterial);
    const facePoints = new THREE.Points(face.geometry, orangeMaterial);

    headGroup.add(headPoints, facePoints);
    bodyGroup.add(bodyPoints, ambientPoints);

    const faceLineGeometry = makeFaceLines();
    const faceLineMaterial = new THREE.LineBasicMaterial({
      color: 0xffa22b,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const faceLines = new THREE.LineSegments(faceLineGeometry, faceLineMaterial);
    headGroup.add(faceLines);

    const { curves, lineObjects } = makeNeckCurves();
    for (const line of lineObjects) bodyGroup.add(line);
    const neck = makeNeckParticles(curves, neckCount);
    const neckPoints = new THREE.Points(neck.geometry, orangeMaterial);
    bodyGroup.add(neckPoints);

    const nGeometry = makeNLogo();
    const nPoints = new THREE.Points(nGeometry, nMaterial);
    bodyGroup.add(nPoints);

    const auraGeometry = new THREE.RingGeometry(1.8, 2.65, 96);
    const auraMaterial = new THREE.MeshBasicMaterial({
      color: 0x0ca9c8,
      transparent: true,
      opacity: 0.035,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const aura = new THREE.Mesh(auraGeometry, auraMaterial);
    aura.position.set(0, 0.2, -0.75);
    root.add(aura);

    let phase: NuboVoicePhase = "idle";
    let audioTarget = 0;
    let audioLevel = 0;
    let gesture: GestureState = { kind: "neutral", startedAt: 0, duration: 0 };
    let lastTranscript = "";
    let animationFrame = 0;

    const startGesture = (kind: GestureKind) => {
      gesture = { kind, startedAt: performance.now(), duration: gestureDuration(kind) };
    };

    const setGestureFromText = (text: string) => {
      const normalized = text.trim();
      if (!normalized || normalized === lastTranscript) return;
      lastTranscript = normalized;
      startGesture(classifyGesture(normalized));
    };

    const onPhase = (event: Event) => {
      const next = (event as CustomEvent<{ phase?: NuboVoicePhase }>).detail?.phase;
      if (!next) return;
      phase = next;
      if (next === "thinking") startGesture("think");
    };
    const onAudio = (event: Event) => {
      const level = (event as CustomEvent<{ level?: number }>).detail?.level;
      if (typeof level === "number" && Number.isFinite(level)) audioTarget = clamp01(level);
    };
    const onText = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text;
      if (typeof text === "string") setGestureFromText(text);
    };

    const observer = new MutationObserver(() => {
      const transcript = document.querySelector<HTMLElement>(".voice-transcript");
      if (transcript?.textContent) setGestureFromText(transcript.textContent);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    const resize = () => {
      const width = Math.max(280, mount.clientWidth || 560);
      const height = Math.max(310, Math.round(width * (620 / 560)));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const dpr = renderer.getPixelRatio();
      cyanMaterial.uniforms.uPixelRatio.value = dpr;
      orangeMaterial.uniforms.uPixelRatio.value = dpr;
      nMaterial.uniforms.uPixelRatio.value = dpr;
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const contextLost = (event: Event) => {
      event.preventDefault();
      setFallback(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", contextLost, false);

    const tick = (now: number) => {
      const t = now / 1000;
      audioLevel += (audioTarget - audioLevel) * 0.2;
      audioTarget *= 0.91;
      const speaking = phase === "speaking";
      const speech = speaking ? clamp01(0.34 + audioLevel * 1.9 + 0.16 * Math.sin(t * 9.5)) : 0;

      cyanMaterial.uniforms.uTime.value = t;
      orangeMaterial.uniforms.uTime.value = t;
      nMaterial.uniforms.uTime.value = t;
      cyanMaterial.uniforms.uSpeech.value = speech;
      orangeMaterial.uniforms.uSpeech.value = speaking ? Math.min(1.35, speech * 1.12 + 0.18) : 0;
      nMaterial.uniforms.uSpeech.value = speaking ? Math.min(1.5, speech * 1.25 + 0.22) : 0.08;
      faceLineMaterial.opacity = 0.45 + (speaking ? speech * 0.28 : 0);
      auraMaterial.opacity = 0.028 + (speaking ? speech * 0.035 : 0);

      for (const line of lineObjects) {
        const material = line.material as THREE.LineBasicMaterial;
        material.opacity = Math.min(0.88, material.opacity * 0.96 + (speaking ? 0.18 + speech * 0.32 : 0.02));
      }

      const pose = poseAt(gesture, now);
      headGroup.rotation.x += (pose.x - headGroup.rotation.x) * 0.22;
      headGroup.rotation.y += (pose.y - headGroup.rotation.y) * 0.22;
      headGroup.rotation.z += (pose.z - headGroup.rotation.z) * 0.22;
      headGroup.position.y += ((pose.y !== 0 ? 0.02 : 0) - headGroup.position.y) * 0.18;
      bodyGroup.position.y += (pose.lift - bodyGroup.position.y) * 0.2;

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(tick);
    };

    window.addEventListener("nubo-voice-phase", onPhase);
    window.addEventListener("nubo:voice-level", onAudio);
    window.addEventListener("nubo:assistant-text", onText);
    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("nubo-voice-phase", onPhase);
      window.removeEventListener("nubo:voice-level", onAudio);
      window.removeEventListener("nubo:assistant-text", onText);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      scene.traverse((object) => {
        const maybeGeometry = object as THREE.Object3D & { geometry?: THREE.BufferGeometry };
        maybeGeometry.geometry?.dispose();
        const maybeMaterial = object as THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
        if (Array.isArray(maybeMaterial.material)) maybeMaterial.material.forEach((material) => material.dispose());
        else maybeMaterial.material?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  if (fallback) return <NuboEnergyOrb />;

  return (
    <div
      ref={mountRef}
      className="nubo-energy-orb nubo-hologram-avatar nubo-hologram-3d"
      style={{ width: "100%", aspectRatio: "560 / 620", overflow: "hidden" }}
      aria-hidden="true"
    />
  );
}
