/**
 * Нейтральная эмблема (колос в круге) — пока в config нет site.brand.logo.
 * Своя графика, не логотип компании: настоящий логотип подставляется файлом.
 */

/** Зёрна колоса: [x, y, поворот°] в координатах 0…100. */
export const GRAINS: [number, number, number][] = [
  [50, 18, 0],
  [41, 30, -32], [59, 30, 32],
  [40, 43, -32], [60, 43, 32],
  [41, 56, -32], [59, 56, 32],
];

export function drawEmblem(ctx: CanvasRenderingContext2D, size: number, o: { ring: string; grain: string; bg: string }): void {
  const s = size / 100;
  ctx.save();
  ctx.scale(s, s);
  ctx.fillStyle = o.bg;
  ctx.beginPath();
  ctx.arc(50, 50, 49, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = o.ring;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(50, 50, 44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = o.grain;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(50, 26);
  ctx.lineTo(50, 82);
  ctx.stroke();
  ctx.fillStyle = o.grain;
  for (const [x, y, r] of GRAINS) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((r * Math.PI) / 180);
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.2, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
