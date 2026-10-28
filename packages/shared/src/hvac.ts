/** Плотность воздуха при стандартных условиях, кг/м³. */
export const AIR_DENSITY_KG_M3 = 1.2;
/** Удельная теплоёмкость сухого воздуха, кДж/(кг·К). */
export const AIR_HEAT_CAPACITY_KJ_KG_K = 1.005;
/** Низшая теплотворная способность природного газа в Узбекистане, МДж/м³. */
export const NATURAL_GAS_LHV_MJ_M3 = 33.5;
/** Удельная теплоёмкость воды, кДж/(кг·К). */
export const WATER_HEAT_CAPACITY_KJ_KG_K = 4.186;

export interface HeatRecoveryInput {
  flueAirflowM3h: number;
  exhaustTempC: number;
  stackTempC: number;
  recoveryEfficiencyPct: number;
  airDensityKgM3?: number;
  airHeatCapacityKjKgK?: number;
}

/**
 * Тепловая мощность рекуператора уходящих газов печей:
 * Q = (rho * c_p * V * deltaT * eta) / 3600 [кВт].
 */
export function calculateHeatRecoveryKw(input: HeatRecoveryInput): number {
  const {
    flueAirflowM3h,
    exhaustTempC,
    stackTempC,
    recoveryEfficiencyPct,
    airDensityKgM3 = AIR_DENSITY_KG_M3,
    airHeatCapacityKjKgK = AIR_HEAT_CAPACITY_KJ_KG_K,
  } = input;

  const deltaT = exhaustTempC - stackTempC;
  if (deltaT <= 0 || flueAirflowM3h <= 0 || recoveryEfficiencyPct <= 0) {
    return 0;
  }

  const eta = recoveryEfficiencyPct / 100;
  const massFlowKgS = (flueAirflowM3h * airDensityKgM3) / 3600;
  const qKw = massFlowKgS * airHeatCapacityKjKgK * deltaT * eta;
  return Math.round(qKw * 100) / 100;
}

export interface GasSavingsInput {
  recoveredThermalKw: number;
  gasLhvMjM3?: number; // default 33.5 MJ/m3
  boilerEfficiencyPct?: number; // default 100 (direct heat equivalent), or 90 for replaced boiler
}

/**
 * Эквивалентный часовой объём сэкономленного природного газа (м³/ч):
 * V_gas = (Q_rec * 3.6 МДж) / (LHV * eta_boiler).
 */
export function calculateGasSavedM3h(input: GasSavingsInput): number {
  const {
    recoveredThermalKw,
    gasLhvMjM3 = NATURAL_GAS_LHV_MJ_M3,
    boilerEfficiencyPct = 100,
  } = input;

  if (recoveredThermalKw <= 0 || gasLhvMjM3 <= 0 || boilerEfficiencyPct <= 0) {
    return 0;
  }

  const thermalEnergyPerHourMj = recoveredThermalKw * 3.6;
  const etaBoiler = boilerEfficiencyPct / 100;
  const gasSavedM3h = thermalEnergyPerHourMj / (gasLhvMjM3 * etaBoiler);
  return Math.round(gasSavedM3h * 100) / 100;
}

export interface ChillerMetricsInput {
  electricPowerKw: number;
  coolingCapacityKw?: number;
  nominalCop?: number;
  supplyWaterTempC?: number; // e.g. +2 °C
  returnWaterTempC?: number; // e.g. +12 °C
}

export interface ChillerMetrics {
  electricPowerKw: number;
  coolingPowerKw: number;
  cop: number;
  chilledWaterFlowM3h: number;
  supplyWaterTempC: number;
  returnWaterTempC: number;
}

/**
 * Расчёт параметров чиллерной станции ледяной воды (+2 °C):
 * Холодильный коэффициент COP = Q_cool / P_el,
 * Циркуляционный расход воды V = (Q_cool * 3.6) / (c_w * deltaT) [м³/ч].
 */
export function calculateChillerMetrics(input: ChillerMetricsInput): ChillerMetrics {
  const {
    electricPowerKw,
    coolingCapacityKw,
    nominalCop = 3.8,
    supplyWaterTempC = 2.0,
    returnWaterTempC = 12.0,
  } = input;

  let cop: number;
  let coolingPowerKw: number;

  if (coolingCapacityKw !== undefined && electricPowerKw > 0) {
    coolingPowerKw = coolingCapacityKw;
    cop = Math.round((coolingCapacityKw / electricPowerKw) * 100) / 100;
  } else {
    cop = nominalCop;
    coolingPowerKw = Math.round(electricPowerKw * nominalCop * 100) / 100;
  }

  const deltaT = Math.max(0.1, returnWaterTempC - supplyWaterTempC);
  const waterFlowM3h = coolingPowerKw > 0
    ? (coolingPowerKw * 3.6) / (WATER_HEAT_CAPACITY_KJ_KG_K * deltaT)
    : 0;

  return {
    electricPowerKw,
    coolingPowerKw,
    cop,
    chilledWaterFlowM3h: Math.round(waterFlowM3h * 100) / 100,
    supplyWaterTempC,
    returnWaterTempC,
  };
}
