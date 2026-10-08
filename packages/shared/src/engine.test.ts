import { describe, expect, it } from 'vitest';
import { TwinEngine } from './engine';
import type { Reading, SiteConfig } from './types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 8, 5, 0, 0); // 10:00 Ташкент

const config: SiteConfig = {
  site: { name: 'Тест', timezone: 'Asia/Tashkent', hall: { width: 10, depth: 10, height: 4 } },
  thresholds: {
    offlineAfterSec: 30,
    idlePctOfNominal: 10,
    overloadPctOfNominal: 115,
    imbalanceAlarmPct: 40,
    imbalanceMinLoadPct: 30,
    ai: { windowMin: 15, minBaselineSamples: 10, deviationWarnPct: 15, anomalyPct: 40, historyDays: 7 },
  },
  stages: [{ id: 'baking', order: 1, label: '01', name: 'Выпечка', xFrom: 0, xTo: 1 }],
  equipment: [
    { id: 'oven-1', name: 'Печь 1', kind: 'oven', stage: 'baking', nominalKw: 36, phases: 3, position: { x: 0, y: 0, z: 0 } },
    { id: 'ice-1', name: 'Лёд', kind: 'icemaker', stage: 'baking', nominalKw: 1, phases: 1, position: { x: 0, y: 0, z: 0 } },
  ],
};

const r = (ts: number, powerKw: number, currentsA = [48, 49, 47], id = 'oven-1'): Reading => ({ equipmentId: id, ts, powerKw, currentsA });

describe('TwinEngine', () => {
  it('до первых данных все станки offline', () => {
    const e = new TwinEngine(config);
    expect(e.getStates().map((s) => [s.id, s.status])).toEqual([
      ['oven-1', 'offline'],
      ['ice-1', 'offline'],
    ]);
  });

  it('игнорирует показания неизвестного станка', () => {
    const e = new TwinEngine(config);
    expect(e.ingest(r(T0, 1, [1, 1, 1], 'ghost'), T0)).toBeNull();
  });

  it('по показанию считает статус, % номинала, несимметрию и номинальный ток', () => {
    const e = new TwinEngine(config);
    const s = e.ingest(r(T0, 34.56, [2.65, 4.42, 3.02]), T0)!;
    expect(s.status).toBe('running');
    expect(s.pctOfNominal).toBeCloseTo(96);
    expect(s.imbalancePct).toBeCloseTo(31.4, 1);
    expect(s.ratedCurrentA).toBeCloseTo(57.7, 1);
    expect(s.lastReading?.powerKw).toBe(34.56);
    expect(s.updatedAt).toBe(T0);
  });

  it('statusSince меняется только при смене статуса', () => {
    const e = new TwinEngine(config);
    e.ingest(r(T0, 30), T0);
    e.ingest(r(T0 + 5000, 31), T0 + 5000);
    expect(e.getState('oven-1')!.statusSince).toBe(T0);
    e.ingest(r(T0 + 10_000, 0.5, [0.8, 0.8, 0.8]), T0 + 10_000);
    const s = e.getState('oven-1')!;
    expect(s.status).toBe('idle');
    expect(s.statusSince).toBe(T0 + 10_000);
  });

  it('tick() переводит в offline, если данных нет дольше порога', () => {
    const e = new TwinEngine(config);
    e.ingest(r(T0, 30), T0);
    expect(e.tick(T0 + 20_000)).toEqual([]);
    const changed = e.tick(T0 + 31_000);
    expect(changed.map((s) => s.id)).toEqual(['oven-1']);
    expect(changed[0]!.status).toBe('offline');
    expect(changed[0]!.statusSince).toBe(T0 + 30_000);
  });

  it('устаревшее (догруженное) показание идёт в историю, но не затирает текущее', () => {
    const e = new TwinEngine(config);
    e.ingest(r(T0, 30), T0);
    e.ingest(r(T0 - 10 * MIN, 5), T0);
    expect(e.getState('oven-1')!.lastReading!.powerKw).toBe(30);
    expect(e.history('oven-1', T0 - HOUR, MIN, T0).points.map((p) => p.kw)).toEqual([5, 30]);
  });

  it('history() усредняет по корзинам и находит пик по сырым данным', () => {
    const e = new TwinEngine(config);
    e.ingest(r(T0, 10), T0);
    e.ingest(r(T0 + 10_000, 20), T0 + 10_000);
    e.ingest(r(T0 + MIN, 40), T0 + MIN);
    const h = e.history('oven-1', T0, MIN, T0 + MIN);
    expect(h.points).toEqual([
      { t: T0, kw: 15 },
      { t: T0 + MIN, kw: 40 },
    ]);
    expect(h.peak).toEqual({ t: T0 + MIN, kw: 40 });
  });

  it('хранит историю не дольше historyHours', () => {
    const e = new TwinEngine(config, { historyHours: 1 });
    e.ingest(r(T0 - 2 * HOUR, 1), T0 - 2 * HOUR);
    e.ingest(r(T0, 2), T0);
    expect(e.history('oven-1', T0 - 3 * HOUR, MIN, T0).points).toEqual([{ t: T0, kw: 2 }]);
  });

  it('ai_check: без истории — обучение, с историей того же часа — в норме', () => {
    const e = new TwinEngine(config);
    e.ingest(r(T0, 30), T0);
    expect(e.getState('oven-1')!.ai_check.state).toBe('learning');

    const e2 = new TwinEngine(config);
    for (let m = 0; m < 60; m++) e2.seedBaseline('oven-1', T0 - DAY + m * MIN, 30);
    for (let s = 0; s < 15 * 12; s++) e2.ingest(r(T0 + s * 5000, 30.3), T0 + s * 5000);
    const ai = e2.getState('oven-1')!.ai_check;
    expect(ai.state).toBe('ok');
    expect(ai.deviationPct).toBeCloseTo(1, 0);
    expect(ai.baselineKw).toBe(30);
  });

  it('ai_check: аномальный перерасход переводит станок в alarm', () => {
    const e = new TwinEngine(config);
    for (let m = 0; m < 60; m++) e.seedBaseline('oven-1', T0 - DAY + m * MIN, 20);
    for (let s = 0; s < 15 * 12; s++) e.ingest(r(T0 + s * 5000, 33), T0 + s * 5000);
    const st = e.getState('oven-1')!;
    expect(st.ai_check.state).toBe('anomaly');
    expect(st.status).toBe('alarm');
    expect(st.reasons).toContain('ai_anomaly');
  });

  it('ai_check пересчитывается не чаще раза в минуту', () => {
    const e = new TwinEngine(config);
    e.ingest(r(T0, 30), T0);
    const first = e.getState('oven-1')!.ai_check.checkedAt;
    e.ingest(r(T0 + 30_000, 30), T0 + 30_000);
    expect(e.getState('oven-1')!.ai_check.checkedAt).toBe(first);
    e.ingest(r(T0 + 61_000, 30), T0 + 61_000);
    expect(e.getState('oven-1')!.ai_check.checkedAt).toBe(T0 + 61_000);
  });

  it('подписчики получают изменённые состояния', () => {
    const e = new TwinEngine(config);
    const got: string[] = [];
    const off = e.subscribe((s) => got.push(`${s.id}:${s.status}`));
    e.ingest(r(T0, 1, [4.9], 'ice-1'), T0);
    off();
    e.ingest(r(T0 + 5000, 1, [4.9], 'ice-1'), T0 + 5000);
    expect(got).toEqual(['ice-1:running']);
  });
});
