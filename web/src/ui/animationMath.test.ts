import { describe, expect, it } from 'vitest';
import {
  FLOOR_TABS,
  formatOdometer,
  getSlidingPillOffset,
  velohubSpring,
} from './animationMath';

describe('animationMath: чистые функции анимации VeloHub (Стык 8)', () => {
  describe('velohubSpring — пружинная интерполяция cubic-bezier(0.16, 1, 0.3, 1)', () => {
    it('возвращает 0 при t <= 0 и 1 при t >= 1', () => {
      expect(velohubSpring(0)).toBe(0);
      expect(velohubSpring(-0.5)).toBe(0);
      expect(velohubSpring(1)).toBe(1);
      expect(velohubSpring(1.5)).toBe(1);
    });

    it('обеспечивает быстрый старт и мягкое доведение (ease-out spring curve)', () => {
      // при t = 0.5 значение должно быть существенно выше 0.5 (быстрый подхват)
      const mid = velohubSpring(0.5);
      expect(mid).toBeGreaterThan(0.7);
      expect(mid).toBeLessThan(1.0);
    });

    it('монотонно возрастает от 0 до 1', () => {
      let prev = 0;
      for (let t = 0.1; t <= 1.0; t += 0.1) {
        const val = velohubSpring(t);
        expect(val).toBeGreaterThanOrEqual(prev);
        prev = val;
      }
    });
  });

  describe('formatOdometer — форматирование числового барабана', () => {
    it('форматирует целые числа без дробной части', () => {
      expect(formatOdometer(14, 0)).toBe('14');
      expect(formatOdometer(0, 0)).toBe('0');
      expect(formatOdometer(237.4, 0)).toBe('237');
    });

    it('форматирует дробные числа с заданной точностью и запятой', () => {
      expect(formatOdometer(4.2, 1)).toBe('4,2');
      expect(formatOdometer(4.28, 1)).toBe('4,3');
      expect(formatOdometer(0, 1)).toBe('0,0');
    });
  });

  describe('getSlidingPillOffset — расчёт координат скользящей плашки этажей', () => {
    const mockRects: Record<'all' | 1 | 2 | 3 | 4, { left: number; width: number }> = {
      all: { left: 2, width: 42 },
      1: { left: 46, width: 38 },
      2: { left: 86, width: 38 },
      3: { left: 126, width: 38 },
      4: { left: 166, width: 38 },
    };

    it('возвращает корректные координаты для "all"', () => {
      const pill = getSlidingPillOffset('all', mockRects);
      expect(pill).toEqual({ left: 2, width: 42, activeIndex: 0 });
    });

    it('возвращает корректные координаты для каждого числового этажа', () => {
      expect(getSlidingPillOffset(1, mockRects)).toEqual({ left: 46, width: 38, activeIndex: 1 });
      expect(getSlidingPillOffset(2, mockRects)).toEqual({ left: 86, width: 38, activeIndex: 2 });
      expect(getSlidingPillOffset(3, mockRects)).toEqual({ left: 126, width: 38, activeIndex: 3 });
      expect(getSlidingPillOffset(4, mockRects)).toEqual({ left: 166, width: 38, activeIndex: 4 });
    });

    it('возвращает fallback при отсутствии замеров', () => {
      const pill = getSlidingPillOffset('all', {});
      expect(pill.width).toBe(0);
      expect(pill.left).toBe(0);
      expect(pill.activeIndex).toBe(0);
    });

    it('содержит правильный список вкладок FLOOR_TABS', () => {
      expect(FLOOR_TABS).toEqual(['all', 1, 2, 3, 4]);
    });
  });
});
