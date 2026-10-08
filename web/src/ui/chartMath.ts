import type { PowerPoint } from '@bakery/shared';

/** Делит ряд на отрезки, если между точками разрыв больше gapMs (нет связи — линия не рисуется). */
export function splitByGaps(points: readonly PowerPoint[], gapMs: number): PowerPoint[][] {
  const out: PowerPoint[][] = [];
  let cur: PowerPoint[] = [];
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
