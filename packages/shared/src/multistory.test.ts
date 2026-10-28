import { describe, expect, it } from 'vitest';
import {
  FLOOR_ELEVATIONS,
  FLOORS_INFO,
  getExplodedFloorOffset,
  getFloorElevation,
  isFloorVisible,
} from './multistory';

describe('FLOOR_ELEVATIONS — отметки уровней перекрытий', () => {
  it('проектные отметки этажей: 1 эт = 0.0 м, 2 эт = 3.2 м, 3 эт = 6.4 м, 4 эт = 9.6 м', () => {
    expect(FLOOR_ELEVATIONS[1]).toBe(0.0);
    expect(FLOOR_ELEVATIONS[2]).toBe(3.2);
    expect(FLOOR_ELEVATIONS[3]).toBe(6.4);
    expect(FLOOR_ELEVATIONS[4]).toBe(9.6);
  });

  it('FLOORS_INFO содержит метаданные для всех 4 этажей цеха', () => {
    expect(FLOORS_INFO).toHaveLength(4);
    expect(FLOORS_INFO[0]!.floor).toBe(1);
    expect(FLOORS_INFO[2]!.name).toBe('3-й этаж');
    expect(FLOORS_INFO[3]!.title).toContain('Кровля-энергоцентр');
  });
});

describe('getExplodedFloorOffset — расчёт раскрытия слоев (Exploded View)', () => {
  it('при factor = 0 смещение всех уровней равно нулю', () => {
    expect(getExplodedFloorOffset(1, 0)).toBe(0);
    expect(getExplodedFloorOffset(2, 0)).toBe(0);
    expect(getExplodedFloorOffset(3, 0)).toBe(0);
    expect(getExplodedFloorOffset(4, 0)).toBe(0);
  });

  it('при factor = 1 каждый следующий этаж смещается вверх с шагом spacing (по умолч. 5.0 м)', () => {
    expect(getExplodedFloorOffset(1, 1.0)).toBe(0);
    expect(getExplodedFloorOffset(2, 1.0)).toBe(5.0);
    expect(getExplodedFloorOffset(3, 1.0)).toBe(10.0);
    expect(getExplodedFloorOffset(4, 1.0)).toBe(15.0);
  });

  it('при factor = 0.5 смещение пропорционально', () => {
    expect(getExplodedFloorOffset(2, 0.5)).toBe(2.5);
    expect(getExplodedFloorOffset(4, 0.5)).toBe(7.5);
  });

  it('getFloorElevation суммирует базовую отметку и смещение среза', () => {
    // 4 этаж: база 9.6 м + 15.0 м = 24.6 м
    expect(getFloorElevation(4, 1.0, 5.0)).toBeCloseTo(24.6);
    expect(getFloorElevation(1, 1.0, 5.0)).toBe(0.0);
  });
});

describe('isFloorVisible — фильтрация видимости по этажам', () => {
  it('в режиме all без Exploded View показывает только 1-й и 2-й этажи, исключая висящее в воздухе оборудование 3-го и 4-го этажей', () => {
    expect(isFloorVisible(1, 'all', false)).toBe(true);
    expect(isFloorVisible(2, 'all', false)).toBe(true);
    expect(isFloorVisible(3, 'all', false)).toBe(false);
    expect(isFloorVisible(4, 'all', false)).toBe(false);
    expect(isFloorVisible(undefined, 'all', false)).toBe(true);
  });

  it('в режиме all с Exploded View (exploded = true) показывает абсолютно все этажи', () => {
    expect(isFloorVisible(1, 'all', true)).toBe(true);
    expect(isFloorVisible(2, 'all', true)).toBe(true);
    expect(isFloorVisible(3, 'all', true)).toBe(true);
    expect(isFloorVisible(4, 'all', true)).toBe(true);
  });

  it('селектор конкретного этажа фильтрует строго по этажу (с дефолтом floor = 1)', () => {
    expect(isFloorVisible(3, 3)).toBe(true);
    expect(isFloorVisible(2, 3)).toBe(false);
    expect(isFloorVisible(undefined, 1)).toBe(true);
    expect(isFloorVisible(undefined, 4)).toBe(false);
  });
});
