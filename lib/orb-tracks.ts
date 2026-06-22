import { ORB_SIZE } from "@/lib/orb-config";

export function drawOrbTrack(
  ctx: CanvasRenderingContext2D,
  time: number,
  radius: number,
  tilt: number,
  offset: number,
  alpha: number,
  violet: boolean,
) {
  const center = ORB_SIZE / 2;
  ctx.beginPath();
  for (let index = 0; index <= 140; index += 1) {
    const ratio = index / 140;
    const angle = ratio * Math.PI * 2 + time * 0.00031 + offset;
    const localRadius = radius + Math.sin(angle * 4 + time * 0.001) * 8;
    const x = center + Math.cos(angle) * localRadius;
    const y = center + Math.sin(angle) * localRadius * tilt;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = violet
    ? `rgba(195,78,255,${alpha})`
    : `rgba(86,196,255,${alpha})`;
  ctx.lineWidth = 1.1;
  ctx.shadowColor = violet ? "#c454ff" : "#64d5ff";
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

export function drawFiveOrbTracks(
  ctx: CanvasRenderingContext2D,
  time: number,
  power: number,
) {
  drawOrbTrack(ctx, time, 173, 0.4, 0.1, 0.31 * power, false);
  drawOrbTrack(ctx, time, 194, 0.57, 1.35, 0.25 * power, true);
  drawOrbTrack(ctx, time, 216, 0.32, 2.65, 0.19 * power, false);
  drawOrbTrack(ctx, time, 235, 0.72, 4.05, 0.13 * power, true);
  drawOrbTrack(ctx, time, 249, 0.48, 5.25, 0.09 * power, false);
}
