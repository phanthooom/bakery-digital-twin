import type { AiCheck, AiThresholds } from './types';

export interface AiCheckInput {
  /** Среднее потребление за окно ai.windowMin, кВт. */
  currentKw: number | null;
  baseline: { medianKw: number | null; samples: number };
  nominalKw: number;
  idlePctOfNominal: number;
  ai: AiThresholds;
  nowMs: number;
}

const fmt = (v: number) => {
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${Math.abs(v).toFixed(1).replace('.', ',')}`;
};

/**
 * «ИИ-проверка»: сравнение текущего потребления с нормой (медиана по часу суток).
 * Отклонение считается относительно max(нормы, порога простоя), чтобы в часы,
 * когда станок обычно выключен, небольшое включение не давало тысячи процентов.
 */
export function aiCheck(input: AiCheckInput): AiCheck {
  const { currentKw, baseline, ai, nowMs } = input;
  const base = { baselineKw: baseline.medianKw, currentKw, samples: baseline.samples, checkedAt: nowMs };

  if (currentKw === null || baseline.medianKw === null || baseline.samples < ai.minBaselineSamples) {
    return {
      ...base,
      state: 'learning',
      deviationPct: null,
      message: `обучение: ${baseline.samples} из ${ai.minBaselineSamples} мин истории для этого часа`,
    };
  }

  const floorKw = (input.nominalKw * input.idlePctOfNominal) / 100;
  const denom = Math.max(baseline.medianKw, floorKw, 1e-6);
  const deviationPct = ((currentKw - baseline.medianKw) / denom) * 100;
  const abs = Math.abs(deviationPct);

  if (abs > ai.anomalyPct) {
    return { ...base, state: 'anomaly', deviationPct, message: `аномалия: потребление ${fmt(deviationPct)} % от нормы` };
  }
  const state = abs > ai.deviationWarnPct ? 'deviation' : 'ok';
  const message = abs < 0.5 ? 'в норме' : `потребление ${fmt(deviationPct)} % от нормы`;
  return { ...base, state, deviationPct, message };
}
