import type { PowerPoint } from './types';

const MIN_MS = 60_000;
const DAY_MS = 24 * 60 * MIN_MS;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Час суток (0–23) в часовом поясе площадки. */
export function hourOfDay(tsMs: number, timezone: string): number {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' });
    formatters.set(timezone, f);
  }
  return Number(f.format(tsMs)) % 24;
}

/** Среднее значение kw по точкам с t >= fromMs. */
export function meanSince(points: readonly PowerPoint[], fromMs: number): number | null {
  let sum = 0;
  let n = 0;
  for (const p of points) {
    if (p.t >= fromMs) {
      sum += p.kw;
      n++;
    }
  }
  return n ? sum / n : null;
}

interface MinuteBucket {
  sum: number;
  count: number;
}

export interface BaselineOptions {
  timezone: string;
  historyDays: number;
}

/**
 * Базовая линия потребления: скользящая медиана минутных средних
 * по тому же часу суток за последние historyDays дней.
 * Отсчёты можно добавлять не по порядку (догрузка буфера ESP32, backfill из InfluxDB).
 */
export class HourlyBaseline {
  /** Минутные корзины, разложенные по часу суток: hour → (minuteStartMs → корзина). */
  private readonly byHour: Map<number, MinuteBucket>[] = Array.from({ length: 24 }, () => new Map());
  /** Те же корзины одним словарём — для быстрого поиска соседних минут при сглаживании. */
  private readonly flat = new Map<number, MinuteBucket>();
  private count = 0;

  constructor(private readonly opts: BaselineOptions) {}

  get size(): number {
    return this.count;
  }

  add(tsMs: number, kw: number): void {
    if (!Number.isFinite(kw) || !Number.isFinite(tsMs)) return;
    const key = Math.floor(tsMs / MIN_MS) * MIN_MS;
    const bucket = this.byHour[hourOfDay(key, this.opts.timezone)]!;
    const b = bucket.get(key);
    if (b) {
      b.sum += kw;
      b.count++;
    } else {
      const nb = { sum: kw, count: 1 };
      bucket.set(key, nb);
      this.flat.set(key, nb);
      this.count++;
    }
  }

  /** Добавить уже агрегированное минутное среднее (например, из InfluxDB). */
  addMinuteMean(minuteStartMs: number, meanKw: number): void {
    if (!Number.isFinite(meanKw)) return;
    const key = Math.floor(minuteStartMs / MIN_MS) * MIN_MS;
    const bucket = this.byHour[hourOfDay(key, this.opts.timezone)]!;
    if (!bucket.has(key)) this.count++;
    const nb = { sum: meanKw, count: 1 };
    bucket.set(key, nb);
    this.flat.set(key, nb);
  }

  /**
   * Норма для часа суток момента tsMs: медиана и MAD (медиана абсолютных отклонений).
   * excludeFromMs — не учитывать минуты начиная с этого момента (окно, с которым сравниваем).
   * smoothMin — каждую историческую минуту заменить средним за предыдущие smoothMin минут,
   *   чтобы сравнивать «среднее за окно» с такими же средними в прошлом (важно для циклических станков).
   */
  baselineFor(
    tsMs: number,
    excludeFromMs = Number.POSITIVE_INFINITY,
    smoothMin = 1,
  ): { medianKw: number | null; madKw: number | null; samples: number } {
    const oldest = tsMs - this.opts.historyDays * DAY_MS;
    const values: number[] = [];
    for (const [key, b] of this.byHour[hourOfDay(tsMs, this.opts.timezone)]!) {
      if (key < oldest || key >= excludeFromMs) continue;
      if (smoothMin <= 1) {
        values.push(b.sum / b.count);
        continue;
      }
      let sum = 0;
      let n = 0;
      for (let i = 0; i < smoothMin; i++) {
        const nb = this.flat.get(key - i * MIN_MS);
        if (nb) {
          sum += nb.sum / nb.count;
          n++;
        }
      }
      if (n * 2 >= smoothMin) values.push(sum / n);
    }
    const med = median(values);
    const mad = med === null ? null : median(values.map((v) => Math.abs(v - med)));
    return { medianKw: med, madKw: mad, samples: values.length };
  }

  prune(nowMs: number): void {
    const oldest = nowMs - this.opts.historyDays * DAY_MS;
    for (const bucket of this.byHour) {
      for (const key of bucket.keys()) {
        if (key < oldest) {
          bucket.delete(key);
          this.flat.delete(key);
          this.count--;
        }
      }
    }
  }
}
