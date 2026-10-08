import { describe, expect, it } from 'vitest';
import { imbalancePct, pctOfNominal, ratedCurrentA } from './electrical';

describe('imbalancePct (NEMA: макс. отклонение от среднего / среднее)', () => {
  it('совпадает с примером из демо: 1.03 / 2.25 / 0.24 А → 92 %', () => {
    expect(imbalancePct([1.03, 2.25, 0.24])).toBeCloseTo(91.8, 1);
  });

  it('совпадает с примером из демо: 2.65 / 4.42 / 3.02 А → 31 %', () => {
    expect(imbalancePct([2.65, 4.42, 3.02])).toBeCloseTo(31.4, 1);
  });

  it('равные токи → 0 %', () => {
    expect(imbalancePct([5, 5, 5])).toBe(0);
  });

  it('обрыв фазы даёт 100 %', () => {
    expect(imbalancePct([10, 10, 0])).toBeCloseTo(100, 5);
    expect(imbalancePct([10, 0, 0])).toBeCloseTo(200, 5);
  });

  it('однофазный станок → null', () => {
    expect(imbalancePct([4.91])).toBeNull();
  });

  it('станок обесточен (все токи ~0) → null, а не деление на ноль', () => {
    expect(imbalancePct([0, 0, 0])).toBeNull();
    expect(imbalancePct([0.01, 0, 0.02])).toBeNull();
  });
});

describe('ratedCurrentA', () => {
  // Ожидаемые значения — из таблиц номинальных токов (400 В, cos φ 0,9 и 230 В, cos φ 0,9)
  it('печь 36 кВт, 3 фазы 400 В → ≈ 57,7 А на фазу', () => {
    expect(ratedCurrentA(36, 3)).toBeCloseTo(57.74, 2);
  });

  it('льдогенератор 1 кВт, 1 фаза 230 В → ≈ 4,83 А', () => {
    expect(ratedCurrentA(1, 1)).toBeCloseTo(4.83, 2);
  });
});

describe('pctOfNominal', () => {
  it('считает процент от номинала', () => {
    expect(pctOfNominal(0.77, 1)).toBeCloseTo(77);
    expect(pctOfNominal(34.56, 36)).toBeCloseTo(96);
  });

  it('при некорректном номинале → null', () => {
    expect(pctOfNominal(1, 0)).toBeNull();
  });
});
