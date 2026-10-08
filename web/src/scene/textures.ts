import * as THREE from 'three';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export interface LabelOptions {
  fontSize?: number;
  weight?: number;
  color?: string;
  letterSpacing?: number;
  padding?: number;
}

/** Текст на прозрачном фоне — для подписей этапов на полу. Шрифт системный, кириллица есть. */
export function makeLabelTexture(text: string, o: LabelOptions = {}): { texture: THREE.CanvasTexture; aspect: number } {
  const fontSize = o.fontSize ?? 96;
  const pad = o.padding ?? 16;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `${o.weight ?? 600} ${fontSize}px ${FONT}`;
  ctx.font = font;
  const spacing = o.letterSpacing ?? 0;
  const w = Math.ceil(ctx.measureText(text).width + spacing * text.length + pad * 2);
  const h = Math.ceil(fontSize * 1.3 + pad * 2);
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = o.color ?? '#3d3d3a';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
  ctx.fillText(text, pad, h / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, aspect: w / h };
}

/** Жёлто-чёрная предупредительная разметка. */
export function makeStripeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f2c230';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#2b2b29';
  for (let i = -128; i < 256; i += 48) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 24, 0);
    ctx.lineTo(i + 24 + 128, 128);
    ctx.lineTo(i + 128, 128);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Решётка вентилятора (льдогенератор, печь). */
export function makeGrilleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5f6368';
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d7d9dc';
  ctx.lineWidth = 6;
  for (let r = 30; r <= 120; r += 18) {
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(ang) * 22, 128 + Math.sin(ang) * 22);
    ctx.lineTo(128 + Math.cos(ang) * 122, 128 + Math.sin(ang) * 122);
    ctx.stroke();
  }
  ctx.fillStyle = '#3a3d40';
  ctx.beginPath();
  ctx.arc(128, 128, 22, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Холст экрана станка (перерисовывается при обновлении данных). */
export function drawScreen(
  canvas: HTMLCanvasElement,
  o: { label: string; value: string; unit: string; pct: number; color: string },
): void {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  ctx.fillStyle = '#0f1720';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = o.color;
  ctx.beginPath();
  ctx.arc(22, 26, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9d3dd';
  ctx.font = `600 22px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(o.label.toUpperCase(), 40, 27);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 64px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(o.value, 16, 104);
  const vw = ctx.measureText(o.value).width;
  ctx.fillStyle = '#9fb0c0';
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText(o.unit, 24 + vw, 104);
  // полоса % от номинала
  ctx.fillStyle = '#25313d';
  ctx.fillRect(16, 116, w - 32, 6);
  ctx.fillStyle = o.color;
  ctx.fillRect(16, 116, Math.max(0, Math.min(1, o.pct / 100)) * (w - 32), 6);
}
