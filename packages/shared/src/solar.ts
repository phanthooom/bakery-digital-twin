import { localParts } from './energy';
import type { SolarConfig } from './types';

export const DEFAULT_TASHKENT_LATITUDE_DEG = 41.3;
export const DEFAULT_CO2_FACTOR_KG_PER_KWH = 0.45;

export interface SolarIrradianceOptions {
  latitudeDeg?: number;
  tiltDeg?: number;
  peakIrradianceWm2?: number;
  sunriseHour?: number;
  sunsetHour?: number;
}

/**
 * Расчёт солнечной освещённости (G, Вт/м²) по местному времени в часах (0..24).
 * Ночью (до восхода ~06:00 и после заката ~19:30) освещённость = 0.
 * В полдень (12:30–13:00) достигает пика ~900–920 Вт/м².
 */
export function solarIrradiance(localHour: number, opts: SolarIrradianceOptions = {}): number {
  const rise = opts.sunriseHour ?? 6.0;
  const set = opts.sunsetHour ?? 19.5;
  const peak = opts.peakIrradianceWm2 ?? 920;

  if (localHour <= rise || localHour >= set) {
    return 0;
  }

  const frac = (localHour - rise) / (set - rise);
  const sinVal = Math.sin(frac * Math.PI);
  return Math.round(peak * Math.pow(sinVal, 1.1) * 10) / 10;
}

/** Освещённость по timestamp (мс UTC) с учётом таймзоны (по умолчанию Asia/Tashkent). */
export function solarIrradianceAt(tsMs: number, timezone = 'Asia/Tashkent', opts: SolarIrradianceOptions = {}): number {
  const { minutes } = localParts(tsMs, timezone);
  const hour = minutes / 60;
  return solarIrradiance(hour, opts);
}

export interface SolarPvCalculationInput {
  irradianceWm2: number;
  panelAreaM2: number;
  panelEfficiencyPct?: number; // default 21.5
  inverterEfficiencyPct?: number; // default 98.0
  maxInverterKw?: number;
}

/**
 * Расчёт электрической мощности генерации фотоэлектрических панелей СЭС:
 * P_pv = (G * A * eta_panel * eta_inv) / 1000 [кВт].
 */
export function calculatePvPower(input: SolarPvCalculationInput): number {
  const {
    irradianceWm2,
    panelAreaM2,
    panelEfficiencyPct = 21.5,
    inverterEfficiencyPct = 98.0,
    maxInverterKw,
  } = input;

  if (irradianceWm2 <= 0 || panelAreaM2 <= 0) return 0;

  const etaPanel = panelEfficiencyPct / 100;
  const etaInv = inverterEfficiencyPct / 100;
  const rawKw = (irradianceWm2 * panelAreaM2 * etaPanel * etaInv) / 1000;
  const powerKw = maxInverterKw !== undefined ? Math.min(rawKw, maxInverterKw) : rawKw;
  return Math.round(powerKw * 100) / 100;
}

/**
 * Доля «чистой» солнечной энергии в энергобалансе цеха (Green Energy Share, 0..100 %).
 */
export function calculateGreenShare(pvKw: number, consumedKw: number): number {
  if (pvKw <= 0) return 0;
  if (consumedKw <= 0) return 100;
  const share = (pvKw / consumedKw) * 100;
  return Math.min(100, Math.round(share * 10) / 10);
}

/**
 * Сокращение выбросов CO₂ (кг) за счёт выработки кВт·ч солнечной энергии.
 * Коэффициент энергосистемы Узбекистана: 0.45 кг CO₂/кВт·ч.
 */
export function calculateCo2ReductionKg(energyKwh: number, factorKgPerKwh = DEFAULT_CO2_FACTOR_KG_PER_KWH): number {
  if (energyKwh <= 0) return 0;
  return Math.round(energyKwh * factorKgPerKwh * 100) / 100;
}

export interface SolarStatus {
  irradianceWm2: number;
  powerKw: number;
  greenSharePct: number;
  co2SavedKgPerHour: number;
}

/** Комплексная оценка выработки СЭС цеха на текущий момент. */
export function assessSolarGeneration(
  nowMs: number,
  consumedKw: number,
  config: SolarConfig,
  timezone = 'Asia/Tashkent'
): SolarStatus {
  const irradiance = solarIrradianceAt(nowMs, timezone, {
    tiltDeg: config.tiltDeg,
  });

  const powerKw = calculatePvPower({
    irradianceWm2: irradiance,
    panelAreaM2: config.panelAreaM2,
    panelEfficiencyPct: config.panelEfficiencyPct,
    inverterEfficiencyPct: config.inverterEfficiencyPct,
    maxInverterKw: config.installedCapacityKwp,
  });

  const greenSharePct = calculateGreenShare(powerKw, consumedKw);
  const co2SavedKgPerHour = calculateCo2ReductionKg(powerKw, config.co2FactorKgPerKwh);

  return {
    irradianceWm2: irradiance,
    powerKw,
    greenSharePct,
    co2SavedKgPerHour,
  };
}
