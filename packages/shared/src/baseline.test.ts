import { describe, expect, it } from 'vitest';
import { HourlyBaseline, hourOfDay, median, meanSince } from './baseline';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// 2026-10-08 09:00 по Ташкенту (UTC+5) = 04:00 UTC
const T0 = Date.UTC(2026, 9, 8, 4, 0, 0);

describe('median', () => {
  it('нечётное и чётное количество', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('пустой массив → null', () => {
    expect(median([])).toBeNull();
  });
  it('не меняет исходный массив', () => {
    const a = [3, 1, 2];
    median(a);
    expect(a).toEqual([3, 1, 2]);
  });
});

describe('hourOfDay', () => {
  it('учитывает часовой пояс площадки', () => {
    expect(hourOfDay(T0, 'Asia/Tashkent')).toBe(9);
    expect(hourOfDay(T0, 'UTC')).toBe(4);
  });
  it('полночь — это 0, а не 24', () => {
    expect(hourOfDay(Date.UTC(2026, 9, 7, 19, 0, 0), 'Asia/Tashkent')).toBe(0);
  });
});

describe('meanSince', () => {
  it('среднее по точкам не старше fromMs', () => {
    const pts = [
      { t: T0 - 20 * MIN, kw: 100 },
      { t: T0 - 10 * MIN, kw: 2 },
      { t: T0 - 5 * MIN, kw: 4 },
    ];
    expect(meanSince(pts, T0 - 15 * MIN)).toBe(3);
  });
  it('нет точек в окне → null', () => {
    expect(meanSince([{ t: T0 - HOUR, kw: 1 }], T0 - MIN)).toBeNull();
  });
});

describe('HourlyBaseline', () => {
  const tz = 'Asia/Tashkent';

  it('без истории базовой линии нет', () => {
    const b = new HourlyBaseline({ timezone: tz, historyDays: 7 });
    expect(b.baselineFor(T0)).toEqual({ medianKw: null, samples: 0 });
  });

  it('агрегирует отсчёты в минутные средние', () => {
    const b = new HourlyBaseline({ timezone: tz, historyDays: 7 });
    // вчера 09:10, три отсчёта в одной минуте
    const t = T0 - DAY + 10 * MIN;
    b.add(t, 1);
    b.add(t + 5000, 2);
    b.add(t + 10_000, 3);
    expect(b.baselineFor(T0)).toEqual({ medianKw: 2, samples: 1 });
  });

  it('медиана по тому же часу суток за прошлые дни, другие часы не смешиваются', () => {
    const b = new HourlyBaseline({ timezone: tz, historyDays: 7 });
    for (let d = 1; d <= 3; d++) {
      for (let m = 0; m < 60; m++) {
        b.add(T0 - d * DAY + m * MIN, 10 + d); // 09:xx: 11, 12, 13
        b.add(T0 - d * DAY + HOUR + m * MIN, 99); // 10:xx — не должно влиять
      }
    }
    const res = b.baselineFor(T0 + 30 * MIN);
    expect(res.medianKw).toBe(12);
    expect(res.samples).toBe(180);
  });

  it('медиана устойчива к выбросам', () => {
    const b = new HourlyBaseline({ timezone: tz, historyDays: 7 });
    for (let m = 0; m < 50; m++) b.add(T0 - DAY + m * MIN, 5);
    for (let m = 50; m < 55; m++) b.add(T0 - DAY + m * MIN, 500);
    expect(b.baselineFor(T0).medianKw).toBe(5);
  });

  it('excludeFromMs исключает свежие минуты (текущее окно сравнения)', () => {
    const b = new HourlyBaseline({ timezone: tz, historyDays: 7 });
    for (let m = 0; m < 30; m++) b.add(T0 + m * MIN, 1);
    for (let m = 30; m < 45; m++) b.add(T0 + m * MIN, 50);
    const res = b.baselineFor(T0 + 45 * MIN, T0 + 30 * MIN);
    expect(res).toEqual({ medianKw: 1, samples: 30 });
  });

  it('забывает данные старше historyDays', () => {
    const b = new HourlyBaseline({ timezone: tz, historyDays: 2 });
    b.add(T0 - 3 * DAY, 100);
    b.add(T0 - 1 * DAY, 1);
    b.prune(T0);
    expect(b.baselineFor(T0)).toEqual({ medianKw: 1, samples: 1 });
    expect(b.size).toBe(1);
  });

  it('принимает данные не по порядку (догрузка буфера ESP32)', () => {
    const b = new HourlyBaseline({ timezone: tz, historyDays: 7 });
    b.add(T0 - DAY + 2 * MIN, 3);
    b.add(T0 - DAY + 1 * MIN, 1);
    b.add(T0 - DAY + 2 * MIN + 1000, 5);
    expect(b.baselineFor(T0)).toEqual({ medianKw: 2.5, samples: 2 });
  });

  it('игнорирует нечисловые значения', () => {
    const b = new HourlyBaseline({ timezone: tz, historyDays: 7 });
    b.add(T0 - DAY, Number.NaN);
    expect(b.size).toBe(0);
  });
});
