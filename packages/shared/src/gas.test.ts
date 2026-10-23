import { describe, expect, it } from 'vitest';
import { GasMonitor, expectedGasFlow, type GasConfig, type GasReading } from './gas';
import type { EquipmentConfig, EquipmentState, MachineStatus } from './types';

const oven = (id: string): EquipmentConfig => ({ id, name: id, kind: 'oven', stage: 'baking', nominalKw: 36, phases: 3, position: { x: 0, y: 0, z: 0 }, gasM3h: 6 });
const mixer: EquipmentConfig = { id: 'mixer-1', name: 'Тестомес', kind: 'mixer', stage: 'mixing', nominalKw: 11, phases: 3, position: { x: 0, y: 0, z: 0 } };
const equipment = [oven('oven-1'), oven('oven-2'), mixer];

const st = (id: string, status: MachineStatus, pct: number | null = null): EquipmentState => ({
  id,
  status,
  reasons: [],
  statusSince: 0,
  lastReading: null,
  pctOfNominal: pct,
  imbalancePct: null,
  ratedCurrentA: 0,
  ai_check: { state: 'learning', deviationPct: null, baselineKw: null, currentKw: null, samples: 0, checkedAt: 0 },
  updatedAt: 0,
});

describe('expectedGasFlow — сколько газа должны брать работающие станки', () => {
  it('горелка работающей печи берёт долю номинала по загрузке; простаивающая — ноль; без газа — не считается', () => {
    const e = expectedGasFlow(equipment, [st('oven-1', 'running', 50), st('oven-2', 'idle', 5), st('mixer-1', 'running', 80)]);
    expect(e.m3h).toBeCloseTo(3);
    expect(e.consumers).toEqual([
      { id: 'oven-1', m3h: 3 },
      { id: 'oven-2', m3h: 0 },
    ]);
    expect(e.anyOn).toBe(true);
    expect(e.known).toBe(true);
  });
});

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 8, 21, 0, 0); // 02:00 Ташкент — ночь, печи погашены
const gas: GasConfig = {
  meter: { id: 'GAS-1', name: 'Счётчик газа', maxM3h: 16, position: { x: 0, z: 0 } },
  detector: { id: 'SG-1', name: 'Сигнализатор загазованности', warnLel: 10, alarmLel: 20 },
  leak: { idleFlowM3h: 0.05, idleMinutes: 10, overPct: 30, overMinM3h: 0.5, overMinutes: 15 },
  offlineAfterSec: 60,
};
const night = [st('oven-1', 'idle', 2), st('oven-2', 'idle', 2), st('mixer-1', 'idle', 0)];
const read = (ts: number, flowM3h: number, ch4Lel: number | null = 0, totalM3 = 1000): GasReading => ({ meterId: 'GAS-1', ts, flowM3h, totalM3, ch4Lel });

describe('GasMonitor — расход газа и утечки', () => {
  it('сигнализатор: от 10 % НКПР — предупреждение, от 20 % — авария, сразу', () => {
    const m = new GasMonitor(gas, equipment);
    expect(m.ingest(read(T0, 0, 3), night).level).toBe('ok');
    const warn = m.ingest(read(T0 + 5000, 0, 12), night);
    expect(warn.level).toBe('warning');
    expect(warn.alerts).toEqual([{ kind: 'detector', level: 'warning', since: T0 + 5000 }]);
    expect(m.ingest(read(T0 + 10_000, 0, 25), night).alerts).toEqual([{ kind: 'detector', level: 'critical', since: T0 + 10_000 }]);
  });

  it('расход при погашенных горелках: дольше 10 мин — утечка (авария), короткий всплеск — нет', () => {
    const m = new GasMonitor(gas, equipment);
    for (let t = 0; t <= 9 * MIN; t += MIN) expect(m.ingest(read(T0 + t, 0.4), night).level).toBe('ok');
    m.ingest(read(T0 + 9.5 * MIN, 0), night); // счётчик встал — отсчёт заново
    for (let t = 10 * MIN; t < 20 * MIN; t += MIN) expect(m.ingest(read(T0 + t, 0.4), night).level).toBe('ok');
    const leak = m.ingest(read(T0 + 20 * MIN, 0.4), night);
    expect(leak.alerts).toEqual([{ kind: 'flow_without_consumers', level: 'critical', since: T0 + 10 * MIN }]);
  });

  it('перерасход днём: больше ожидаемого на 30 % и 0,5 м³/ч дольше 15 мин — предупреждение; разброс горелок — норма', () => {
    const day = [st('oven-1', 'running', 50), st('oven-2', 'running', 50), st('mixer-1', 'running', 70)]; // ждём 6 м³/ч
    const m = new GasMonitor(gas, equipment);
    for (let t = 0; t <= 30 * MIN; t += MIN) expect(m.ingest(read(T0 + t, 7.4), day).level).toBe('ok'); // +23 % — в пределах
    for (let t = 31 * MIN; t < 46 * MIN; t += MIN) expect(m.ingest(read(T0 + t, 8.2), day).level).toBe('ok');
    const over = m.ingest(read(T0 + 46 * MIN, 8.2), day);
    expect(over.alerts).toEqual([{ kind: 'over_expected', level: 'warning', since: T0 + 31 * MIN }]);
    expect(over.expected.m3h).toBeCloseTo(6);
  });

  it('печь без связи: горит ли горелка — неизвестно, утечку по ночному расходу не объявляем', () => {
    const m = new GasMonitor(gas, equipment);
    const unknown = [st('oven-1', 'offline'), st('oven-2', 'idle', 2), st('mixer-1', 'idle', 0)];
    for (let t = 0; t <= 30 * MIN; t += MIN) expect(m.ingest(read(T0 + t, 0.4), unknown).level).toBe('ok');
  });

  it('счётчик молчит дольше 60 с — «нет связи», с новым показанием — снова в норме', () => {
    const m = new GasMonitor(gas, equipment);
    m.ingest(read(T0, 0.01), night);
    expect(m.tick(T0 + 59_000).level).toBe('ok');
    expect(m.tick(T0 + 61_000).level).toBe('offline');
    expect(m.ingest(read(T0 + 65_000, 0.01), night).level).toBe('ok');
  });

  it('история для графика — средние по корзинам; объём за период — по счётному механизму', () => {
    const day = [st('oven-1', 'running', 50), st('oven-2', 'idle', 2), st('mixer-1', 'idle', 0)]; // ждём 3 м³/ч
    const m = new GasMonitor(gas, equipment);
    for (let t = 0; t < 20 * MIN; t += MIN) m.ingest(read(T0 + t, t < 10 * MIN ? 3 : 4, 0, 1000 + t / MIN / 10), day);
    expect(m.history(T0, 10 * MIN, T0 + 20 * MIN)).toEqual([
      { t: T0, flowM3h: 3, expectedM3h: 3 },
      { t: T0 + 10 * MIN, flowM3h: 4, expectedM3h: 3 },
    ]);
    expect(m.volume(T0 + 5 * MIN, T0 + 15 * MIN)).toBeCloseTo(1);
  });
});
