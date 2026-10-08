import { describe, expect, it } from 'vitest';
import { fmtAgo, fmtDuration, fmtKw, fmtNum, fmtPct, fmtTime } from './format';

const NB = ' ';

describe('форматирование для карточки (ru-RU)', () => {
  it('fmtNum — десятичная запятая', () => {
    expect(fmtNum(0.77, 2)).toBe('0,77');
    expect(fmtNum(1.5, 2)).toBe('1,50');
    expect(fmtNum(1234.5, 1)).toBe(`1${NB}234,5`);
  });

  it('fmtKw — точность зависит от величины', () => {
    expect(fmtKw(0.7712)).toBe('0,77');
    expect(fmtKw(0.004)).toBe('0,00');
    expect(fmtKw(34.56)).toBe('34,6');
    expect(fmtKw(123.4)).toBe('123');
  });

  it('fmtPct — неразрывный пробел перед %', () => {
    expect(fmtPct(77.4)).toBe(`77${NB}%`);
    expect(fmtPct(1.84, 1)).toBe(`1,8${NB}%`);
  });

  it('fmtDuration', () => {
    expect(fmtDuration(42_000)).toBe(`42${NB}с`);
    expect(fmtDuration(14 * 60_000 + 5000)).toBe(`14${NB}мин`);
    expect(fmtDuration(60 * 60_000)).toBe(`1${NB}ч`);
    expect(fmtDuration(16 * 3_600_000 + 23 * 60_000)).toBe(`16${NB}ч 23${NB}мин`);
    expect(fmtDuration(26 * 3_600_000)).toBe(`1${NB}д 2${NB}ч`);
    expect(fmtDuration(-5)).toBe(`0${NB}с`);
  });

  it('fmtAgo', () => {
    expect(fmtAgo(1000)).toBe('только что');
    expect(fmtAgo(39_000)).toBe(`39${NB}с назад`);
    expect(fmtAgo(16 * 3_600_000 + 23 * 60_000)).toBe(`16${NB}ч 23${NB}мин назад`);
  });

  it('fmtTime — часы и минуты в часовом поясе площадки', () => {
    expect(fmtTime(Date.UTC(2026, 9, 8, 4, 5), 'Asia/Tashkent')).toBe('09:05');
  });
});
