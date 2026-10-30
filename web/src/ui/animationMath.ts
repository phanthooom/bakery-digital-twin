/**
 * animationMath.ts — чистые функции интерполяции, геометрии и форматирования для моушн-дизайна VeloHub (Стык 8).
 */

export type FloorTabKey = 'all' | 1 | 2 | 3 | 4;

export const FLOOR_TABS: readonly FloorTabKey[] = ['all', 1, 2, 3, 4] as const;

export interface PillOffset {
  left: number;
  width: number;
  activeIndex: number;
}

/**
 * Численное вычисление координаты кубической кривой Безье для одного параметра u.
 */
function bezierCoord(u: number, p1: number, p2: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  const inv = 1 - u;
  const inv2 = inv * inv;
  return 3 * inv2 * u * p1 + 3 * inv * u2 * p2 + u3;
}

/**
 * Производная по u от кубической кривой Безье.
 */
function bezierDeriv(u: number, p1: number, p2: number): number {
  const inv = 1 - u;
  return 3 * inv * inv * p1 + 6 * inv * u * (p2 - p1) + 3 * u * u * (1 - p2);
}

/**
 * Пружинная кривая интерполяции VeloHub: cubic-bezier(0.16, 1, 0.3, 1).
 * Быстрый старт и мягкое доведение без перелётов, идеальна для UI-панелей и скользящих табов.
 *
 * @param t Нормализованное время от 0.0 до 1.0
 * @returns Значение интерполированного прогресса от 0.0 до 1.0
 */
export function velohubSpring(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const p1x = 0.16;
  const p1y = 1.0;
  const p2x = 0.3;
  const p2y = 1.0;

  // Решение уравнения x(u) = t методом Ньютона-Рафсона (5 итераций)
  let u = t;
  for (let i = 0; i < 5; i++) {
    const x = bezierCoord(u, p1x, p2x);
    const dx = bezierDeriv(u, p1x, p2x);
    if (Math.abs(dx) < 1e-6) break;
    u -= (x - t) / dx;
    if (u < 0) u = 0;
    else if (u > 1) u = 1;
  }

  return bezierCoord(u, p1y, p2y);
}

/**
 * Форматирование значений для числового одометра с поддержкой tabular-nums и десятичной запятой.
 */
export function formatOdometer(val: number, decimals = 0): string {
  if (!Number.isFinite(val)) return '—';
  if (decimals <= 0) {
    return String(Math.round(val));
  }
  return val.toFixed(decimals).replace('.', ',');
}

/**
 * Расчёт горизонтального смещения и ширины скользящей плашки-индикатора для вкладок этажей.
 */
export function getSlidingPillOffset(
  activeFloor: FloorTabKey,
  measurements: Partial<Record<FloorTabKey, { left: number; width: number }>>,
): PillOffset {
  const activeIndex = FLOOR_TABS.indexOf(activeFloor);
  const current = measurements[activeFloor];
  if (!current || current.width <= 0) {
    return {
      left: 0,
      width: 0,
      activeIndex: Math.max(0, activeIndex),
    };
  }

  return {
    left: Math.round(current.left),
    width: Math.round(current.width),
    activeIndex,
  };
}
