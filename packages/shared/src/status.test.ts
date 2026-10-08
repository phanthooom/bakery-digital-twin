import { describe, expect, it } from 'vitest';
import { computeStatus } from './status';
import type { Reading, Thresholds } from './types';

const NOW = Date.UTC(2026, 9, 8, 6, 0, 0);

const thresholds: Thresholds = {
  offlineAfterSec: 30,
  idlePctOfNominal: 10,
  overloadPctOfNominal: 115,
  imbalanceAlarmPct: 40,
  imbalanceMinLoadPct: 30,
  ai: { windowMin: 15, minBaselineSamples: 10, deviationWarnPct: 15, anomalyPct: 40, historyDays: 7 },
};

const oven = { nominalKw: 36, phases: 3 as const };

function reading(powerKw: number, currentsA: number[], ageMs = 2000): Reading {
  return { equipmentId: 'oven-1', ts: NOW - ageMs, powerKw, currentsA };
}

describe('computeStatus', () => {
  it('нет данных → offline (серый)', () => {
    expect(computeStatus({ reading: null, nowMs: NOW, ...oven, thresholds })).toEqual({ status: 'offline', reasons: ['no_data'] });
  });

  it('данные старше offlineAfterSec → offline', () => {
    const r = reading(30, [48, 48, 48], 31_000);
    expect(computeStatus({ reading: r, nowMs: NOW, ...oven, thresholds }).status).toBe('offline');
  });

  it('нормальная нагрузка → running (зелёный)', () => {
    const r = reading(30, [48, 50, 47]);
    expect(computeStatus({ reading: r, nowMs: NOW, ...oven, thresholds })).toEqual({ status: 'running', reasons: [] });
  });

  it('мощность ниже порога простоя → idle (жёлтый)', () => {
    const r = reading(0.5, [0.8, 0.8, 0.8]);
    expect(computeStatus({ reading: r, nowMs: NOW, ...oven, thresholds }).status).toBe('idle');
  });

  it('ровно на пороге простоя — уже running', () => {
    const r = reading(3.6, [6, 6, 6]);
    expect(computeStatus({ reading: r, nowMs: NOW, ...oven, thresholds }).status).toBe('running');
  });

  it('перегрузка выше 115 % номинала → alarm', () => {
    const r = reading(42, [68, 68, 68]);
    expect(computeStatus({ reading: r, nowMs: NOW, ...oven, thresholds })).toEqual({ status: 'alarm', reasons: ['overload'] });
  });

  it('обрыв фазы у работающего 3-фазного станка → alarm phase_loss', () => {
    const r = reading(20, [48, 48, 0.1]);
    const s = computeStatus({ reading: r, nowMs: NOW, ...oven, thresholds });
    expect(s.status).toBe('alarm');
    expect(s.reasons).toContain('phase_loss');
  });

  it('сильная несимметрия под нагрузкой → alarm imbalance', () => {
    const r = reading(20, [20, 45, 30]);
    const s = computeStatus({ reading: r, nowMs: NOW, ...oven, thresholds });
    expect(s).toEqual({ status: 'alarm', reasons: ['imbalance'] });
  });

  it('несимметрия при малой нагрузке не считается аварией', () => {
    const r = reading(5, [1, 9, 3]);
    expect(computeStatus({ reading: r, nowMs: NOW, ...oven, thresholds }).status).toBe('running');
  });

  it('у однофазного станка несимметрия и обрыв фазы не проверяются', () => {
    const r: Reading = { equipmentId: 'icemaker-1', ts: NOW, powerKw: 1, currentsA: [4.9] };
    expect(computeStatus({ reading: r, nowMs: NOW, nominalKw: 1, phases: 1, thresholds }).status).toBe('running');
  });

  it('аномалия ИИ-проверки → alarm ai_anomaly', () => {
    const r = reading(30, [48, 50, 47]);
    const s = computeStatus({ reading: r, nowMs: NOW, ...oven, thresholds, aiState: 'anomaly' });
    expect(s).toEqual({ status: 'alarm', reasons: ['ai_anomaly'] });
  });

  it('аномалия ИИ не поднимает тревогу, если станок в простое', () => {
    const r = reading(0.2, [0.3, 0.3, 0.3]);
    const s = computeStatus({ reading: r, nowMs: NOW, ...oven, thresholds, aiState: 'anomaly' });
    expect(s.status).toBe('idle');
  });

  it('несколько причин сразу перечисляются все', () => {
    const r = reading(43, [100, 100, 0]);
    const s = computeStatus({ reading: r, nowMs: NOW, ...oven, thresholds, aiState: 'anomaly' });
    expect(s.status).toBe('alarm');
    expect(s.reasons).toEqual(expect.arrayContaining(['overload', 'phase_loss', 'ai_anomaly']));
  });
});
