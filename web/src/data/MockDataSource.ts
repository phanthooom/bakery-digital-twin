import {
  EnergyLedger,
  FAULTS,
  GasMonitor,
  GasSim,
  MachineSim,
  TwinEngine,
  expectedGasFlow,
  findMachinesForOrder,
  formatMachineOrderText,
  resolveOrderProductIds,
  type EnergyEntry,
  type EquipmentState,
  type FaultType,
  type GasEvent,
  type GasPoint,
  type GasState,
  type SiteConfig,
  type StatusChange,
  type TelegramOrder,
  type Trip,
} from '@bakery/shared';
import type { DataSource, HistoryResult } from './DataSource';
import { SupplySim, type SupplySnapshot } from './mockSupply';

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
  private supply: SupplySim | null = null;
  private dirty = false;
  private readonly gas: { sim: GasSim; monitor: GasMonitor } | null;
  private readonly orderListeners = new Set<(order: TelegramOrder) => void>();
  private activeTelegramOrder: TelegramOrder | null = null;
  private activeTelegramOrderUntil = 0;
  private readonly targetOrderMachineIds = new Set<string>();
  private readonly liveTrips: Trip[] = [];
  /** «Машина времени»: момент, который показываем, и снимок станков на него (null — вживую). */
  private cursor: number | null = null;
  private pastStates: Map<string, EquipmentState> | null = null;

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
    this.gas = config.gas
      ? {
          sim: new GasSim(config.gas.meter.id),
          monitor: new GasMonitor(config.gas, config.equipment, { historyHours: (opts.historyHours ?? 6) + 0.5 }),
        }
      : null;
  }

  /** Шаг газа: горелки берут столько, сколько ждём по состоянию печей, счётчик это видит (плюс утечка, если есть). */
  private gasStep(t: number, dtMs: number): void {
    if (!this.gas) return;
    const states = this.engine.getStates();
    const reading = this.gas.sim.tick(t, dtMs, expectedGasFlow(this.config.equipment, states).m3h);
    this.gas.monitor.ingest(reading, states);
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
      this.gasStep(t, this.intervalMs);
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
      const gasBefore = this.gas?.monitor.getState();
      if (this.engine.tick(Date.now()).length || (this.gas && this.gas.monitor.tick(Date.now()) !== gasBefore)) this.notify();
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
        if (this.activeTelegramOrder && now <= this.activeTelegramOrderUntil && this.targetOrderMachineIds.has(r.equipmentId)) {
          r.order = formatMachineOrderText(this.activeTelegramOrder);
        }
        this.engine.ingest(r, now);
        this.ledger.add(r.equipmentId, now - this.intervalMs, now, r.powerKw);
      }
    }
    this.engine.tick(now);
    this.gasStep(now, this.intervalMs);
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

  getSupply(now: number): SupplySnapshot | null {
    if (!this.config.supply) return null;
    if (!this.supply) {
      const days = 10;
      this.supply = new SupplySim(this.config, SupplySim.localMidnight(Date.now() - days * 24 * HOUR, this.config.site.timezone), days);
    }
    const snap = this.supply.snapshot(now);
    if (!this.liveTrips.length) return snap;
    return {
      ...snap,
      trips: [...this.liveTrips, ...snap.trips],
    };
  }

  onTelegramOrder(listener: (order: TelegramOrder) => void): () => void {
    this.orderListeners.add(listener);
    return () => this.orderListeners.delete(listener);
  }

  dispatchTelegramOrder(order: TelegramOrder): void {
    const now = Date.now();
    this.activeTelegramOrder = order;
    this.activeTelegramOrderUntil = now + 5 * MIN;

    const orderText = formatMachineOrderText(order);
    const resolved = resolveOrderProductIds(order.items);
    const machines = findMachinesForOrder(this.config.equipment, resolved.map((r) => r.productId));

    this.targetOrderMachineIds.clear();
    if (machines.mixer) this.targetOrderMachineIds.add(machines.mixer.id);
    if (machines.oven) this.targetOrderMachineIds.add(machines.oven.id);

    // Переводим станки в режим работы и подмешиваем текст заказа
    for (const sim of this.sims) {
      if (this.targetOrderMachineIds.has(sim.eq.id)) {
        sim.forceMode('work', now, 5 * MIN);
        const st = this.engine.getState(sim.eq.id);
        if (st && st.lastReading) {
          st.lastReading.order = orderText;
          this.engine.ingest(st.lastReading, now);
        }
      }
    }

    // Запускаем отгрузку фургона van-1 у рампы: погрузка 45 с -> выезд в рейс
    const massKg = Math.max(10, order.items.reduce((acc, it) => acc + it.quantity * 0.4, 0));
    const trip: Trip = {
      id: `Р-${order.orderId}`,
      vehicleId: 'van-1',
      departAt: now + 45_000,
      returnAt: now + 5 * MIN,
      loadMinutes: 1,
      orders: [
        {
          orderId: order.orderId,
          client: order.clientName || 'Telegram-клиент',
          kg: massKg,
          lat: 41.3111,
          lon: 69.2797,
        },
      ],
    };
    this.liveTrips.unshift(trip);
    if (this.liveTrips.length > 5) this.liveTrips.pop();

    for (const listener of this.orderListeners) {
      try {
        listener(order);
      } catch {
        // изолируем ошибки подписчиков
      }
    }
    this.notify();
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
    return this.pastStates ?? this.states;
  }

  setTimeCursor(t: number | null): void {
    if (t === null) {
      if (this.cursor === null) return;
      this.cursor = null;
      this.pastStates = null;
    } else {
      this.warmup();
      this.cursor = t;
      this.pastStates = new Map(this.engine.statesAt(t).map((s) => [s.id, s]));
    }
    // живые показания продолжают приходить и копиться — просто не показываются, пока курсор в прошлом
    for (const l of this.listeners) l();
  }

  getStatusChanges(fromMs: number, toMs: number): StatusChange[] {
    return this.engine.statusChanges(fromMs, toMs);
  }

  getHistoryWindow(): { fromMs: number; toMs: number } {
    const now = Date.now();
    return { fromMs: now - (this.opts.historyHours ?? 6) * HOUR, toMs: now };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getHistory(id: string, hours: number, bucketMs = MIN): HistoryResult {
    const end = this.cursor ?? Date.now();
    return this.engine.history(id, end - hours * HOUR, bucketMs, end);
  }

  getGas(): GasState | null {
    return this.gas?.monitor.getState() ?? null;
  }

  getGasHistory(hours: number, bucketMs = MIN): GasPoint[] {
    const now = Date.now();
    return this.gas?.monitor.history(now - hours * HOUR, bucketMs, now) ?? [];
  }

  getGasVolume(fromMs: number, toMs: number): number {
    return this.gas?.monitor.volume(fromMs, toMs) ?? 0;
  }

  simulateGas(type: GasEvent): void {
    if (!this.gas) return;
    this.gas.sim.forceEvent(type, Date.now());
    this.step();
  }

  simulate(id: string, type: FaultType): void {
    const sim = this.sims.find((s) => s.eq.id === id);
    if (!sim) return;
    const now = Date.now();
    if (type !== 'comm_loss') sim.forceMode('work', now, 4 * MIN);
    sim.forceFault(type, now, FAULTS[type].demoDurationMs);
    this.step();
  }

  syncProductionStep(stepId: string): void {
    const now = Date.now();
    if (stepId === 'mixing') {
      const mixer = this.sims.find((s) => s.eq.id === 'mixer-1');
      if (mixer) mixer.forceMode('work', now, 45_000);
    } else if (stepId === 'baking') {
      const oven = this.sims.find((s) => s.eq.id === 'oven-1');
      if (oven) oven.forceMode('work', now, 45_000);
    } else if (stepId === 'dispatch') {
      const tripId = `Р-ЦИКЛ-${now.toString().slice(-4)}`;
      if (!this.liveTrips.some((t) => t.id === tripId)) {
        this.liveTrips.unshift({
          id: tripId,
          vehicleId: 'van-1',
          departAt: now + 5000,
          returnAt: now + 5 * MIN,
          loadMinutes: 1,
          orders: [
            {
              orderId: 'ПАРТИЯ-01',
              client: 'Кафе и пекарни города',
              kg: 180,
              lat: 41.3111,
              lon: 69.2797,
            },
          ],
        });
        if (this.liveTrips.length > 5) this.liveTrips.pop();
      }
    }
    this.notify();
  }
}
