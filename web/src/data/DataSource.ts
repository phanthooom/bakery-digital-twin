import type { SupplySnapshot } from './mockSupply';
import type { EnergyEntry, FaultType, EquipmentState, GasEvent, GasPoint, GasState, PowerPoint, SiteConfig, StatusChange, TelegramOrder } from '@bakery/shared';

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
  /** Газ на вводе: расход, ожидаемое по горелкам, загазованность, тревоги. null — газа в конфиге нет. */
  getGas?(): GasState | null;
  /** Расход и ожидаемое для графика за hours часов. */
  getGasHistory?(hours: number, bucketMs?: number): GasPoint[];
  /** Объём газа за период, м³ (по счётному механизму). */
  getGasVolume?(fromMs: number, toMs: number): number;
  /** Только для демо: утечка газа. */
  simulateGas?(type: GasEvent): void;
  /** Передать заказ из Telegram (для отображения на станках, списания сырья и отгрузки). */
  dispatchTelegramOrder?(order: TelegramOrder): void;
  /** Подписка на уведомления о заказах из Telegram */
  onTelegramOrder?(listener: (order: TelegramOrder) => void): () => void;
  /**
   * «Машина времени»: показывать цех в момент t (null — вживую). Пока курсор в прошлом, getStates и getHistory
   * отдают прошлое — сцена, карточки и шапка перематываются без своих правок. Живой источник возьмёт это из InfluxDB.
   */
  setTimeCursor?(t: number | null): void;
  /** Смены статуса станков в [fromMs, toMs] — риски аварий на шкале времени. */
  getStatusChanges?(fromMs: number, toMs: number): StatusChange[];
  /** За какой период есть подробная история (куда можно перемотать). */
  getHistoryWindow?(): { fromMs: number; toMs: number };
}
