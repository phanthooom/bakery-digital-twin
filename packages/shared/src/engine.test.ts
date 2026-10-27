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
  stages: [{ id: 'baking', order: 1, label: '01', name: 'Выпечка', zone: { x0: -5, z0: -5, x1: 5, z1: 5 } }],
  equipment: [
    {
      id: 'oven-1',
      name: 'Печь 1',
      kind: 'oven',
      stage: 'baking',
      nominalKw: 36,
      phases: 3,
      position: { x: 0, y: 0, z: 0 },
      climate: { mode: 'oven', targetTempC: 230, minTempC: 190, maxTempC: 260 },
    },
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

  it('отслеживает технологический климат (температуру)', () => {
    const e = new TwinEngine(config);
    // Нормальная температура выпечки в печи
    e.ingest({ ...r(T0, 30, [45, 45, 45], 'oven-1'), temperatureC: 228.5, targetTempC: 230 }, T0);
    const s1 = e.getState('oven-1')!;
    expect(s1.climate?.status).toBe('ok');
    expect(s1.climate?.temperatureC).toBe(228.5);

    // Перегрев печи (выше 270 °C)
    e.ingest({ ...r(T0 + 5000, 30, [45, 45, 45], 'oven-1'), temperatureC: 275 }, T0 + 5000);
    const s2 = e.getState('oven-1')!;
    expect(s2.climate?.status).toBe('critical');
    expect(s2.climate?.alert).toContain('Перегрев');
  });
});

describe('TwinEngine — машина времени', () => {
  /** Прожить сценарий, запоминая, что движок показывал вживую после каждого шага. */
  const scenario = () => {
    const e = new TwinEngine(config);
    const live: { t: number; status: string; reasons: string; kw: number | null; readingTs: number | null; since: number }[] = [];
    const remember = (t: number) => {
      const s = e.getState('oven-1')!;
      live.push({ t, status: s.status, reasons: s.reasons.join(','), kw: s.lastReading?.powerKw ?? null, readingTs: s.lastReading?.ts ?? null, since: s.statusSince });
    };
    let t = T0;
    // 10 мин работы, 1 мин перегрузки, 5 мин простоя, обрыв фазы, потом пропала связь;
    // переходы — не на 15-секундной сетке журнала, чтобы смена статуса обязана была писаться сразу
    const B1 = T0 + 10 * MIN + 5000;
    const B2 = T0 + 11 * MIN + 10_000;
    const B3 = T0 + 16 * MIN + 5000;
    const B4 = T0 + 17 * MIN + 10_000;
    for (; t < B1; t += 5000) (e.ingest(r(t, 30 + ((t / 5000) % 3)), t), remember(t));
    for (; t < B2; t += 5000) (e.ingest(r(t, 44), t), remember(t));
    for (; t < B3; t += 5000) (e.ingest(r(t, 0.5, [0.8, 0.8, 0.8]), t), remember(t));
    for (; t < B4; t += 5000) (e.ingest(r(t, 24, [55, 0, 54]), t), remember(t));
    for (let k = 1; k <= 60; k++) (e.tick(t + k * 1000), remember(t + k * 1000));
    return { e, live, end: t + 60_000 };
  };

  it('statesAt(t) — цех ровно таким, каким он был вживую: статус, причины, начало статуса — без запаздывания', () => {
    const { e, live } = scenario();
    for (const l of live) {
      const s = e.statesAt(l.t).find((x) => x.id === 'oven-1')!;
      expect(s.status, `в ${(l.t - T0) / 1000} с`).toBe(l.status);
      expect(s.reasons.join(','), `в ${(l.t - T0) / 1000} с`).toBe(l.reasons);
      expect(s.statusSince, `в ${(l.t - T0) / 1000} с`).toBe(l.since);
    }
  });

  it('мощность в прошлом — показание не старше 15 с от того, что движок видел вживую', () => {
    const { e, live } = scenario();
    for (const l of live) {
      if (l.readingTs === null) continue;
      const s = e.statesAt(l.t).find((x) => x.id === 'oven-1')!;
      expect(l.readingTs - s.lastReading!.ts).toBeGreaterThanOrEqual(0);
      expect(l.readingTs - s.lastReading!.ts).toBeLessThanOrEqual(15_000);
    }
  });

  it('до начала журнала станок «нет связи», в момент между показаниями — последнее известное состояние', () => {
    const { e } = scenario();
    expect(e.statesAt(T0 - MIN).find((x) => x.id === 'oven-1')!.status).toBe('offline');
    expect(e.statesAt(T0 + 10 * MIN + 7500).find((x) => x.id === 'oven-1')!.status).toBe('alarm');
    // ice-1 данных не присылал вовсе
    expect(e.statesAt(T0 + 5 * MIN).find((x) => x.id === 'ice-1')!.status).toBe('offline');
  });

  it('statusChanges(from, to) — смены статуса для рисок на шкале: аварии с причинами, по времени', () => {
    const { e, end } = scenario();
    const ch = e.statusChanges(T0, end).filter((c) => c.id === 'oven-1');
    expect(ch.map((c) => c.status)).toEqual(['running', 'alarm', 'idle', 'alarm', 'offline']);
    expect(ch[1]).toMatchObject({ t: T0 + 10 * MIN + 5000, reasons: ['overload'] });
    expect(ch[3]!.reasons).toContain('phase_loss');
    for (let i = 1; i < ch.length; i++) expect(ch[i]!.t).toBeGreaterThan(ch[i - 1]!.t);
  });

  it('смена причины аварии без смены статуса (перегрузка → обрыв фазы) — тоже риска на шкале', () => {
    const e = new TwinEngine(config);
    let t = T0;
    for (; t < T0 + MIN; t += 5000) e.ingest(r(t, 44), t);
    for (; t < T0 + 2 * MIN; t += 5000) e.ingest(r(t, 24, [55, 0, 54]), t);
    const ch = e.statusChanges(T0, t).filter((c) => c.id === 'oven-1');
    expect(ch.map((c) => c.status)).toEqual(['alarm', 'alarm']);
    expect(ch[0]!.reasons).toEqual(['overload']);
    expect(ch[1]!.reasons).toContain('phase_loss');
  });

  it('запоздалое показание с прошлым временем не переписывает журнал', () => {
    const { e, end } = scenario();
    const before = e.statesAt(T0 + 5 * MIN).find((x) => x.id === 'oven-1')!;
    e.ingest(r(T0 + 5 * MIN, 44), T0 + 5 * MIN); // дозагрузка старых данных с прошлым «сейчас»
    expect(e.statesAt(T0 + 5 * MIN).find((x) => x.id === 'oven-1')!).toBe(before);
    expect(e.statusChanges(T0, end).filter((c) => c.id === 'oven-1')).toHaveLength(5);
  });

  it('журнал не растёт бесконечно: старше окна истории — отрезается, но состояние на границе окна остаётся', () => {
    const e = new TwinEngine(config, { historyHours: 1 });
    for (let t = T0; t < T0 + 3 * HOUR; t += 5000) e.ingest(r(t, 30), t);
    const end = T0 + 3 * HOUR;
    // чуть раньше начала окна: состояние описывает последняя запись до границы
    expect(e.statesAt(end - HOUR - 10_000).find((x) => x.id === 'oven-1')!.status).toBe('running');
    expect(e.statesAt(end - HOUR).find((x) => x.id === 'oven-1')!.status).toBe('running');
    expect(e.statusChanges(T0, end).length).toBeLessThanOrEqual(1);
    expect(e.journalSize()).toBeLessThan(400);
  });
});
