import { describe, expect, it } from 'vitest';
import { binTable, nearestIndex, niceMax, splitByGaps } from './chartMath';

const MIN = 60_000;

describe('splitByGaps', () => {
  it('разрывает линию там, где не было данных дольше порога (нет связи)', () => {
    const pts = [0, 1, 2, 10, 11].map((m) => ({ t: m * MIN, kw: m }));
    expect(splitByGaps(pts, 3 * MIN).map((s) => s.map((p) => p.kw))).toEqual([[0, 1, 2], [10, 11]]);
  });
  it('пустой ввод', () => {
    expect(splitByGaps([], MIN)).toEqual([]);
  });
});

describe('nearestIndex', () => {
  const pts = [0, 10, 20, 30].map((m) => ({ t: m * MIN, kw: 1 }));
  it('ближайшая точка по времени', () => {
    expect(nearestIndex(pts, 14 * MIN)).toBe(1);
    expect(nearestIndex(pts, 16 * MIN)).toBe(2);
    expect(nearestIndex(pts, -5)).toBe(0);
    expect(nearestIndex(pts, 99 * MIN)).toBe(3);
  });
  it('пустой ввод → -1', () => {
    expect(nearestIndex([], 0)).toBe(-1);
  });
});

describe('niceMax', () => {
  it('верх шкалы покрывает пик и номинал с запасом', () => {
    expect(niceMax(1.08, 1)).toBeCloseTo(1.188);
    expect(niceMax(20, 36)).toBeCloseTo(39.6);
    expect(niceMax(0, 0)).toBe(1);
  });
});

describe('binTable (табличное представление графика)', () => {
  it('среднее и максимум по интервалам', () => {
    const pts = [
      { t: 0, kw: 1 },
      { t: 10 * MIN, kw: 3 },
      { t: 30 * MIN, kw: 5 },
    ];
    expect(binTable(pts, 30 * MIN)).toEqual([
      { t: 0, avg: 2, max: 3 },
      { t: 30 * MIN, avg: 5, max: 5 },
    ]);
  });
});
