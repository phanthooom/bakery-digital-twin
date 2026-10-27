import { feederFor, ratedCurrentA, type EquipmentConfig } from '@bakery/shared';

/** Удельное сопротивление меди при рабочей температуре кабеля, Ом·мм²/м. */
const COPPER_RHO = 0.0185;

export interface EquipmentPlacement {
  x: number;
  z: number;
  rotationY: number;
}

export interface CableDropMetrics {
  /** Длина трассы кабеля от щита ЩР-1 до станка, м */
  lengthM: number;
  /** Марка/сечение кабеля по проекту (например, "5×25 мм²") */
  cableLabel: string;
  /** Сечение жилы кабеля по проекту, мм² */
  cableMm2: number;
  /** Номинальный рабочий ток, А */
  currentA: number;
  /** Потеря напряжения на длине кабеля при номинальной нагрузке, В */
  dropV: number;
  /** Потеря напряжения в процентах от номинального (400 В для 3ф, 230 В для 1ф), % */
  dropPct: number;
}

/**
 * Привязка координаты к шагу сетки (по умолчанию 0,5 м) и ограничение габаритами зала цеха
 * с безопасным технологическим отступом от стен.
 */
export function snapAndClamp(
  x: number,
  z: number,
  hall: { width: number; depth: number },
  step = 0.5,
  margin = 1.2,
): { x: number; z: number } {
  const halfW = hall.width / 2 - margin;
  const halfD = hall.depth / 2 - margin;
  const sx = step > 0 ? Math.round(x / step) * step : x;
  const sz = step > 0 ? Math.round(z / step) * step : z;
  const cx = Math.min(halfW, Math.max(-halfW, Number(sx.toFixed(2))));
  const cz = Math.min(halfD, Math.max(-halfD, Number(sz.toFixed(2))));
  return { x: cx === 0 ? 0 : cx, z: cz === 0 ? 0 : cz };
}

/** Поворот угла вокруг оси Y на шаг (по умолчанию +90° = π/2) с нормализацией в диапазон [0, 2π). */
export function rotateStep(rotationY = 0, deltaRad = Math.PI / 2): number {
  const twoPi = Math.PI * 2;
  const next = ((rotationY + deltaRad) % twoPi + twoPi) % twoPi;
  // Округляем до 4 знаков, чтобы 90°/180°/270° были аккуратными в JSON
  return Number(next.toFixed(4));
}

/** Расчёт падения напряжения в кабельной линии станка при заданной длине трассы (м). */
export function calcCableDrop(eq: EquipmentConfig, lengthM: number, index = 1): CableDropMetrics {
  const feeder = feederFor(eq, index);
  const currentA = ratedCurrentA(eq.nominalKw, eq.phases);
  const match = /×\s*([\d,.]+)/.exec(feeder.cable);
  const parsedMm2 = match ? Number(match[1]!.replace(',', '.')) : 6;
  const s = Math.max(1.5, Number.isFinite(parsedMm2) && parsedMm2 > 0 ? parsedMm2 : 6);
  const len = Math.max(0, lengthM);
  // Для 3-фазной линии ΔU = √3 · I · R, для 1-фазной (фаза + ноль) ΔU = 2 · I · R
  const k = eq.phases === 3 ? Math.sqrt(3) : 2;
  const baseVoltage = eq.phases === 3 ? 400 : 230;
  const dropV = (k * currentA * COPPER_RHO * len) / s;
  const dropPct = (dropV / baseVoltage) * 100;
  return {
    lengthM: Number(len.toFixed(2)),
    cableLabel: feeder.cable,
    cableMm2: s,
    currentA: Number(currentA.toFixed(1)),
    dropV: Number(dropV.toFixed(2)),
    dropPct: Number(dropPct.toFixed(2)),
  };
}
