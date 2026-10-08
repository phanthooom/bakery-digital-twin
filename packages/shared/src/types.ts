/** Типы, общие для симулятора, API и web. */
import type { MaterialConfig, ProductConfig } from './inventory';
import type { VehicleConfig } from './logistics';

export type StageId = string;

export type MachineKind = 'mixer' | 'moulder' | 'conveyor' | 'proofer' | 'oven' | 'icemaker' | 'blastfreezer' | 'coldroom' | 'packer' | 'generic';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface EquipmentConfig {
  id: string;
  name: string;
  /** Марка/модель для подписи в карточке (не путать с `model`). */
  vendorModel?: string;
  /** Тип процедурной 3D-формы и профиль симулятора. */
  kind: MachineKind;
  stage: StageId;
  nominalKw: number;
  phases: 1 | 3;
  position: Vec3;
  rotationY?: number;
  /** Идентификатор счётчика (ESP32), который шлёт данные по этому станку. */
  meterId?: string;
  /** Путь к GLB-модели (например `/models/oven.glb`). null — процедурная форма. */
  model?: string | null;
  /** Масштаб GLB-модели. */
  modelScale?: number;
  /** Линия питания от щита. Не задано — автомат и кабель подбираются по номиналу. */
  feeder?: { id?: string; breakerA?: number; cable?: string };
}

export interface StageConfig {
  id: StageId;
  order: number;
  label: string;
  name: string;
  xFrom: number;
  xTo: number;
}

export interface AiThresholds {
  /** Окно усреднения текущего потребления, мин. */
  windowMin: number;
  /** Минимум минутных отсчётов в часовой корзине базовой линии. */
  minBaselineSamples: number;
  deviationWarnPct: number;
  anomalyPct: number;
  historyDays: number;
}

export interface Thresholds {
  offlineAfterSec: number;
  idlePctOfNominal: number;
  overloadPctOfNominal: number;
  imbalanceAlarmPct: number;
  imbalanceMinLoadPct: number;
  ai: AiThresholds;
}

/** Зона суток дифференцированного тарифа: цена = базовая × coef (часы по местному времени, HH:MM). */
export interface TariffZone {
  name: string;
  from: string;
  to: string;
  coef: number;
}

/** Тариф на электроэнергию, действующий с даты from (YYYY-MM-DD по местному времени). */
export interface Tariff {
  from: string;
  /** Цена 1 кВт·ч, в валюте energy.currency (для Узбекистана — сум, с НДС). */
  pricePerKwh: number;
  /** Основание: постановление, письмо энергосбыта. */
  basis?: string;
  zones?: TariffZone[];
}

export interface ShiftConfig {
  id: string;
  name: string;
  /** Начало и конец смены по местному времени, HH:MM; конец может быть на следующий день (22:00–06:00). */
  from: string;
  to: string;
}

/** Учёт энергии: тарифы (история изменений) и смены. */
export interface EnergyConfig {
  currency: string;
  /** Тарифная группа потребителя (для подписи; I — крупные, II — остальные юрлица). */
  tariffGroup?: string;
  tariffs: Tariff[];
  shifts: ShiftConfig[];
}

/** Цепочка поставок: сырьё, продукция с рецептурами, поставщики, машины, где что стоит в цехе. */
export interface SupplyConfig {
  materials: MaterialConfig[];
  products: ProductConfig[];
  /** Поставщик по id сырья (для партий прихода). */
  suppliers: Record<string, string>;
  vehicles: VehicleConfig[];
  layout: {
    /** Центр места разгрузки поставщика у переднего края цеха, x. */
    receivingDockX: number;
    /** Места отгрузки (по одному на машину), x. */
    shippingDockXs: number[];
    /** Стеллажи сухого сырья вдоль задней стены: от x до x. */
    dryRacks: { xFrom: number; xTo: number };
    /** Стеллажи готовой продукции: от x до x. */
    goodsRacks: { xFrom: number; xTo: number };
    /** Тележки с продукцией, ждущей упаковки (у упаковочной машины), x. */
    packingQueueX: number;
  };
}

export interface SiteConfig {
  site: {
    name: string;
    timezone: string;
    hall: { width: number; depth: number; height: number };
    /** Вывеска на стене цеха и логотип в шапке. logo — путь к SVG/PNG в web/public (например /brand/logo.svg). */
    brand?: { name: string; tagline?: string; color?: string; logo?: string | null };
  };
  /** Электроснабжение цеха: щит, от которого идут линии к станкам. */
  power?: { panel: { id: string; name: string; inputBreakerA: number; position: { x: number; z: number } } };
  /** Учёт энергии в деньгах. */
  energy?: EnergyConfig;
  /** Цепочка: приёмка сырья → производство → упаковка → склад готовой продукции → доставка. */
  supply?: SupplyConfig;
  thresholds: Thresholds;
  stages: StageConfig[];
  equipment: EquipmentConfig[];
}

/** Нормализованное показание счётчика (после parseReading). */
export interface Reading {
  equipmentId: string;
  /** Время измерения, мс с эпохи (UTC). */
  ts: number;
  powerKw: number;
  /** Токи по фазам, А. Длина 1 (однофазный) или 3. */
  currentsA: number[];
  voltageV?: number[];
  energyKwh?: number;
  powerFactor?: number;
  meterId?: string;
  /** Текущий заказ/партия, если прошивка или MES её передаёт. */
  order?: string;
}

export type MachineStatus = 'running' | 'idle' | 'alarm' | 'offline';

export type StatusReason = 'no_data' | 'overload' | 'phase_loss' | 'imbalance' | 'ai_anomaly';

export type AiState = 'learning' | 'ok' | 'deviation' | 'anomaly';

export interface AiCheck {
  state: AiState;
  /** Отклонение текущего потребления от нормы, %. null — пока нет базовой линии. */
  deviationPct: number | null;
  baselineKw: number | null;
  currentKw: number | null;
  samples: number;
  checkedAt: number;
}

/** Состояние станка, которое API отдаёт фронту. */
export interface EquipmentState {
  id: string;
  status: MachineStatus;
  reasons: StatusReason[];
  /** С какого момента держится текущий статус, мс. */
  statusSince: number;
  lastReading: Reading | null;
  pctOfNominal: number | null;
  imbalancePct: number | null;
  ratedCurrentA: number;
  ai_check: AiCheck;
  updatedAt: number;
}

export interface PowerPoint {
  t: number;
  kw: number;
}

