import { describe, expect, it } from 'vitest';
import { assessLine } from './lineHealth';
import type { Reading, Thresholds } from './types';

const th: Thresholds = {
  offlineAfterSec: 30,
  idlePctOfNominal: 10,
  overloadPctOfNominal: 115,
  imbalanceAlarmPct: 40,
  imbalanceMinLoadPct: 30,
  ai: { windowMin: 15, minBaselineSamples: 10, deviationWarnPct: 15, anomalyPct: 40, historyDays: 7 },
};
// печь 36 кВт, Iн 57,7 А, автомат 80 А
const oven = { feeder: { id: 'Л-07', breakerA: 80, cable: '5×25 мм²' }, phases: 3 as const, nominalKw: 36, thresholds: th };
const r = (currentsA: number[], voltageV = [230, 231, 229], powerKw = 30): Reading => ({ equipmentId: 'oven-1', ts: 0, powerKw, currentsA, voltageV });

describe('assessLine — диагностика линии питания', () => {
  it('обычная работа: линия в норме, загрузка автомата по самой нагруженной фазе', () => {
    const h = assessLine({ ...oven, reading: r([48, 50, 47]), offline: false });
    expect(h.level).toBe('ok');
    expect(h.loadPct).toBeCloseTo(62.5);
    expect(h.problems).toEqual([]);
  });

  it('ток выше 80 % автомата — предупреждение, выше 100 % — авария (автомат может отключить линию)', () => {
    const high = assessLine({ ...oven, reading: r([66, 68, 65]), offline: false });
    expect(high.level).toBe('warning');
    expect(high.problems).toEqual([{ code: 'breaker_high', level: 'warning', value: 85 }]);
    const over = assessLine({ ...oven, reading: r([84, 82, 81]), offline: false });
    expect(over.level).toBe('critical');
    expect(over.problems).toEqual([{ code: 'breaker_overload', level: 'critical', value: 105 }]);
  });

  it('обрыв фазы называется по номеру фазы; сильная несимметрия под нагрузкой — предупреждение', () => {
    const lost = assessLine({ ...oven, reading: r([40, 0.1, 41], [230, 230, 230], 20), offline: false });
    expect(lost.level).toBe('critical');
    expect(lost.problems).toContainEqual({ code: 'phase_loss', level: 'critical', value: 0.1, phase: 2 });
    const skew = assessLine({ ...oven, reading: r([20, 45, 30], [230, 230, 230], 20), offline: false });
    expect(skew.problems).toEqual([{ code: 'imbalance', level: 'warning', value: 42 }]);
  });

  it('напряжение: ниже 207 В (−10 %) — просадка, ниже 195 В — авария; выше 253 В — перенапряжение', () => {
    const sag = assessLine({ ...oven, reading: r([48, 50, 47], [229, 203.4, 230]), offline: false });
    expect(sag.problems).toEqual([{ code: 'undervoltage', level: 'warning', value: 203.4, phase: 2 }]);
    const deep = assessLine({ ...oven, reading: r([48, 50, 47], [190, 192, 191]), offline: false });
    expect(deep.level).toBe('critical');
    expect(deep.problems[0]).toMatchObject({ code: 'undervoltage', level: 'critical', value: 190, phase: 1 });
    const surge = assessLine({ ...oven, reading: r([48, 50, 47], [230, 258, 231]), offline: false });
    expect(surge.problems).toEqual([{ code: 'overvoltage', level: 'warning', value: 258, phase: 2 }]);
  });

  it('тока почти нет — линия под напряжением, но не нагружена (idle); нет связи — offline', () => {
    expect(assessLine({ ...oven, reading: r([0.2, 0.2, 0.3], [230, 230, 230], 0.1), offline: false }).level).toBe('idle');
    expect(assessLine({ ...oven, reading: null, offline: true })).toEqual({ level: 'offline', loadPct: null, problems: [] });
  });
});
