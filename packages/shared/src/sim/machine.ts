import { hourOfDay } from '../baseline';
import type { EquipmentConfig, MachineKind, Reading } from '../types';

/** Детерминированный ГПСЧ (для воспроизводимых тестов). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SHIFT_START_HOUR = 3;
export const SHIFT_END_HOUR = 21;

export function isWorkingHour(tsMs: number, timezone: string): boolean {
  const h = hourOfDay(tsMs, timezone);
  return h >= SHIFT_START_HOUR && h < SHIFT_END_HOUR;
}

export type AnomalyType = 'overload' | 'phase_loss' | 'overconsumption' | 'comm_loss';

interface Anomaly {
  type: AnomalyType;
  from: number;
  to: number;
  phase: number;
  factor: number;
}

/** Отрезок работы: уровень мощности (доля номинала) и, опционально, термостатный цикл. */
interface Segment {
  mode: string;
  until: number;
  level: number;
  /** Цикл «нагрев/выдержка»: второй уровень и длительности фаз, мс. */
  alt?: { level: number; onMs: [number, number]; offMs: [number, number] };
  /** Амплитуда пульсаций (например, куски теста в формовщике). */
  pulse?: number;
  order?: string;
}

const MIN = 60_000;
const PRODUCTS = ['Батон нарезной', 'Хлеб пшеничный', 'Багет', 'Лепёшка тандырная', 'Булочка сдобная', 'Хлеб ржаной'];

export interface SimOptions {
  rng: () => number;
  timezone: string;
  /** Средняя частота аномалий на станок, раз в час (только когда станок работает). */
  anomalyPerHour: number;
  energyKwh?: number;
}

export class MachineSim {
  readonly anomalyLog: { type: AnomalyType; from: number; to: number }[] = [];
  private seg: Segment | null = null;
  private altOn = true;
  private altUntil = 0;
  private anomaly: Anomaly | null = null;
  private readonly shares: number[];
  private energy: number;
  private bakesSinceRest = 0;

  constructor(readonly eq: EquipmentConfig, private readonly opts: SimOptions) {
    const spread = eq.kind === 'moulder' ? 0.2 : 0.1;
    const raw = Array.from({ length: eq.phases }, () => 1 + (this.rand() * 2 - 1) * spread);
    const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
    this.shares = raw.map((v) => v / mean);
    this.energy = opts.energyKwh ?? Math.round(this.rand() * 5000);
  }

  get energyKwh(): number {
    return this.energy;
  }

  private rand(): number {
    return this.opts.rng();
  }
  private between(a: number, b: number): number {
    return a + (b - a) * this.rand();
  }
  private gauss(): number {
    const u = Math.max(this.rand(), 1e-9);
    const v = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Принудительно включить рабочий режим (для тестов и демо). */
  forceMode(mode: 'work' | 'idle', nowMs: number, durationMs = 10 * MIN): void {
    this.seg = { mode, until: nowMs + durationMs, level: mode === 'work' ? 0.8 : 0.02 };
  }

  forceAnomaly(type: AnomalyType, nowMs: number, durationMs: number): void {
    this.startAnomaly(type, nowMs, durationMs);
  }

  private startAnomaly(type: AnomalyType, nowMs: number, durationMs: number): void {
    const factor = type === 'overload' ? this.between(1.2, 1.27) : type === 'overconsumption' ? this.between(1.5, 1.7) : 1;
    this.anomaly = { type, from: nowMs, to: nowMs + durationMs, phase: Math.floor(this.rand() * this.eq.phases), factor };
    this.anomalyLog.push({ type, from: nowMs, to: nowMs + durationMs });
  }

  /** Следующий отрезок работы по типу станка. */
  private nextSegment(kind: MachineKind, prev: string | undefined, nowMs: number): Segment {
    const working = isWorkingHour(nowMs, this.opts.timezone);
    const d = (a: number, b: number) => nowMs + this.between(a, b) * MIN;
    if (!working) {
      return { mode: 'off', until: d(10, 20), level: kind === 'oven' ? 0.03 : kind === 'icemaker' ? 0.02 : 0.005 };
    }
    switch (kind) {
      case 'mixer':
        if (prev === 'slow') return { mode: 'fast', until: d(4, 6), level: 0.85, pulse: 0.04 };
        if (prev === 'fast' || prev === 'off') return { mode: 'idle', until: d(3, 9), level: 0.01 };
        return { mode: 'slow', until: d(2, 4), level: 0.45, pulse: 0.03 };
      case 'moulder':
        return prev === 'work'
          ? { mode: 'idle', until: d(4, 12), level: 0.02 }
          : { mode: 'work', until: d(10, 25), level: this.between(0.65, 0.8), pulse: 0.15, order: this.product() };
      case 'conveyor':
        return prev === 'work'
          ? { mode: 'idle', until: d(3, 10), level: 0.01 }
          : { mode: 'work', until: d(10, 25), level: this.between(0.78, 0.88), pulse: 0.03 };
      case 'proofer':
        return { mode: 'work', until: d(20, 40), level: 0.9, alt: { level: 0.22, onMs: [40_000, 90_000], offMs: [60_000, 150_000] } };
      case 'oven':
        if (prev === 'off' || prev === undefined || prev === 'rest') {
          this.bakesSinceRest = 0;
          return { mode: 'heatup', until: d(8, 12), level: 0.98, pulse: 0.01 };
        }
        if (prev === 'heatup' || prev === 'load') {
          this.bakesSinceRest++;
          return { mode: 'bake', until: d(18, 30), level: 0.95, alt: { level: 0.35, onMs: [60_000, 150_000], offMs: [40_000, 90_000] }, order: this.product() };
        }
        if (this.bakesSinceRest >= 3) return { mode: 'rest', until: d(8, 15), level: 0.04 };
        return { mode: 'load', until: d(2, 4), level: 0.06 };
      case 'icemaker':
        return prev === 'on'
          ? { mode: 'standby', until: d(8, 15), level: 0.03 }
          : { mode: 'on', until: d(12, 20), level: 0.97, pulse: 0.01 };
      default:
        return prev === 'work' ? { mode: 'idle', until: d(5, 10), level: 0.02 } : { mode: 'work', until: d(10, 20), level: 0.7, pulse: 0.05 };
    }
  }

  private product(): string {
    return `${PRODUCTS[Math.floor(this.rand() * PRODUCTS.length)]} ×${Math.round(this.between(4, 16)) * 10}`;
  }

  /** Один отсчёт счётчика. null — сообщение «потеряно» (имитация обрыва связи). */
  tick(nowMs: number, dtMs: number): Reading | null {
    if (!this.seg || nowMs >= this.seg.until) {
      this.seg = this.nextSegment(this.eq.kind, this.seg?.mode, nowMs);
      this.altOn = true;
      this.altUntil = this.seg.alt ? nowMs + this.between(...this.seg.alt.onMs) : 0;
    }
    const seg = this.seg;
    if (seg.alt && nowMs >= this.altUntil) {
      this.altOn = !this.altOn;
      this.altUntil = nowMs + this.between(...(this.altOn ? seg.alt.onMs : seg.alt.offMs));
    }
    let level = seg.alt && !this.altOn ? seg.alt.level : seg.level;
    if (seg.pulse) level *= 1 + seg.pulse * Math.sin(nowMs / 3000 + this.rand() * 2) + seg.pulse * 0.5 * this.gauss();
    level *= 1 + 0.015 * this.gauss();

    if (this.anomaly && nowMs >= this.anomaly.to) this.anomaly = null;
    if (!this.anomaly && level > 0.15 && this.opts.anomalyPerHour > 0) {
      if (this.rand() < (this.opts.anomalyPerHour * dtMs) / 3_600_000) {
        const types: AnomalyType[] = this.eq.phases === 3 ? ['overload', 'phase_loss', 'overconsumption', 'comm_loss'] : ['overload', 'overconsumption', 'comm_loss'];
        const type = types[Math.floor(this.rand() * types.length)]!;
        const dur = type === 'overconsumption' ? this.between(10, 20) * MIN : type === 'comm_loss' ? this.between(40_000, 90_000) : this.between(1, 3) * MIN;
        this.startAnomaly(type, nowMs, dur);
      }
    }

    const a = this.anomaly;
    if (a?.type === 'overload') level = Math.max(level, a.factor);
    if (a?.type === 'overconsumption') level = Math.min(level * a.factor, 1.1);
    if (a?.type === 'phase_loss') level *= 2 / 3;
    level = Math.min(Math.max(level, 0), 1.28);

    const powerKw = this.eq.nominalKw * level;
    this.energy += (powerKw * dtMs) / 3_600_000;
    if (a?.type === 'comm_loss') return null;

    const heater = this.eq.kind === 'oven' || this.eq.kind === 'proofer';
    const pf = heater ? 0.98 : Math.min(0.92, Math.max(0.5, 0.6 + 0.35 * level));
    const shares = this.shares.map((s) => s * (1 + 0.01 * this.gauss()));
    if (a?.type === 'phase_loss') shares[a.phase] = 0;
    const sumShares = shares.reduce((s, v) => s + v, 0) || 1;
    const totalA = (powerKw * 1000) / (230 * pf);
    const currentsA = shares.map((s) => round((totalA * s) / sumShares, 2));
    const voltageV = shares.map(() => round(230 + 2 * this.gauss(), 1));

    const reading: Reading = {
      equipmentId: this.eq.id,
      ts: nowMs,
      powerKw: round(powerKw, 3),
      currentsA,
      voltageV,
      powerFactor: round(pf, 2),
      energyKwh: round(this.energy, 3),
    };
    if (this.eq.meterId) reading.meterId = this.eq.meterId;
    if (seg.order && level > 0.1) reading.order = seg.order;
    return reading;
  }
}

function round(v: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}
