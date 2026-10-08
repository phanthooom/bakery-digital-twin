import { describe, expect, it } from 'vitest';
import { clampViewport, isViewportZoomed } from './useChartViewport';

describe('useChartViewport helpers', () => {
  it('clampViewport ограничивает диапазон в пределах [0, total - 1]', () => {
    // Начало за пределами 0
    expect(clampViewport([-10, 20], 60, 3)).toEqual([0, 30]);

    // Конец за пределами total - 1
    expect(clampViewport([40, 70], 60, 3)).toEqual([29, 59]);

    // Слишком узкий диапазон (< minSpan)
    expect(clampViewport([10, 11], 60, 5)).toEqual([10, 15]);

    // Нормальный корректный диапазон
    expect(clampViewport([10, 30], 60, 3)).toEqual([10, 30]);
  });

  it('clampViewport корректно работает при малом числе точек', () => {
    expect(clampViewport([0, 0], 0, 3)).toEqual([0, 0]);
    expect(clampViewport([0, 0], 1, 3)).toEqual([0, 0]);
    expect(clampViewport([0, 1], 2, 3)).toEqual([0, 1]);
  });

  it('isViewportZoomed определяет активный зум', () => {
    // Полный диапазон: не зуммирован
    expect(isViewportZoomed([0, 59], 60)).toBe(false);

    // Сдвиг начала > 0.02
    expect(isViewportZoomed([5, 59], 60)).toBe(true);

    // Сдвиг конца < total - 1 - 0.02
    expect(isViewportZoomed([0, 50], 60)).toBe(true);

    // Мало точек (total <= 1)
    expect(isViewportZoomed([0, 0], 1)).toBe(false);
  });
});
