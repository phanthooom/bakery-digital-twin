import { describe, expect, it } from 'vitest';
import {
  assessSolarGeneration,
  calculateCo2ReductionKg,
  calculateGreenShare,
  calculatePvPower,
  solarIrradiance,
  solarIrradianceAt,
} from './solar';
import type { SolarConfig } from './types';

const local = (iso: string) => Date.parse(`${iso}+05:00`);

describe('solarIrradiance — расчёт суточной инсоляции', () => {
  it('ночью (до 06:00 и после 19:30) инсоляция равна нулю', () => {
    expect(solarIrradiance(0)).toBe(0);
    expect(solarIrradiance(3.5)).toBe(0);
    expect(solarIrradiance(5.5)).toBe(0);
    expect(solarIrradiance(20.0)).toBe(0);
    expect(solarIrradiance(23.0)).toBe(0);
  });

  it('в солнечный полдень 12:00–13:00 достигается пик ~850–950 Вт/м²', () => {
    const noon = solarIrradiance(12.75);
    expect(noon).toBeGreaterThanOrEqual(850);
    expect(noon).toBeLessThanOrEqual(950);
  });

  it('утром и вечером освещённость плавно нарастает и спадает', () => {
    const morning = solarIrradiance(9.0);
    const noon = solarIrradiance(12.75);
    const evening = solarIrradiance(17.0);

    expect(morning).toBeGreaterThan(200);
    expect(morning).toBeLessThan(noon);
    expect(evening).toBeGreaterThan(200);
    expect(evening).toBeLessThan(noon);
  });

  it('solarIrradianceAt корректно парсит timestamp в часовом поясе Ташкента', () => {
    const tNight = local('2026-10-28T02:00:00');
    const tNoon = local('2026-10-28T12:45:00');
    expect(solarIrradianceAt(tNight)).toBe(0);
    expect(solarIrradianceAt(tNoon)).toBeGreaterThan(850);
  });
});

describe('calculatePvPower — выработка фотоэлектрических панелей', () => {
  it('расчёт мощности генерации P_pv с учётом площади, КПД панелей (21.5%) и инвертора (98%)', () => {
    // G = 900 Вт/м², S = 280 м², eta_pv = 21.5%, eta_inv = 98%
    // P = 900 * 280 * 0.215 * 0.98 / 1000 = 53.07 кВт
    const power = calculatePvPower({
      irradianceWm2: 900,
      panelAreaM2: 280,
      panelEfficiencyPct: 21.5,
      inverterEfficiencyPct: 98.0,
    });
    expect(power).toBeCloseTo(53.07, 1);
  });

  it('при нулевой инсоляции мощность равна 0', () => {
    expect(calculatePvPower({ irradianceWm2: 0, panelAreaM2: 280 })).toBe(0);
  });

  it('ограничивается максимальной мощностью инвертора maxInverterKw', () => {
    const power = calculatePvPower({
      irradianceWm2: 1200,
      panelAreaM2: 350,
      panelEfficiencyPct: 22,
      inverterEfficiencyPct: 98,
      maxInverterKw: 60.0,
    });
    expect(power).toBe(60.0);
  });
});

describe('calculateGreenShare — доля чистой энергии в энергобалансе цеха', () => {
  it('при нулевой генерации доля равна 0 %', () => {
    expect(calculateGreenShare(0, 100)).toBe(0);
  });

  it('вычисляет пропорцию от текущей нагрузки станков', () => {
    expect(calculateGreenShare(50, 100)).toBe(50.0);
    expect(calculateGreenShare(25, 100)).toBe(25.0);
  });

  it('если генерация превышает потребление, доля ограничивается 100 %', () => {
    expect(calculateGreenShare(80, 60)).toBe(100);
  });

  it('при нулевом потреблении цеха и ненулевой СЭС возвращает 100 %', () => {
    expect(calculateGreenShare(30, 0)).toBe(100);
  });
});

describe('calculateCo2ReductionKg — снижение углеродного следа', () => {
  it('100 кВт·ч солнечной генерации предотвращают выброс 45 кг CO₂ (0.45 кг/кВт·ч)', () => {
    expect(calculateCo2ReductionKg(100)).toBe(45.0);
    expect(calculateCo2ReductionKg(0)).toBe(0);
    expect(calculateCo2ReductionKg(250, 0.45)).toBe(112.5);
  });
});

describe('assessSolarGeneration — комплексная сводка СЭС цеха', () => {
  const config: SolarConfig = {
    installedCapacityKwp: 60,
    panelAreaM2: 280,
    panelEfficiencyPct: 21.5,
    inverterEfficiencyPct: 98.0,
    tiltDeg: 15,
    azimuthDeg: 180,
    co2FactorKgPerKwh: 0.45,
  };

  it('в полдень рассчитывает реалистичные показатели генерации и экологии', () => {
    const t = local('2026-10-28T12:30:00');
    const status = assessSolarGeneration(t, 120, config);

    expect(status.irradianceWm2).toBeGreaterThan(800);
    expect(status.powerKw).toBeGreaterThan(45);
    expect(status.greenSharePct).toBeGreaterThan(35);
    expect(status.co2SavedKgPerHour).toBeGreaterThan(20);
  });
});
