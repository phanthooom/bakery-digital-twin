import { aiCheck } from './aiCheck';
import { HourlyBaseline, meanSince } from './baseline';
import { imbalancePct, pctOfNominal, ratedCurrentA } from './electrical';
import { computeStatus } from './status';
import type { AiCheck, EquipmentConfig, EquipmentState, PowerPoint, Reading, SiteConfig } from './types';

export interface EngineOptions {
  /** Сколько часов сырых точек держать в памяти (для графика 6 ч). */
  historyHours?: number;
  /** Как часто пересчитывать ai_check, мс. */
  aiEveryMs?: number;
}

interface Slot {
  eq: EquipmentConfig;
  state: EquipmentState;
  points: PowerPoint[];
  baseline: HourlyBaseline;
}

export type StateListener = (state: EquipmentState) => void;

/**
 * Ядро цифрового двойника: принимает показания счётчиков и поддерживает состояние станков.
 * Одинаково работает в браузере (мок-источник) и в API (реальные данные из MQTT).
 */
export class TwinEngine {
  private readonly slots = new Map<string, Slot>();
  private readonly listeners = new Set<StateListener>();
  private readonly historyMs: number;
  private readonly aiEveryMs: number;
  private lastPruneAt = 0;

  constructor(readonly config: SiteConfig, opts: EngineOptions = {}) {
    this.historyMs = (opts.historyHours ?? 6.5) * 3_600_000;
    this.aiEveryMs = opts.aiEveryMs ?? 60_000;
    const { timezone } = config.site;
    for (const eq of config.equipment) {
      this.slots.set(eq.id, {
        eq,
        points: [],
        baseline: new HourlyBaseline({ timezone, historyDays: config.thresholds.ai.historyDays }),
        state: {
          id: eq.id,
          status: 'offline',
          reasons: ['no_data'],
          statusSince: 0,
          lastReading: null,
          pctOfNominal: null,
          imbalancePct: null,
          ratedCurrentA: ratedCurrentA(eq.nominalKw, eq.phases),
          ai_check: { state: 'learning', deviationPct: null, baselineKw: null, currentKw: null, samples: 0, checkedAt: 0 },
          updatedAt: 0,
        },
      });
    }
  }

  getState(id: string): EquipmentState | undefined {
    return this.slots.get(id)?.state;
  }

  getStates(): EquipmentState[] {
    return [...this.slots.values()].map((s) => s.state);
  }

  subscribe(fn: StateListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Подмешать историческое значение только в базовую линию (прогрев, загрузка из InfluxDB). */
  seedBaseline(id: string, ts: number, kw: number): void {
    this.slots.get(id)?.baseline.add(ts, kw);
  }

  ingest(reading: Reading, nowMs: number = Date.now()): EquipmentState | null {
    const slot = this.slots.get(reading.equipmentId);
    if (!slot) return null;

    insertSorted(slot.points, { t: reading.ts, kw: reading.powerKw });
    slot.baseline.add(reading.ts, reading.powerKw);
    const cutoff = nowMs - this.historyMs;
    if (slot.points.length && slot.points[0]!.t < cutoff) {
      slot.points.splice(0, lowerBound(slot.points, cutoff));
    }

    const prev = slot.state;
    const isNewest = !prev.lastReading || reading.ts >= prev.lastReading.ts;
    const last = isNewest ? reading : prev.lastReading!;

    let ai = prev.ai_check;
    if (nowMs - ai.checkedAt >= this.aiEveryMs) {
      ai = this.runAi(slot, nowMs);
    }
    if (nowMs - this.lastPruneAt >= 3_600_000) {
      this.lastPruneAt = nowMs;
      for (const s of this.slots.values()) s.baseline.prune(nowMs);
    }

    const next = this.buildState(slot, last, ai, nowMs);
    slot.state = next;
    this.emit(next);
    return next;
  }

  /** Периодическая проверка «нет связи». Возвращает станки, у которых сменился статус. */
  tick(nowMs: number = Date.now()): EquipmentState[] {
    const changed: EquipmentState[] = [];
    for (const slot of this.slots.values()) {
      const prev = slot.state;
      if (prev.status === 'offline' || !prev.lastReading) continue;
      const next = this.buildState(slot, prev.lastReading, prev.ai_check, nowMs);
      if (next.status !== prev.status) {
        if (next.status === 'offline') next.statusSince = prev.lastReading.ts + this.config.thresholds.offlineAfterSec * 1000;
        slot.state = next;
        changed.push(next);
        this.emit(next);
      }
    }
    return changed;
  }

  /** История мощности: средние по корзинам bucketMs и пик по сырым точкам. */
  history(id: string, fromMs: number, bucketMs = 60_000, toMs: number = Date.now()): { points: PowerPoint[]; peak: PowerPoint | null } {
    const slot = this.slots.get(id);
    if (!slot) return { points: [], peak: null };
    const out: PowerPoint[] = [];
    let peak: PowerPoint | null = null;
    let key = Number.NaN;
    let sum = 0;
    let n = 0;
    for (let i = lowerBound(slot.points, fromMs); i < slot.points.length; i++) {
      const p = slot.points[i]!;
      if (p.t > toMs) break;
      if (!peak || p.kw > peak.kw) peak = p;
      const k = Math.floor(p.t / bucketMs) * bucketMs;
      if (k !== key) {
        if (n) out.push({ t: key, kw: sum / n });
        key = k;
        sum = 0;
        n = 0;
      }
      sum += p.kw;
      n++;
    }
    if (n) out.push({ t: key, kw: sum / n });
    return { points: out, peak: peak ? { ...peak } : null };
  }

  private runAi(slot: Slot, nowMs: number): AiCheck {
    const { thresholds } = this.config;
    const windowStart = nowMs - thresholds.ai.windowMin * 60_000;
    return aiCheck({
      currentKw: meanSince(slot.points, windowStart),
      baseline: slot.baseline.baselineFor(nowMs, windowStart, thresholds.ai.windowMin),
      nominalKw: slot.eq.nominalKw,
      idlePctOfNominal: thresholds.idlePctOfNominal,
      ai: thresholds.ai,
      nowMs,
    });
  }

  private buildState(slot: Slot, last: Reading, ai: AiCheck, nowMs: number): EquipmentState {
    const { eq } = slot;
    const prev = slot.state;
    const st = computeStatus({ reading: last, nowMs, nominalKw: eq.nominalKw, phases: eq.phases, thresholds: this.config.thresholds, aiState: ai.state });
    const statusChanged = st.status !== prev.status;
    return {
      ...prev,
      status: st.status,
      reasons: st.reasons,
      statusSince: statusChanged ? Math.min(nowMs, Math.max(last.ts, prev.updatedAt)) : prev.statusSince,
      lastReading: last,
      pctOfNominal: pctOfNominal(last.powerKw, eq.nominalKw),
      imbalancePct: eq.phases === 3 ? imbalancePct(last.currentsA) : null,
      ai_check: ai,
      updatedAt: Math.max(prev.updatedAt, last.ts),
    };
  }

  private emit(state: EquipmentState): void {
    for (const fn of this.listeners) fn(state);
  }
}

/** Индекс первой точки с t >= ts. */
function lowerBound(points: PowerPoint[], ts: number): number {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.t < ts) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function insertSorted(points: PowerPoint[], p: PowerPoint): void {
  if (!points.length || points[points.length - 1]!.t <= p.t) points.push(p);
  else points.splice(lowerBound(points, p.t + 1), 0, p);
}
