/** Типы, общие для симулятора, API и web. */

export type StageId = string;

export type MachineKind = 'mixer' | 'moulder' | 'conveyor' | 'proofer' | 'oven' | 'icemaker' | 'blastfreezer' | 'coldroom' | 'generic';

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

export interface SiteConfig {
  site: {
    name: string;
    timezone: string;
    hall: { width: number; depth: number; height: number };
  };
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

