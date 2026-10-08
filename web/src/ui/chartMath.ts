import type { PowerPoint } from '@bakery/shared';

/** Делит ряд на отрезки, если между точками разрыв больше gapMs (нет связи — линия не рисуется). */
export function splitByGaps<T extends PowerPoint = PowerPoint>(points: readonly T[], gapMs: number): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  for (const p of points) {
    const prev = cur[cur.length - 1];
    if (prev && p.t - prev.t > gapMs) {
      out.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Индекс точки, ближайшей по времени к t (точки отсортированы). */
export function nearestIndex(points: readonly PowerPoint[], t: number): number {
  if (!points.length) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.t < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(points[lo - 1]!.t - t) <= Math.abs(points[lo]!.t - t)) return lo - 1;
  return lo;
}

/** Верх оси Y: чтобы были видны и пик, и линия номинала. */
export function niceMax(peakKw: number, nominalKw: number): number {
  const m = Math.max(peakKw, nominalKw);
  return m > 0 ? m * 1.1 : 1;
}

export interface TableRow {
  t: number;
  avg: number;
  max: number;
}

export function binTable(points: readonly PowerPoint[], binMs: number): TableRow[] {
  const rows: TableRow[] = [];
  let key = Number.NaN;
  let sum = 0;
  let n = 0;
  let max = 0;
  const flush = () => {
    if (n) rows.push({ t: key, avg: sum / n, max });
  };
  for (const p of points) {
    const k = Math.floor(p.t / binMs) * binMs;
    if (k !== key) {
      flush();
      key = k;
      sum = 0;
      n = 0;
      max = -Infinity;
    }
    sum += p.kw;
    n++;
    max = Math.max(max, p.kw);
  }
  flush();
  return rows;
}

const round12 = (v: number) => +v.toPrecision(12);

/**
 * Круглые деления оси Y от нуля: верх — наименьшее «круглое» значение не ниже v,
 * делений не больше maxCount (сколько помещается по высоте).
 */
export function niceTicks(v: number, maxCount: number): { max: number; step: number; ticks: number[] } {
  const value = v > 0 ? v : 1;
  const limit = Math.max(2, maxCount);
  let best: { max: number; step: number; count: number } | null = null;
  const e = Math.floor(Math.log10(value));
  for (let k = e - 2; k <= e + 1; k++) {
    for (const m of [1, 2, 2.5, 3, 4, 5]) {
      const step = round12(m * 10 ** k);
      const count = Math.ceil(value / step - 1e-9);
      if (count < 2 || count > limit) continue;
      const max = round12(count * step);
      if (!best || max < best.max - 1e-12 || (Math.abs(max - best.max) < 1e-12 && count > best.count)) best = { max, step, count };
    }
  }
  const b = best ?? { max: value, step: value, count: 1 };
  return { max: b.max, step: b.step, ticks: Array.from({ length: b.count + 1 }, (_, i) => round12(i * b.step)) };
}

const MIN_MS = 60_000;
const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440].map((m) => m * MIN_MS);

/** Подписи времени: самый мелкий «круглый» шаг, при котором подписи не ближе minPx; круглые по местному времени. */
export function timeTicks(fromMs: number, toMs: number, plotW: number, offsetMs: number, minPx = 64): { step: number; ticks: number[] } {
  const span = Math.max(1, toMs - fromMs);
  const step = TIME_STEPS.find((s) => (s / span) * plotW >= minPx) ?? TIME_STEPS[TIME_STEPS.length - 1]!;
  const ticks: number[] = [];
  for (let t = Math.ceil((fromMs + offsetMs) / step) * step - offsetMs; t <= toMs; t += step) ticks.push(t);
  return { step, ticks };
}

/** Смещение часового пояса от UTC в момент t, мс (Asia/Tashkent → +5 ч). */
export function tzOffsetMs(timezone: string, t: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(t);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const local = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
  return Math.round((local - Math.floor(t / MIN_MS) * MIN_MS) / MIN_MS) * MIN_MS;
}

/**
 * SVG-путь сглаженной линии через точки (монотонная кубическая, как curveMonotoneX в d3):
 * между соседними точками линия не выходит за их значения — сглаживание не рисует
 * мощность, которой не было.
 */
export function monotonePath(pts: ReadonlyArray<readonly [number, number]>): string {
  const r = (v: number) => Math.round(v * 10) / 10;
  const n = pts.length;
  if (!n) return '';
  const [x0, y0] = pts[0]!;
  if (n === 1) return `M${r(x0)},${r(y0)}h1`;
  const h = (i: number) => pts[i + 1]![0] - pts[i]![0];
  const s = (i: number) => (h(i) ? (pts[i + 1]![1] - pts[i]![1]) / h(i) : 0);
  const m: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const h0 = h(i - 1);
    const h1 = h(i);
    const s0 = s(i - 1);
    const s1 = s(i);
    const p = h0 + h1 ? (s0 * h1 + s1 * h0) / (h0 + h1) : 0;
    m[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p));
  }
  m[0] = n > 2 ? (3 * s(0) - m[1]!) / 2 : s(0);
  m[n - 1] = n > 2 ? (3 * s(n - 2) - m[n - 2]!) / 2 : s(n - 2);
  let d = `M${r(x0)},${r(y0)}`;
  for (let i = 0; i < n - 1; i++) {
    const [xa, ya] = pts[i]!;
    const [xb, yb] = pts[i + 1]!;
    const k = (xb - xa) / 3;
    d += `C${r(xa + k)},${r(ya + m[i]! * k)} ${r(xb - k)},${r(yb - m[i + 1]! * k)} ${r(xb)},${r(yb)}`;
  }
  return d;
}
