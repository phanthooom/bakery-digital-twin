import { describe, expect, it } from 'vitest';
import { assessFarinograph, assessFlourSample, classifyGlutenIdk } from './lab';
import type { FlourSample } from './types';

describe('classifyGlutenIdk — классификация группы качества клейковины', () => {
  it('I группа (хорошая): 45–75 ед.', () => {
    expect(classifyGlutenIdk(62).group).toBe('I');
    expect(classifyGlutenIdk(45).group).toBe('I');
    expect(classifyGlutenIdk(75).group).toBe('I');
  });

  it('II группа: крепкая (20–44) и слабая (76–100)', () => {
    expect(classifyGlutenIdk(30).group).toBe('II');
    expect(classifyGlutenIdk(85).group).toBe('II');
  });

  it('III группа (неудовлетворительная): < 20 или > 100', () => {
    expect(classifyGlutenIdk(15).group).toBe('III');
    expect(classifyGlutenIdk(105).group).toBe('III');
    expect(classifyGlutenIdk(15).acceptable).toBe(false);
  });
});

describe('assessFlourSample — валидация муки по ГОСТ 26574-2017', () => {
  it('партия высшего сорта с идеальными показателями получает статус approved', () => {
    const sample: FlourSample = {
      batchId: 'B-2026-1028-01',
      grade: 'extra',
      moisturePct: 13.8,
      glutenPct: 29.5,
      glutenIdk: 65,
      fallingNumberSec: 270,
      ashPct: 0.51,
    };
    const assessment = assessFlourSample(sample);
    expect(assessment.status).toBe('approved');
    expect(assessment.reasons).toHaveLength(0);
    expect(assessment.metrics.glutenPct.passed).toBe(true);
  });

  it('превышение критической влажности (> 15 %) приводит к отклонению партии (rejected)', () => {
    const sample: FlourSample = {
      batchId: 'B-2026-1028-02',
      grade: 'extra',
      moisturePct: 15.6,
      glutenPct: 28.5,
      glutenIdk: 60,
      fallingNumberSec: 250,
    };
    const assessment = assessFlourSample(sample);
    expect(assessment.status).toBe('rejected');
    expect(assessment.reasons[0]).toContain('Влажность 15.6 % превышает');
  });

  it('недостаточное количество клейковины (< 28 % для в/с) бракует партию', () => {
    const sample: FlourSample = {
      batchId: 'B-2026-1028-03',
      grade: 'extra',
      moisturePct: 14.0,
      glutenPct: 25.0,
      glutenIdk: 60,
      fallingNumberSec: 250,
    };
    const assessment = assessFlourSample(sample);
    expect(assessment.status).toBe('rejected');
    expect(assessment.metrics.glutenPct.passed).toBe(false);
  });

  it('II группа клейковины переводит партию в статус conditional (условно допущена)', () => {
    const sample: FlourSample = {
      batchId: 'B-2026-1028-04',
      grade: 'extra',
      moisturePct: 14.2,
      glutenPct: 29.0,
      glutenIdk: 85, // II группа слабая
      fallingNumberSec: 250,
    };
    const assessment = assessFlourSample(sample);
    expect(assessment.status).toBe('conditional');
    expect(assessment.metrics.glutenIdk.group).toBe('II');
  });
});

describe('assessFarinograph — анализ фаринограммы Брабендера', () => {
  it('сильная мука: устойчивость >= 7 мин, разжижение <= 50 FU', () => {
    const res = assessFarinograph({
      waterAbsorptionPct: 61.5,
      developmentTimeMin: 3.5,
      stabilityMin: 8.5,
      softeningFU: 40,
    });
    expect(res.strength).toBe('strong');
    expect(res.passed).toBe(true);
  });

  it('средняя мука: устойчивость 4..7 мин, разжижение 50..100 FU', () => {
    const res = assessFarinograph({
      waterAbsorptionPct: 58.0,
      developmentTimeMin: 2.5,
      stabilityMin: 5.2,
      softeningFU: 70,
    });
    expect(res.strength).toBe('medium');
    expect(res.passed).toBe(true);
  });

  it('слабая мука: устойчивость < 4 мин, разжижение > 100 FU', () => {
    const res = assessFarinograph({
      waterAbsorptionPct: 54.0,
      developmentTimeMin: 1.8,
      stabilityMin: 2.2,
      softeningFU: 130,
    });
    expect(res.strength).toBe('weak');
    expect(res.passed).toBe(false);
  });
});
