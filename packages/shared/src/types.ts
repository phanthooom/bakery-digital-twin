/** Типы, общие для симулятора, API и web. */
import type { MaterialConfig, ProductConfig } from './inventory';
import type { VehicleConfig } from './logistics';
import type { GasConfig } from './gas';

export type StageId = string;

export type MachineKind = 'mixer' | 'moulder' | 'conveyor' | 'proofer' | 'oven' | 'icemaker' | 'blastfreezer' | 'coldroom' | 'packer' | 'silo' | 'hvac' | 'generic';

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
  /** Этаж размещения: 1 — цех (отметка 0.0 м), 2 — антресоль/мезонин (+3.2 м). По умолчанию 1. */
  floor?: 1 | 2;
  /** Идентификатор счётчика (ESP32), который шлёт данные по этому станку. */
  meterId?: string;
  /** Путь к GLB-модели (например `/models/oven.glb`). null — процедурная форма. */
  model?: string | null;
  /** Масштаб GLB-модели. */
  modelScale?: number;
  /** Линия питания от щита. Не задано — автомат и кабель подбираются по номиналу. */
  feeder?: { id?: string; breakerA?: number; cable?: string };
  /** Номинальный расход газа горелкой, м³/ч. Не задано — станок газ не берёт. */
  gasM3h?: number;
  /** Технологический климат: целевая температура и влажность. */
  climate?: ClimateSpec;
}

export type ClimateKind = 'oven' | 'proofer' | 'blastfreezer' | 'coldroom';

export interface ClimateSpec {
  mode: ClimateKind;
  targetTempC: number;
  minTempC: number;
  maxTempC: number;
  targetHumidityPct?: number;
  minHumidityPct?: number;
  maxHumidityPct?: number;
  hasCoreTemp?: boolean;
  targetCoreTempC?: number;
}

/** Точка на полу цеха: [x, z], м. */
export type FloorPoint = [number, number];

/** Прямоугольник на полу цеха, м: от (x0, z0) до (x1, z1). */
export interface FloorRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface StageConfig {
  id: StageId;
  order: number;
  label: string;
  name: string;
  /** Зона этапа на полу цеха. */
  zone: FloorRect;
}

/**
 * Персонал: у станков (at) — стоит перед станком (side — сдвиг вдоль его фронта, м) лицом к нему,
 * если станков несколько — ходит между ними; или на месте без станка (spot) — весовая, мойка, офис.
 */
export interface StaffConfig {
  role: string;
  at?: string[];
  side?: number;
  /** Место и куда смотреть (градусы вокруг вертикали; 0 — к двору, +z). */
  spot?: { x: number; z: number; faceDeg: number };
}

export const AREA_KINDS = ['weighing', 'ovenQueue', 'cooling', 'washing', 'office', 'amenities', 'controlRoom'] as const;
/** Помещение или участок без счётчиков: весовая, тележки перед печами, остывание, мойка, офис мастера, бытовые, диспетчерская. */
export type AreaKind = (typeof AREA_KINDS)[number];

export interface AreaConfig {
  id: string;
  kind: AreaKind;
  label: string;
  zone: FloorRect;
}

/** Силос бестарного хранения муки на 2-м этаже (мезонине). */
export interface SiloConfig {
  id: string;
  name: string;
  /** Сорт муки: например "Мука пшеничная в/с", "Мука 1/с", "Мука ржаная". */
  grade: string;
  capacityTons: number;
  currentTons: number;
  position: { x: number; z: number };
  diameter: number;
  height: number;
  /** К каким тестомесам спускаются пневмотрубы подачи. */
  connectedMixers: string[];
}

/** Площадка / настил на антресоли. */
export interface MezzanineDeckConfig {
  id: string;
  name: string;
  zone: FloorRect;
}

/** Лестница на мезонин. */
export interface MezzanineStairConfig {
  id: string;
  from: [number, number];
  to: [number, number];
  width: number;
}

/** Инженерная установка ПВУ / рекуперации тепла. */
export interface HvacUnitConfig {
  id: string;
  name: string;
  position: { x: number; z: number };
  airflowM3h: number;
  heatRecoveryKw: number;
  efficiencyPct: number;
}

/** Конфигурация 2-го этажа (мезонина / антресоли). */
export interface MezzanineConfig {
  /** Высота отметки чистого пола 2-го этажа, м (обычно +3.2 м). */
  elevationY: number;
  /** Толщина перекрытия/настила с балками, м. */
  floorThickness: number;
  /** Настилы и площадки антресоли. */
  decks: MezzanineDeckConfig[];
  /** Лестничные марши. */
  stairs: MezzanineStairConfig[];
  /** Смотровой инспекционный мостик (Catwalk) с перилами. */
  catwalk?: {
    points: FloorPoint[];
    width: number;
  };
  /** Силосы бестарного хранения муки. */
  silos?: SiloConfig[];
  /** Приточно-вытяжная вентиляция с рекуперацией тепла печей. */
  hvac?: HvacUnitConfig;
}

/** Ряд стеллажей: центр ряда, число пролётов по 2,7 м, поворот (0 — ряд вдоль x лицом к +z). */
export interface RackRow {
  x: number;
  z: number;
  bays: number;
  rotationY?: number;
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
  /** Где что стоит. Рампы — у передней стены (z = depth / 2, к двору). */
  layout: {
    /** Место разгрузки поставщика, x. */
    receivingDock: { x: number };
    /** Места отгрузки (по одному на машину). */
    shippingDocks: { x: number }[];
    dryRacks: RackRow;
    goodsRacks: RackRow;
    /** Тележки с продукцией, ждущей упаковки. */
    packingQueue: { x: number; z: number };
    /** Маршруты рабочих с рохлями: туда-обратно по точкам; offset — сдвиг по времени, с. */
    routes?: { points: FloorPoint[]; offset: number }[];
  };
}

export interface SiteConfig {
  site: {
    name: string;
    timezone: string;
    /** Корпус: x от −width/2 до width/2, z от −depth/2 (задняя стена) до depth/2 (к двору); колонны — сетка по осям. */
    hall: { width: number; depth: number; height: number; columns?: { xs: number[]; zs: number[] } };
    /** Линия потока продукции по полу: от приёмки до отгрузки. */
    flow?: FloorPoint[];
    /** Вывеска на стене цеха и логотип в шапке. logo — путь к SVG/PNG в web/public (например /brand/logo.svg). */
    brand?: { name: string; tagline?: string; color?: string; logo?: string | null };
  };
  /** Электроснабжение цеха: щит, от которого идут линии к станкам. */
  power?: {
    panel: { id: string; name: string; inputBreakerA: number; position: { x: number; z: number } };
    /** Кабельный лоток под потолком — ломаная по полу цеха; кабели идут от щита по нему к станкам. */
    tray?: FloorPoint[];
  };
  /** Учёт энергии в деньгах. */
  energy?: EnergyConfig;
  /** Газ: счётчик на вводе, сигнализатор загазованности, пороги выявления утечки. */
  gas?: GasConfig;
  /** Цепочка: приёмка сырья → производство → упаковка → склад готовой продукции → доставка. */
  supply?: SupplyConfig;
  thresholds: Thresholds;
  stages: StageConfig[];
  equipment: EquipmentConfig[];
  /** Персонал на рабочих местах. */
  staff?: StaffConfig[];
  /** Участки и помещения без счётчиков. */
  areas?: AreaConfig[];
  /** Второй этаж (антресоль / мезонин): отметка +3.2 м, лестницы, силосы муки, диспетчерская SCADA. */
  mezzanine?: MezzanineConfig;
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
  /** Температура в камере/зоне, °C. */
  temperatureC?: number;
  /** Заданная целевая уставка температуры, °C. */
  targetTempC?: number;
  /** Относительная влажность, %. */
  humidityPct?: number;
  /** Заданная целевая влажность, %. */
  targetHumidityPct?: number;
  /** Температура в сердцевине продукта (для шоковой заморозки), °C. */
  coreTempC?: number;
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

export type ClimateStatus = 'ok' | 'warning' | 'critical' | 'off';

export interface ClimateState {
  temperatureC: number | null;
  targetTempC: number | null;
  humidityPct: number | null;
  targetHumidityPct: number | null;
  coreTempC: number | null;
  status: ClimateStatus;
  alert: string | null;
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
  climate?: ClimateState;
  updatedAt: number;
}

export interface PowerPoint {
  t: number;
  kw: number;
}

