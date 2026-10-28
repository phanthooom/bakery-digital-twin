/** Типы, общие для симулятора, API и web. */
import type { MaterialConfig, ProductConfig } from './inventory';
import type { VehicleConfig } from './logistics';
import type { GasConfig } from './gas';

export type StageId = string;

export type MachineKind =
  | 'mixer'
  | 'moulder'
  | 'conveyor'
  | 'proofer'
  | 'oven'
  | 'icemaker'
  | 'blastfreezer'
  | 'coldroom'
  | 'packer'
  | 'silo'
  | 'hvac'
  | 'chiller'
  | 'solar_inverter'
  | 'generator'
  | 'drycooler'
  | 'generic';

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
  /** Этаж размещения: 1 — цех (0.0 м), 2 — антресоль (+3.2 м), 3 — венткомплекс и лаборатория (+6.4 м), 4 — кровля-СЭС (+9.6 м). По умолчанию 1. */
  floor?: 1 | 2 | 3 | 4;
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

export interface StaffConfig {
  role: string;
  at?: string[];
  side?: number;
  /** Место и куда смотреть (градусы вокруг вертикали; 0 — к двору, +z). */
  spot?: { x: number; z: number; faceDeg: number };
}

export const AREA_KINDS = ['weighing', 'ovenQueue', 'cooling', 'washing', 'office', 'amenities', 'controlRoom'] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

export interface AreaConfig {
  id: string;
  kind: AreaKind;
  label: string;
  zone: FloorRect;
}

/** Силос бестарного хранения муки на антресоли (2-й этаж). */
export interface SiloConfig {
  id: string;
  name: string;
  grade: string;
  capacityTons: number;
  currentTons: number;
  position: { x: number; z: number };
  diameter: number;
  height: number;
  connectedMixers: string[];
}

/** Приточно-вытяжная вентиляция с рекуперацией тепла печей. */
export interface HvacUnitConfig {
  id: string;
  name: string;
  position: { x: number; z: number };
  airflowM3h: number;
  heatRecoveryKw: number;
  efficiencyPct: number;
}

/** Площадка / настил на антресоли. */
export interface MezzanineDeckConfig {
  id: string;
  name: string;
  zone: FloorRect;
}

export interface MezzanineStairConfig {
  id: string;
  from: FloorPoint;
  to: FloorPoint;
  width: number;
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
  catwalk?: {
    points: FloorPoint[];
    width: number;
  };
  silos?: SiloConfig[];
  hvac?: HvacUnitConfig;
}

/* ── 3-й и 4-й этажи (Multistory, HVAC, Solar, Lab) ── */

export interface FloorSpec {
  floor: 1 | 2 | 3 | 4;
  name: string;
  title: string;
  elevationM: number;
  heightM: number;
  description?: string;
}

export interface MultistoryConfig {
  floors: FloorSpec[];
  explodedSpacingM: number;
}

export interface HvacRecoveryConfig {
  id: string;
  airflowM3h: number;
  exhaustTempC: number;
  stackTempC: number;
  recoveryEfficiencyPct: number;
  flueAirflowM3h: number;
}

export interface ChillerPumpsConfig {
  model: string;
  count: number;
  nominalKw: number;
}

export interface ChillerConfig {
  id: string;
  coolingCapacityKw: number;
  cop: number;
  supplyWaterTempC: number;
  returnWaterTempC: number;
  tankVolumeLiters: number;
  pumps?: ChillerPumpsConfig;
}

export interface HvacFloorConfig {
  floor: 3;
  elevationM: number;
  ahu: HvacRecoveryConfig;
  chiller: ChillerConfig;
}

export interface SolarInverterConfig {
  id: string;
  name: string;
  capacityKw: number;
  efficiencyPct: number;
}

export interface SolarConfig {
  floor?: 4;
  installedCapacityKwp: number;
  panelAreaM2: number;
  panelEfficiencyPct: number;
  inverterEfficiencyPct: number;
  tiltDeg: number;
  azimuthDeg: number;
  co2FactorKgPerKwh: number;
  inverters?: SolarInverterConfig[];
  weatherStation?: {
    anemometer: boolean;
    pyranometer: boolean;
    mastHeightM: number;
    hasAviationBeacons: boolean;
  };
}

export interface LabEquipmentItem {
  id: string;
  name: string;
  model?: string;
}

export type FlourGrade = 'extra' | 'first' | 'second';

export interface FarinographData {
  waterAbsorptionPct: number;
  developmentTimeMin: number;
  stabilityMin: number;
  softeningFU: number;
  qualityNumber?: number;
}

export interface FlourSample {
  batchId: string;
  grade: FlourGrade;
  moisturePct: number;
  glutenPct: number;
  glutenIdk: number;
  fallingNumberSec: number;
  ashPct?: number;
  farinograph?: FarinographData;
}

export interface LabConfig {
  floor: 3;
  name: string;
  standards: string[];
  equipment: LabEquipmentItem[];
  sampleFlour?: FlourSample;
}

export interface GeneratorConfig {
  floor: 4;
  id: string;
  name: string;
  capacityKva: number;
  nominalKw: number;
  fuelTankLiters: number;
  fuelConsumptionLh: number;
  cableDropToSwitchboard?: string;
  autoTransferSwitch?: boolean;
}

export interface RackRow {
  x: number;
  z: number;
  bays: number;
  rotationY?: number;
}

export interface AiThresholds {
  windowMin: number;
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

export interface TariffZone {
  name: string;
  from: string;
  to: string;
  coef: number;
}

export interface Tariff {
  from: string;
  pricePerKwh: number;
  basis?: string;
  zones?: TariffZone[];
}

export interface ShiftConfig {
  id: string;
  name: string;
  from: string;
  to: string;
}

export interface EnergyConfig {
  currency: string;
  tariffGroup?: string;
  tariffs: Tariff[];
  shifts: ShiftConfig[];
}

export interface SupplyConfig {
  materials: MaterialConfig[];
  products: ProductConfig[];
  suppliers: Record<string, string>;
  vehicles: VehicleConfig[];
  layout: {
    receivingDock: { x: number };
    shippingDocks: { x: number }[];
    dryRacks: RackRow;
    goodsRacks: RackRow;
    packingQueue: { x: number; z: number };
    routes?: { points: FloorPoint[]; offset: number }[];
  };
}

export interface SiteConfig {
  site: {
    name: string;
    timezone: string;
    hall: { width: number; depth: number; height: number; columns?: { xs: number[]; zs: number[] } };
    flow?: FloorPoint[];
    brand?: { name: string; tagline?: string; color?: string; logo?: string | null };
  };
  power?: {
    panel: { id: string; name: string; inputBreakerA: number; position: { x: number; z: number } };
    tray?: FloorPoint[];
  };
  energy?: EnergyConfig;
  gas?: GasConfig;
  supply?: SupplyConfig;
  thresholds: Thresholds;
  stages: StageConfig[];
  equipment: EquipmentConfig[];
  staff?: StaffConfig[];
  areas?: AreaConfig[];
  mezzanine?: MezzanineConfig;
  multistory?: MultistoryConfig;
  hvacFloor?: HvacFloorConfig;
  solarRoof?: SolarConfig;
  lab?: LabConfig;
  generator?: GeneratorConfig;
}

export interface Reading {
  equipmentId: string;
  ts: number;
  powerKw: number;
  currentsA: number[];
  voltageV?: number[];
  energyKwh?: number;
  powerFactor?: number;
  meterId?: string;
  order?: string;
  temperatureC?: number;
  targetTempC?: number;
  humidityPct?: number;
  targetHumidityPct?: number;
  coreTempC?: number;
}

export type MachineStatus = 'running' | 'idle' | 'alarm' | 'offline';
export type StatusReason = 'no_data' | 'overload' | 'phase_loss' | 'imbalance' | 'ai_anomaly';
export type AiState = 'learning' | 'ok' | 'deviation' | 'anomaly';

export interface AiCheck {
  state: AiState;
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

export interface EquipmentState {
  id: string;
  status: MachineStatus;
  reasons: StatusReason[];
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
