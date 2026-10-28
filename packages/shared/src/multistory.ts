import type { FloorSpec } from './types';

/** Типовая высота строительного яруса, м. */
export const FLOOR_HEIGHT_M = 3.2;

/** Высотные отметки перекрытий этажей от чистого пола цеха (0.0 м). */
export const FLOOR_ELEVATIONS: Record<1 | 2 | 3 | 4, number> = {
  1: 0.0,
  2: 3.2,
  3: 6.4,
  4: 9.6,
};

/** Паспортные данные этажей цифрового двойника. */
export const FLOORS_INFO: FloorSpec[] = [
  {
    floor: 1,
    name: '1-й этаж',
    title: 'Основной цех и склад',
    elevationM: 0.0,
    heightM: 3.2,
    description: 'Линия выпечки (печи, формовка, расстойка, шоковая заморозка), упаковочный участок, рампа отгрузки',
  },
  {
    floor: 2,
    name: '2-й этаж',
    title: 'Антресоль / Мезонин',
    elevationM: 3.2,
    heightM: 3.2,
    description: 'Силосы муки бестарного хранения 65 т, инспекционный мостик, диспетчерская SCADA',
  },
  {
    floor: 3,
    name: '3-й этаж',
    title: 'Инженерно-климатический комплекс и QC Lab',
    elevationM: 6.4,
    heightM: 3.2,
    description: 'AHU с пластинчатым рекуператором тепла печей, чиллер ледяной воды +2 °C, лаборатория контроля муки ГОСТ',
  },
  {
    floor: 4,
    name: '4-й этаж',
    title: 'Кровля-энергоцентр СЭС',
    elevationM: 9.6,
    heightM: 2.8,
    description: 'Солнечная электростанция 60 кВт, инверторы, сухие градирни-драйкулеры, метеостанция, ДГУ 250 кВА',
  },
];

/**
 * Расчёт вертикального смещения Exploded View (режим архитектурного среза):
 * При factor = 0 смещение = 0 для всех уровней.
 * При factor = 1 уровни поднимаются с шагом spacingM.
 */
export function getExplodedFloorOffset(floor: 1 | 2 | 3 | 4, factor: number, spacingM = 5.0): number {
  const clampedFactor = Math.max(0, Math.min(1, factor));
  return (floor - 1) * spacingM * clampedFactor;
}

/**
 * Итоговая высота отметки пола с учётом режима Exploded View.
 */
export function getFloorElevation(floor: 1 | 2 | 3 | 4, explodedFactor = 0, spacingM = 5.0): number {
  return FLOOR_ELEVATIONS[floor] + getExplodedFloorOffset(floor, explodedFactor, spacingM);
}

/**
 * Проверка видимости элемента при фильтрации по этажам ('all' | 1 | 2 | 3 | 4).
 * В режиме 'all' без Exploded View отображаются только 1-й и 2-й этажи (цех и антресоль),
 * чтобы оборудование 3-го и 4-го этажей не висело в воздухе над цехом.
 */
export function isFloorVisible(itemFloor: number | undefined, filter: 'all' | 1 | 2 | 3 | 4, exploded = false): boolean {
  if (exploded) return true;
  if (filter === 'all') return (itemFloor ?? 1) <= 2;
  return (itemFloor ?? 1) === filter;
}
