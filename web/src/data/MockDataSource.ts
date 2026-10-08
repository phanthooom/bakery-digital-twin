import { FAULTS, MachineSim, TwinEngine, type EquipmentState, type FaultType, type SiteConfig } from '@bakery/shared';
import type { DataSource, HistoryResult } from './DataSource';

const MIN = 60_000;
const HOUR = 60 * MIN;

export interface MockOptions {
  intervalMs?: number;
  /** Сколько суток истории «прожить» заранее для базовой линии ИИ-проверки. */
  warmupDays?: number;
  /** Сколько часов подробной истории (для графика 6 ч). */
  historyHours?: number;
  faultsPerHour?: number;
}

/**
 * Мок-источник: те же модели станков, что и симулятор MQTT, плюс TwinEngine —
 * всё работает в браузере без брокера, API и базы.
 */
export class MockDataSource implements DataSource {
  readonly kind = 'mock' as const;
  private readonly engine: TwinEngine;
  private readonly sims: MachineSim[];
  private readonly listeners = new Set<() => void>();
  private states = new Map<string, EquipmentState>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private offlineTimer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private warmedUp = false;
  private dirty = false;

  constructor(readonly config: SiteConfig, private readonly opts: MockOptions = {}) {
    this.intervalMs = opts.intervalMs ?? 5000;
    this.engine = new TwinEngine(config, { historyHours: (opts.historyHours ?? 6) + 0.5 });
    this.sims = config.equipment.map(
      (eq) => new MachineSim(eq, { rng: Math.random, timezone: config.site.timezone, faultsPerHour: opts.faultsPerHour ?? 0.6 }),
    );
    this.engine.subscribe((s) => {
      // копия при первом изменении в «пачке» — прежний снимок остаётся неизменным для React
      if (!this.dirty) {
        this.states = new Map(this.states);
        this.dirty = true;
      }
      this.states.set(s.id, s);
    });
    for (const s of this.engine.getStates()) this.states.set(s.id, s);
  }

  /** Прогон истории: warmupDays суток с шагом 1 мин (только базовая линия), затем historyHours с шагом 5 с. */
  private warmup(): void {
    if (this.warmedUp) return;
    this.warmedUp = true;
    const now = Date.now();
    const days = this.opts.warmupDays ?? 3;
    const hours = this.opts.historyHours ?? 6;
    const detailFrom = now - hours * HOUR;
    for (let t = now - days * 24 * HOUR; t < detailFrom; t += MIN) {
      for (const sim of this.sims) {
        const r = sim.tick(t, MIN);
        if (r) this.engine.seedBaseline(r.equipmentId, r.ts, r.powerKw);
      }
    }
    for (let t = detailFrom; t < now; t += this.intervalMs) {
      for (const sim of this.sims) {
        const r = sim.tick(t, this.intervalMs);
        if (r) this.engine.ingest(r, t);
      }
      if ((t - detailFrom) % (30 * 1000) < this.intervalMs) this.engine.tick(t);
    }
    this.engine.tick(now);
  }

  start(): void {
    if (this.timer) return;
    this.warmup();
    this.step();
    this.timer = setInterval(() => this.step(), this.intervalMs);
    // «Нет связи» проверяем чаще, чем приходят данные
    this.offlineTimer = setInterval(() => {
      if (this.engine.tick(Date.now()).length) this.notify();
    }, 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.offlineTimer) clearInterval(this.offlineTimer);
    this.timer = null;
    this.offlineTimer = null;
  }

  private step(): void {
    const now = Date.now();
    for (const sim of this.sims) {
      const r = sim.tick(now, this.intervalMs);
      if (r) this.engine.ingest(r, now);
    }
    this.engine.tick(now);
    this.notify();
  }

  private notify(): void {
    this.dirty = false;
    for (const l of this.listeners) l();
  }

  getStates(): ReadonlyMap<string, EquipmentState> {
    return this.states;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getHistory(id: string, hours: number, bucketMs = MIN): HistoryResult {
    const now = Date.now();
    return this.engine.history(id, now - hours * HOUR, bucketMs, now);
  }

  simulate(id: string, type: FaultType): void {
    const sim = this.sims.find((s) => s.eq.id === id);
    if (!sim) return;
    const now = Date.now();
    if (type !== 'comm_loss') sim.forceMode('work', now, 4 * MIN);
    sim.forceFault(type, now, FAULTS[type].demoDurationMs);
    this.step();
  }
}
