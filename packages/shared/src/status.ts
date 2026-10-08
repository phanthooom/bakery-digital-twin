import { imbalancePct, pctOfNominal, ratedCurrentA } from './electrical';
import type { AiState, MachineStatus, Reading, StatusReason, Thresholds } from './types';

export interface StatusInput {
  reading: Reading | null;
  nowMs: number;
  nominalKw: number;
  phases: 1 | 3;
  thresholds: Thresholds;
  aiState?: AiState;
}

export interface StatusResult {
  status: MachineStatus;
  reasons: StatusReason[];
}

/** Доля номинального тока, выше которой фаза считается «под нагрузкой». */
const PHASE_LOADED_SHARE = 0.1;
/** Фаза считается оборванной, если её ток меньше этой доли от максимального. */
const PHASE_LOST_SHARE = 0.05;

/**
 * Статус станка для светофора:
 * - offline (серый): нет данных дольше offlineAfterSec;
 * - alarm (красный): перегрузка, обрыв фазы, несимметрия под нагрузкой, аномалия ИИ;
 * - idle (жёлтый): мощность ниже порога простоя;
 * - running (зелёный): всё остальное.
 */
export function computeStatus(input: StatusInput): StatusResult {
  const { reading, nowMs, nominalKw, phases, thresholds: th } = input;
  if (!reading || nowMs - reading.ts > th.offlineAfterSec * 1000) {
    return { status: 'offline', reasons: ['no_data'] };
  }

  const load = pctOfNominal(reading.powerKw, nominalKw) ?? 0;
  const reasons: StatusReason[] = [];

  if (load > th.overloadPctOfNominal) reasons.push('overload');

  if (phases === 3 && reading.currentsA.length === 3) {
    const maxI = Math.max(...reading.currentsA);
    const minI = Math.min(...reading.currentsA);
    const rated = ratedCurrentA(nominalKw, 3);
    const lost = maxI > rated * PHASE_LOADED_SHARE && minI < maxI * PHASE_LOST_SHARE;
    if (lost) reasons.push('phase_loss');
    const imb = imbalancePct(reading.currentsA);
    if (imb !== null && load >= th.imbalanceMinLoadPct && imb > th.imbalanceAlarmPct) reasons.push('imbalance');
  }

  const isIdle = load < th.idlePctOfNominal;
  if (input.aiState === 'anomaly' && !isIdle) reasons.push('ai_anomaly');

  if (reasons.length > 0) return { status: 'alarm', reasons };
  return { status: isIdle ? 'idle' : 'running', reasons };
}
