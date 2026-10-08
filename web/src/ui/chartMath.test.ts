import { describe, expect, it } from 'vitest';
import { binTable, monotonePath, nearestIndex, niceMax, niceTicks, splitByGaps, timeTicks, tzOffsetMs } from './chartMath';

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

describe('niceTicks (деления оси Y)', () => {
  it('круглые деления, верх — ближайший сверху к значению', () => {
    expect(niceTicks(1.155, 3)).toEqual({ max: 1.2, step: 0.4, ticks: [0, 0.4, 0.8, 1.2] });
    expect(niceTicks(39.6, 3)).toEqual({ max: 40, step: 20, ticks: [0, 20, 40] });
  });
  it('больше места по высоте — больше делений', () => {
    expect(niceTicks(1.155, 5).ticks.length).toBeGreaterThan(4);
  });
  it('нулевой ряд — шкала до 1', () => {
    expect(niceTicks(0, 3).max).toBe(1);
  });
});

describe('timeTicks (подписи времени)', () => {
  const H = 3_600_000;
  it('шаг такой, чтобы подписи не слипались', () => {
    expect(timeTicks(0, 6 * H, 300, 0)).toEqual({ step: 2 * H, ticks: [0, 2 * H, 4 * H, 6 * H] });
  });
  it('при приближении шаг мельче', () => {
    expect(timeTicks(0, H, 300, 0).step).toBe(15 * MIN);
  });
  it('круглые часы по местному времени (Ташкент UTC+5)', () => {
    expect(timeTicks(0, 6 * H, 300, 5 * H).ticks).toEqual([H, 3 * H, 5 * H]);
  });
  it('смещение часового пояса считается по IANA-зоне', () => {
    expect(tzOffsetMs('Asia/Tashkent', Date.UTC(2026, 9, 8))).toBe(5 * H);
    expect(tzOffsetMs('UTC', Date.UTC(2026, 9, 8))).toBe(0);
  });
});

describe('monotonePath (сглаженная линия без выбросов)', () => {
  const ctrlYs = (d: string) => [...d.matchAll(/C([^C]+)/g)].map((m) => m[1]!.split(/[ ,]+/).filter(Boolean).map(Number)).map((n) => [n[1]!, n[3]!, n[5]!]);
  it('проходит через все точки', () => {
    const d = monotonePath([[0, 10], [10, 0], [20, 5]]);
    expect(d.startsWith('M0,10')).toBe(true);
    expect(ctrlYs(d).map((c) => c[2])).toEqual([0, 5]);
  });
  it('не уходит выше пика и ниже нуля между точками (нет «ложных» значений)', () => {
    const pts: [number, number][] = [[0, 0], [10, 0], [20, 50], [30, 50], [40, 0]];
    const d = monotonePath(pts);
    for (const [c1, c2] of ctrlYs(d)) {
      expect(c1).toBeGreaterThanOrEqual(0);
      expect(c1).toBeLessThanOrEqual(50);
      expect(c2).toBeGreaterThanOrEqual(0);
      expect(c2).toBeLessThanOrEqual(50);
    }
  });
  it('одна точка — короткий штрих, чтобы её было видно', () => {
    expect(monotonePath([[5, 5]])).toBe('M5,5h1');
  });
});
