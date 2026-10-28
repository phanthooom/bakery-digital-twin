import { describe, expect, it } from 'vitest';
import { calculateChillerMetrics, calculateGasSavedM3h, calculateHeatRecoveryKw } from './hvac';

describe('calculateHeatRecoveryKw — тепловой баланс рекуператора печей', () => {
  it('расчёт утилизации тепла уходящих дымовых газов: 180 °C -> 65 °C, расход 4500 м³/ч, КПД 76 %', () => {
    // deltaT = 115 K
    // massFlow = 4500 * 1.2 / 3600 = 1.5 кг/с
    // Q = 1.5 * 1.005 * 115 * 0.76 = 131.7555 кВт
    const qKw = calculateHeatRecoveryKw({
      flueAirflowM3h: 4500,
      exhaustTempC: 180,
      stackTempC: 65,
      recoveryEfficiencyPct: 76,
    });
    expect(qKw).toBeCloseTo(131.76, 1);
  });

  it('при нулевом перепаде температур или нулевом расходе тепловая мощность = 0', () => {
    expect(calculateHeatRecoveryKw({ flueAirflowM3h: 4500, exhaustTempC: 60, stackTempC: 65, recoveryEfficiencyPct: 76 })).toBe(0);
    expect(calculateHeatRecoveryKw({ flueAirflowM3h: 0, exhaustTempC: 180, stackTempC: 65, recoveryEfficiencyPct: 76 })).toBe(0);
  });
});

describe('calculateGasSavedM3h — эквивалент сэкономленного природного газа', () => {
  it('сэкономленный газ при низшей теплотворной способности 33.5 МДж/м³', () => {
    // 131.76 кВт * 3.6 = 474.336 МДж/ч
    // V_gas = 474.336 / 33.5 = 14.16 м³/ч
    const gasSaved = calculateGasSavedM3h({
      recoveredThermalKw: 131.76,
      gasLhvMjM3: 33.5,
    });
    expect(gasSaved).toBeCloseTo(14.16, 1);
  });

  it('с учётом замещаемого газового котла с КПД 90 %', () => {
    // 14.16 / 0.9 = 15.73 м³/ч
    const gasSaved = calculateGasSavedM3h({
      recoveredThermalKw: 131.76,
      gasLhvMjM3: 33.5,
      boilerEfficiencyPct: 90,
    });
    expect(gasSaved).toBeCloseTo(15.73, 1);
  });
});

describe('calculateChillerMetrics — параметры чиллера и ледяной воды (+2 °C)', () => {
  it('вычисляет холодильный коэффициент COP = 3.8 при 95 кВт холода и 25 кВт электроэнергии', () => {
    const metrics = calculateChillerMetrics({
      electricPowerKw: 25.0,
      coolingCapacityKw: 95.0,
      supplyWaterTempC: 2.0,
      returnWaterTempC: 12.0,
    });
    expect(metrics.cop).toBeCloseTo(3.8, 1);
    expect(metrics.coolingPowerKw).toBe(95.0);
  });

  it('вычисляет расход циркуляционной ледяной воды по перепаду 10 K (+2 °C -> +12 °C)', () => {
    // V = (95 * 3.6) / (4.186 * 10) = 342 / 41.86 = 8.17 м³/ч
    const metrics = calculateChillerMetrics({
      electricPowerKw: 25.0,
      coolingCapacityKw: 95.0,
      supplyWaterTempC: 2.0,
      returnWaterTempC: 12.0,
    });
    expect(metrics.chilledWaterFlowM3h).toBeCloseTo(8.17, 1);
  });
});
