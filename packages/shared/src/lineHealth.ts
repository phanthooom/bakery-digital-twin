import { imbalancePct, pctOfNominal, ratedCurrentA } from './electrical';
import type { Feeder } from './feeder';
import type { Reading, Thresholds } from './types';

export type LineLevel = 'ok' | 'idle' | 'warning' | 'critical' | 'offline';

export type LineProblemCode = 'breaker_overload' | 'breaker_high' | 'phase_loss' | 'imbalance' | 'undervoltage' | 'overvoltage';

export interface LineProblem {
  code: LineProblemCode;
  level: 'warning' | 'critical';
  /** Значение, по которому сработала проверка: %, А или В. */
  value: number;
  /** Фаза, если проблема на одной фазе: 1, 2 или 3. */
  phase?: number;
}

/** Загрузка автомата: предупреждение / авария, % номинала автомата. */
const BREAKER_WARN_PCT = 80;
const BREAKER_TRIP_PCT = 100;
/** Допустимые отклонения фазного напряжения 230 В (ГОСТ 32144: ±10 %). */
const U_LOW_WARN = 207;
const U_LOW_CRIT = 195;
const U_HIGH_WARN = 253;
const U_HIGH_CRIT = 265;
/** Ниже этой доли номинального тока линия считается ненагруженной. */
const IDLE_CURRENT_SHARE = 0.05;

export interface LineHealthInput {
  reading: Reading | null;
  offline: boolean;
  feeder: Feeder;
  phases: 1 | 3;
  nominalKw: number;
  thresholds: Thresholds;
}

export interface LineHealth {
  level: LineLevel;
  /** Ток самой нагруженной фазы в % от номинала автомата. */
  loadPct: number | null;
  problems: LineProblem[];
}

/** Состояние линии питания по последнему показанию счётчика станка. */
export function assessLine(input: LineHealthInput): LineHealth {
  const { reading, feeder } = input;
  if (input.offline || !reading) return { level: 'offline', loadPct: null, problems: [] };
  const loadPct = (Math.max(...reading.currentsA) / feeder.breakerA) * 100;
  const problems: LineProblem[] = [];
  const pct = Math.round(loadPct);
  if (loadPct > BREAKER_TRIP_PCT) problems.push({ code: 'breaker_overload', level: 'critical', value: pct });
  else if (loadPct > BREAKER_WARN_PCT) problems.push({ code: 'breaker_high', level: 'warning', value: pct });

  if (input.phases === 3 && reading.currentsA.length === 3) {
    const max = Math.max(...reading.currentsA);
    const min = Math.min(...reading.currentsA);
    const lost = max > ratedCurrentA(input.nominalKw, 3) * 0.1 && min < max * 0.05;
    if (lost) {
      problems.push({ code: 'phase_loss', level: 'critical', value: min, phase: reading.currentsA.indexOf(min) + 1 });
    } else {
      const imb = imbalancePct(reading.currentsA);
      const load = pctOfNominal(reading.powerKw, input.nominalKw) ?? 0;
      if (imb !== null && load >= input.thresholds.imbalanceMinLoadPct && imb > input.thresholds.imbalanceAlarmPct) {
        problems.push({ code: 'imbalance', level: 'warning', value: Math.round(imb) });
      }
    }
  }
  const volts = reading.voltageV ?? [];
  if (volts.length) {
    const lo = Math.min(...volts);
    const hi = Math.max(...volts);
    if (lo < U_LOW_WARN) problems.push({ code: 'undervoltage', level: lo < U_LOW_CRIT ? 'critical' : 'warning', value: lo, phase: volts.indexOf(lo) + 1 });
    if (hi > U_HIGH_WARN) problems.push({ code: 'overvoltage', level: hi > U_HIGH_CRIT ? 'critical' : 'warning', value: hi, phase: volts.indexOf(hi) + 1 });
  }

  const idle = Math.max(...reading.currentsA) < ratedCurrentA(input.nominalKw, input.phases) * IDLE_CURRENT_SHARE;
  const level = problems.length ? worst(problems) : idle ? 'idle' : 'ok';
  return { level, loadPct, problems };
}

function worst(problems: LineProblem[]): LineLevel {
  if (problems.some((p) => p.level === 'critical')) return 'critical';
  if (problems.length) return 'warning';
  return 'ok';
}
