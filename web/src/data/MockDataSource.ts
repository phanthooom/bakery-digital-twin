import { EnergyLedger, FAULTS, MachineSim, TwinEngine, type EnergyEntry, type EquipmentState, type FaultType, type SiteConfig } from '@bakery/shared';
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
  /** За сколько суток держать журнал энергии (кВт·ч по часам) для отчётов по сменам/дням/месяцам. */
  energyDays?: number;
}

/** Шаг модели для старой части журнала энергии (дальше, чем прогон базовой линии). */
const ARCHIVE_STEP = 5 * MIN;

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
  private readonly ledger = new EnergyLedger();
  private warmupFrom = 0;
  private archived = false;
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
    // журнал энергии непрерывен с того, что раньше: прогона базовой линии или подробной истории
    this.warmupFrom = Math.min(now - days * 24 * HOUR, detailFrom);
    for (let t = this.warmupFrom; t < detailFrom; t += MIN) {
      for (const sim of this.sims) {
        const r = sim.tick(t, MIN);
        if (r) {
          this.engine.seedBaseline(r.equipmentId, r.ts, r.powerKw);
          this.ledger.add(r.equipmentId, t, t + MIN, r.powerKw);
        }
      }
    }
    for (let t = detailFrom; t < now; t += this.intervalMs) {
      for (const sim of this.sims) {
        const r = sim.tick(t, this.intervalMs);
        if (r) {
          this.engine.ingest(r, t);
          this.ledger.add(r.equipmentId, t, t + this.intervalMs, r.powerKw);
        }
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
      if (r) {
        this.engine.ingest(r, now);
        this.ledger.add(r.equipmentId, now - this.intervalMs, now, r.powerKw);
      }
    }
    this.engine.tick(now);
    this.notify();
  }

  /** Старая часть журнала (старше прогона базовой линии) — моделью с шагом 5 мин, один раз по запросу. */
  private archive(): void {
    if (this.archived) return;
    this.archived = true;
    const from = Date.now() - (this.opts.energyDays ?? 31) * 24 * HOUR;
    const sims = this.config.equipment.map(
      (eq) => new MachineSim(eq, { rng: Math.random, timezone: this.config.site.timezone, faultsPerHour: this.opts.faultsPerHour ?? 0.6 }),
    );
    for (let t = from; t < this.warmupFrom; t += ARCHIVE_STEP) {
      for (const sim of sims) {
        const r = sim.tick(t, ARCHIVE_STEP);
        if (r) this.ledger.add(r.equipmentId, t, Math.min(t + ARCHIVE_STEP, this.warmupFrom), r.powerKw);
      }
    }
  }

  async getEnergy(fromMs: number, toMs: number): Promise<EnergyEntry[]> {
    this.warmup();
    if (fromMs < this.warmupFrom) this.archive();
    return this.ledger.entries(fromMs, toMs);
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
