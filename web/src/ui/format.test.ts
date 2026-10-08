import { describe, expect, it } from 'vitest';
import { fmtAgo, fmtAiHeadline, fmtAiLearning, fmtDuration, fmtKw, fmtNum, fmtPct, fmtTime, fmtAxis, fmtMass } from './format';

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

describe('fmtAiHeadline — строка «ИИ: …» в карточке', () => {
  const base = { baselineKw: 1, currentKw: 1, samples: 100, checkedAt: 0 };
  it('мелкое отклонение — «в норме»', () => {
    expect(fmtAiHeadline({ ...base, state: 'ok', deviationPct: 0.2 })).toBe('в норме');
  });
  it('заметное, но обычное — со знаком и одной цифрой после запятой', () => {
    expect(fmtAiHeadline({ ...base, state: 'ok', deviationPct: 1.84 })).toBe(`потребление +1,8${NB}% от нормы`);
    expect(fmtAiHeadline({ ...base, state: 'deviation', deviationPct: -25 })).toBe(`потребление −25,0${NB}% от нормы`);
  });
  it('аномалия — с пометкой', () => {
    expect(fmtAiHeadline({ ...base, state: 'anomaly', deviationPct: 60 })).toBe(`аномалия: потребление +60,0${NB}% от нормы`);
  });
  it('обучение — сколько истории накоплено', () => {
    expect(fmtAiHeadline({ ...base, state: 'learning', deviationPct: null, samples: 3 })).toBe('обучение');
    expect(fmtAiLearning({ ...base, state: 'learning', deviationPct: null, samples: 3 }, 10)).toBe(`накоплено 3 из 10${NB}мин истории для этого часа`);
  });
});

describe('fmtAxis (деления оси графика)', () => {
  it('без лишних нулей', () => {
    expect(fmtAxis(0)).toBe('0');
    expect(fmtAxis(0.4)).toBe('0,4');
    expect(fmtAxis(1.25)).toBe('1,25');
    expect(fmtAxis(40)).toBe('40');
  });
});

describe('fmtMass (остатки на складе)', () => {
  it('кг до тонны, дальше тонны', () => {
    expect(fmtMass(3.4)).toBe('3,4\u00a0кг');
    expect(fmtMass(340)).toBe('340\u00a0кг');
    expect(fmtMass(4180)).toBe('4,2\u00a0т');
    expect(fmtMass(12_400)).toBe('12\u00a0т');
  });
});
