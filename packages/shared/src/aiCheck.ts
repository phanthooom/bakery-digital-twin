import type { AiCheck, AiThresholds } from './types';

export interface AiCheckInput {
  /** Среднее потребление за окно ai.windowMin, кВт. */
  currentKw: number | null;
  /** madKw — разброс нормы (медиана абсолютных отклонений); если задан, мелкие колебания не считаются отклонением. */
  baseline: { medianKw: number | null; madKw?: number | null; samples: number };
  nominalKw: number;
  idlePctOfNominal: number;
  ai: AiThresholds;
  nowMs: number;
}

/** Во сколько σ нужно выйти за норму, чтобы считать это отклонением / аномалией. */
const WARN_SIGMA = 1;
const ANOMALY_SIGMA = 3.5;


/**
 * «ИИ-проверка»: сравнение текущего потребления с нормой (медиана по часу суток).
 * Отклонение считается относительно max(нормы, порога простоя), чтобы в часы,
 * когда станок обычно выключен, небольшое включение не давало тысячи процентов.
 */
export function aiCheck(input: AiCheckInput): AiCheck {
  const { currentKw, baseline, ai, nowMs } = input;
  const base = { baselineKw: baseline.medianKw, currentKw, samples: baseline.samples, checkedAt: nowMs };

  if (currentKw === null || baseline.medianKw === null || baseline.samples < ai.minBaselineSamples) {
    return { ...base, state: 'learning', deviationPct: null };
  }

  const floorKw = (input.nominalKw * input.idlePctOfNominal) / 100;
  const denom = Math.max(baseline.medianKw, floorKw, 1e-6);
  const deviationPct = ((currentKw - baseline.medianKw) / denom) * 100;
  const abs = Math.abs(deviationPct);
  // σ ≈ 1,4826·MAD (для нормального распределения). Без MAD — только процентные пороги.
  const sigma = baseline.madKw != null ? 1.4826 * baseline.madKw : 0;
  const diff = Math.abs(currentKw - baseline.medianKw);

  if (abs > ai.anomalyPct && diff > ANOMALY_SIGMA * sigma) {
    return { ...base, state: 'anomaly', deviationPct };
  }
  const state = abs > ai.deviationWarnPct && diff > WARN_SIGMA * sigma ? 'deviation' : 'ok';
  return { ...base, state, deviationPct };
}
