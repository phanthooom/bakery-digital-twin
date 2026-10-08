import type { SupplySnapshot } from './mockSupply';
import type { EnergyEntry, FaultType, EquipmentState, PowerPoint, SiteConfig } from '@bakery/shared';

export interface HistoryResult {
  points: PowerPoint[];
  peak: PowerPoint | null;
}

/**
 * Источник данных для 3D-сцены и карточек.
 * Сейчас — MockDataSource (всё считается в браузере).
 * Позже — LiveDataSource: REST /api/equipment + WebSocket /ws от API, формат тот же.
 */
export interface DataSource {
  readonly kind: 'mock' | 'live';
  readonly config: SiteConfig;
  start(): void;
  stop(): void;
  getStates(): ReadonlyMap<string, EquipmentState>;
  /** Вызывается при любом изменении состояний. Возвращает функцию отписки. */
  subscribe(listener: () => void): () => void;
  getHistory(id: string, hours: number, bucketMs?: number): HistoryResult;
  /** Журнал энергии: кВт·ч по станкам и часам, начавшимся в [fromMs, toMs). Живой источник возьмёт его из InfluxDB. */
  getEnergy?(fromMs: number, toMs: number): Promise<EnergyEntry[]>;
  /** Цепочка поставок на момент now: остатки, партии, рейсы. Живой источник — учётная система и GPS. */
  getSupply?(now: number): SupplySnapshot | null;
  /** Только для демо: вызвать демо-событие (неисправность модели) на станке. */
  simulate?(id: string, type: FaultType): void;
}
