import { ratedCurrentA } from './electrical';
import type { EquipmentConfig } from './types';

/** Линия питания станка от щита: защитный автомат и кабель. */
export interface Feeder {
  id: string;
  breakerA: number;
  cable: string;
}

/** Стандартный ряд номиналов автоматических выключателей, А. */
const BREAKERS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160];
/** Сечение медного кабеля под автомат (прокладка в лотке), мм². */
const CABLE_MM2: Record<number, number> = { 6: 1.5, 10: 1.5, 16: 2.5, 20: 2.5, 25: 4, 32: 6, 40: 10, 50: 10, 63: 16, 80: 25, 100: 35, 125: 50, 160: 70 };
/** Запас автомата над номинальным током станка. */
const BREAKER_MARGIN = 1.25;

/**
 * Линия питания станка: из equipment.feeder, а чего там нет — подбирается
 * по номинальному току (×1,25, ближайший больший автомат) и типовому сечению.
 */
export function feederFor(eq: EquipmentConfig, index: number): Feeder {
  const need = ratedCurrentA(eq.nominalKw, eq.phases) * BREAKER_MARGIN;
  const breakerA = eq.feeder?.breakerA ?? BREAKERS.find((b) => b >= need) ?? BREAKERS[BREAKERS.length - 1]!;
  const cores = eq.phases === 3 ? 5 : 3;
  const mm2 = CABLE_MM2[breakerA] ?? 70;
  return {
    id: eq.feeder?.id ?? `Л-${String(index).padStart(2, '0')}`,
    breakerA,
    cable: eq.feeder?.cable ?? `${cores}×${String(mm2).replace('.', ',')} мм²`,
  };
}
