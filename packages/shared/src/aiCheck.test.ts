import { describe, expect, it } from 'vitest';
import { aiCheck } from './aiCheck';
import type { AiThresholds } from './types';

const NOW = Date.UTC(2026, 9, 8, 6, 0, 0);
const ai: AiThresholds = { windowMin: 15, minBaselineSamples: 10, deviationWarnPct: 15, anomalyPct: 40, historyDays: 7 };

describe('aiCheck', () => {
  it('мало истории → learning', () => {
    const r = aiCheck({ currentKw: 1, baseline: { medianKw: 1, samples: 3 }, nominalKw: 1, idlePctOfNominal: 10, ai, nowMs: NOW });
    expect(r.state).toBe('learning');
    expect(r.deviationPct).toBeNull();
    expect(r.message).toMatch(/обучение/);
    expect(r.checkedAt).toBe(NOW);
  });

  it('нет текущих данных → learning', () => {
    const r = aiCheck({ currentKw: null, baseline: { medianKw: 1, samples: 100 }, nominalKw: 1, idlePctOfNominal: 10, ai, nowMs: NOW });
    expect(r.state).toBe('learning');
  });

  it('+1,8 % от нормы → ok «в норме»', () => {
    const r = aiCheck({ currentKw: 1.018, baseline: { medianKw: 1, samples: 100 }, nominalKw: 1.2, idlePctOfNominal: 10, ai, nowMs: NOW });
    expect(r.state).toBe('ok');
    expect(r.deviationPct).toBeCloseTo(1.8, 5);
    expect(r.message).toBe('потребление +1,8 % от нормы');
  });

  it('отклонение ровно 0 → «в норме»', () => {
    const r = aiCheck({ currentKw: 2, baseline: { medianKw: 2, samples: 100 }, nominalKw: 4, idlePctOfNominal: 10, ai, nowMs: NOW });
    expect(r.message).toBe('в норме');
  });

  it('от 15 до 40 % → deviation', () => {
    const r = aiCheck({ currentKw: 0.75, baseline: { medianKw: 1, samples: 100 }, nominalKw: 1.2, idlePctOfNominal: 10, ai, nowMs: NOW });
    expect(r.state).toBe('deviation');
    expect(r.deviationPct).toBeCloseTo(-25, 5);
    expect(r.message).toBe('потребление −25,0 % от нормы');
  });

  it('больше 40 % → anomaly', () => {
    const r = aiCheck({ currentKw: 1.6, baseline: { medianKw: 1, samples: 100 }, nominalKw: 1.2, idlePctOfNominal: 10, ai, nowMs: NOW });
    expect(r.state).toBe('anomaly');
    expect(r.message).toBe('аномалия: потребление +60,0 % от нормы');
  });

  it('если в этот час станок обычно простаивает, знаменатель не меньше порога простоя (нет «+2400 %»)', () => {
    // база 0.02 кВт, номинал 36 кВт, порог простоя 10 % = 3.6 кВт → (0.5-0.02)/3.6 = 13.3 %
    const r = aiCheck({ currentKw: 0.5, baseline: { medianKw: 0.02, samples: 100 }, nominalKw: 36, idlePctOfNominal: 10, ai, nowMs: NOW });
    expect(r.deviationPct).toBeCloseTo(13.33, 1);
    expect(r.state).toBe('ok');
  });

  it('возвращает базу и текущее значение для карточки', () => {
    const r = aiCheck({ currentKw: 1.1, baseline: { medianKw: 1, samples: 42 }, nominalKw: 1.2, idlePctOfNominal: 10, ai, nowMs: NOW });
    expect(r.baselineKw).toBe(1);
    expect(r.currentKw).toBe(1.1);
    expect(r.samples).toBe(42);
  });
});
