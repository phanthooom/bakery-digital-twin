import type { EquipmentConfig, EquipmentState } from './types';

/** Ожидаемый расход газа: по каждому газовому станку и в сумме. */
export interface ExpectedGas {
  m3h: number;
  consumers: { id: string; m3h: number }[];
  /** Хоть одна горелка должна гореть. */
  anyOn: boolean;
  /** Состояние всех газовых станков известно (ни один не «нет связи»). */
  known: boolean;
}

/**
 * Сколько газа должны брать станки сейчас. Работающий станок (или в аварии) — номинал горелки
 * по загрузке, простаивающий — ноль: горелка погашена.
 */
export function expectedGasFlow(equipment: EquipmentConfig[], states: Iterable<EquipmentState>): ExpectedGas {
  const byId = new Map([...states].map((s) => [s.id, s]));
  const consumers: ExpectedGas['consumers'] = [];
  let anyOn = false;
  let known = true;
  for (const eq of equipment) {
    if (!eq.gasM3h) continue;
    const s = byId.get(eq.id);
    let m3h = 0;
    if (!s || s.status === 'offline') known = false;
    else if (s.status === 'running' || s.status === 'alarm') {
      m3h = eq.gasM3h * Math.min(1, Math.max(0, (s.pctOfNominal ?? 100) / 100));
      anyOn = true;
    }
    consumers.push({ id: eq.id, m3h });
  }
  return { m3h: consumers.reduce((a, c) => a + c.m3h, 0), consumers, anyOn, known };
}

/** Газ на объекте: счётчик на вводе, сигнализатор загазованности, пороги выявления утечки. */
export interface GasConfig {
  meter: { id: string; name: string; vendorModel?: string; maxM3h: number; position: { x: number; z: number } };
  /** Сигнализатор загазованности (метан), пороги в % НКПР. */
  detector?: { id: string; name: string; warnLel: number; alarmLel: number };
  leak: {
    /** Расход при погашенных горелках, начиная с которого это утечка, м³/ч. */
    idleFlowM3h: number;
    idleMinutes: number;
    /** Перерасход сверх ожидаемого: больше overPct % и больше overMinM3h — дольше overMinutes. */
    overPct: number;
    overMinM3h: number;
    overMinutes: number;
  };
  offlineAfterSec: number;
}

/** Показание счётчика газа (и сигнализатора, если он подключён к тому же контроллеру). */
export interface GasReading {
  meterId: string;
  ts: number;
  /** Мгновенный расход, м³/ч. */
  flowM3h: number;
  /** Накопленный объём по счётному механизму, м³. */
  totalM3: number;
  /** Загазованность, % НКПР; null — сигнализатора нет или он молчит. */
  ch4Lel?: number | null;
}

export type GasAlertKind = 'detector' | 'flow_without_consumers' | 'over_expected';

export interface GasAlert {
  kind: GasAlertKind;
  level: 'warning' | 'critical';
  /** С какого момента держится тревога этого уровня, мс. */
  since: number;
}

export interface GasPoint {
  t: number;
  flowM3h: number;
  expectedM3h: number;
}

export interface GasState {
  level: 'ok' | 'warning' | 'critical' | 'offline';
  alerts: GasAlert[];
  lastReading: GasReading | null;
  expected: ExpectedGas;
  updatedAt: number;
}

/**
 * Учёт газа и выявление утечек по трём признакам:
 * сигнализатор загазованности, расход при погашенных горелках, перерасход сверх ожидаемого по работающим станкам.
 */
export class GasMonitor {
  private state: GasState;
  private detectorSince: { level: GasAlert['level']; since: number } | null = null;
  /** С какого момента держится условие признака (без перерыва). */
  private readonly holding = new Map<GasAlertKind, number>();
  private points: (GasPoint & { totalM3: number })[] = [];
  private readonly historyMs: number;

  constructor(
    readonly gas: GasConfig,
    readonly equipment: EquipmentConfig[],
    opts: { historyHours?: number } = {},
  ) {
    this.historyMs = (opts.historyHours ?? 6.5) * 3_600_000;
    this.state = { level: 'offline', alerts: [], lastReading: null, expected: expectedGasFlow(equipment, []), updatedAt: 0 };
  }

  getState(): GasState {
    return this.state;
  }

  ingest(reading: GasReading, states: Iterable<EquipmentState>): GasState {
    const expected = expectedGasFlow(this.equipment, states);
    const alerts: GasAlert[] = [];
    const det = this.gas.detector;
    const ch4 = reading.ch4Lel ?? null;
    const detLevel = det && ch4 !== null ? (ch4 >= det.alarmLel ? 'critical' : ch4 >= det.warnLel ? 'warning' : null) : null;
    if (!detLevel) this.detectorSince = null;
    else if (this.detectorSince?.level !== detLevel) this.detectorSince = { level: detLevel, since: reading.ts };
    if (this.detectorSince) alerts.push({ kind: 'detector', ...this.detectorSince });

    const { leak } = this.gas;
    const idle = expected.known && !expected.anyOn && reading.flowM3h >= leak.idleFlowM3h;
    const since = this.hold('flow_without_consumers', idle, reading.ts);
    if (since !== null && reading.ts - since >= leak.idleMinutes * 60_000) alerts.push({ kind: 'flow_without_consumers', level: 'critical', since });

    const excess = reading.flowM3h - expected.m3h;
    const over = expected.known && expected.anyOn && excess > Math.max(leak.overMinM3h, (expected.m3h * leak.overPct) / 100);
    const overSince = this.hold('over_expected', over, reading.ts);
    if (overSince !== null && reading.ts - overSince >= leak.overMinutes * 60_000) alerts.push({ kind: 'over_expected', level: 'warning', since: overSince });
    this.state = { level: worst(alerts), alerts, lastReading: reading, expected, updatedAt: reading.ts };
    this.points.push({ t: reading.ts, flowM3h: reading.flowM3h, expectedM3h: expected.m3h, totalM3: reading.totalM3 });
    if (this.points[0]!.t < reading.ts - this.historyMs - 3_600_000) this.points = this.points.filter((p) => p.t >= reading.ts - this.historyMs);
    return this.state;
  }

  /** Расход и ожидаемое для графика: средние по корзинам bucketMs на [fromMs, toMs). */
  history(fromMs: number, bucketMs: number, toMs: number): GasPoint[] {
    const sums = new Map<number, { flow: number; exp: number; n: number }>();
    for (const p of this.points) {
      if (p.t < fromMs || p.t >= toMs) continue;
      const t = fromMs + Math.floor((p.t - fromMs) / bucketMs) * bucketMs;
      const b = sums.get(t) ?? { flow: 0, exp: 0, n: 0 };
      b.flow += p.flowM3h;
      b.exp += p.expectedM3h;
      b.n++;
      sums.set(t, b);
    }
    return [...sums].map(([t, b]) => ({ t, flowM3h: b.flow / b.n, expectedM3h: b.exp / b.n }));
  }

  /** Объём за период по счётному механизму, м³ (в пределах хранимой истории). */
  volume(fromMs: number, toMs: number): number {
    const inRange = this.points.filter((p) => p.t >= fromMs && p.t <= toMs);
    return inRange.length ? inRange[inRange.length - 1]!.totalM3 - inRange[0]!.totalM3 : 0;
  }

  /** Проверка «нет связи»: счётчик молчит дольше offlineAfterSec. Последние тревоги остаются видны. */
  tick(now: number): GasState {
    const last = this.state.lastReading;
    if (last && this.state.level !== 'offline' && now - last.ts > this.gas.offlineAfterSec * 1000) this.state = { ...this.state, level: 'offline' };
    return this.state;
  }

  /** Отметить, держится ли условие; вернуть начало непрерывного отрезка или null. */
  private hold(kind: GasAlertKind, cond: boolean, ts: number): number | null {
    if (!cond) {
      this.holding.delete(kind);
      return null;
    }
    if (!this.holding.has(kind)) this.holding.set(kind, ts);
    return this.holding.get(kind)!;
  }
}

function worst(alerts: GasAlert[]): GasState['level'] {
  return alerts.some((a) => a.level === 'critical') ? 'critical' : alerts.length ? 'warning' : 'ok';
}
