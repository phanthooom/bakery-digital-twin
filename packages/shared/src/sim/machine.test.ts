import { describe, expect, it } from 'vitest';
import { imbalancePct } from '../electrical';
import { parseReading } from '../reading';
import type { EquipmentConfig } from '../types';
import { MachineSim, mulberry32 } from './machine';
import { toPayload } from './payload';

const MIN = 60_000;
// 2026-10-08 10:00 по Ташкенту
const T0 = Date.UTC(2026, 9, 8, 5, 0, 0);
const TZ = 'Asia/Tashkent';

const eq = (over: Partial<EquipmentConfig>): EquipmentConfig => ({
  id: 'oven-1',
  name: 'Печь 1',
  kind: 'oven',
  stage: 'baking',
  nominalKw: 36,
  phases: 3,
  position: { x: 0, y: 0, z: 0 },
  meterId: 'ESP32_SIM_OVN1',
  ...over,
});

function run(sim: MachineSim, minutes: number, start = T0) {
  const out = [];
  for (let t = start; t < start + minutes * MIN; t += 5000) {
    const r = sim.tick(t, 5000);
    if (r) out.push(r);
  }
  return out;
}

describe('MachineSim', () => {
  const kinds: EquipmentConfig['kind'][] = ['mixer', 'moulder', 'conveyor', 'proofer', 'oven', 'icemaker', 'blastfreezer', 'coldroom'];

  for (const kind of kinds) {
    it(`${kind}: мощность в пределах 0…130 % номинала, токи согласованы с мощностью`, () => {
      const phases = kind === 'icemaker' ? 1 : 3;
      const sim = new MachineSim(eq({ id: `${kind}-1`, kind, nominalKw: 4, phases }), { rng: mulberry32(7), timezone: TZ, faultsPerHour: 0 });
      const readings = run(sim, 120);
      expect(readings.length).toBe(120 * 12);
      for (const r of readings) {
        expect(r.powerKw).toBeGreaterThanOrEqual(0);
        expect(r.powerKw).toBeLessThanOrEqual(4 * 1.3);
        expect(r.currentsA).toHaveLength(phases);
        const totalVA = phases === 3 ? r.currentsA.reduce((s, i) => s + i, 0) * 230 : r.currentsA[0]! * 230;
        const pf = r.powerFactor!;
        // P ≈ ΣI·U·cosφ (±5 % на шум)
        expect(Math.abs(totalVA * pf - r.powerKw * 1000)).toBeLessThanOrEqual(Math.max(30, r.powerKw * 1000 * 0.05));
      }
      // за 2 часа станок должен и поработать, и постоять
      const loads = readings.map((r) => r.powerKw / 4);
      expect(Math.max(...loads)).toBeGreaterThan(0.3);
      if (kind !== 'proofer') expect(Math.min(...loads)).toBeLessThan(0.1);
    });
  }

  it('вне смены станок в простое', () => {
    const night = Date.UTC(2026, 9, 8, 19, 0, 0); // 00:00 Ташкент
    const sim = new MachineSim(eq({}), { rng: mulberry32(1), timezone: TZ, faultsPerHour: 0 });
    const readings = run(sim, 30, night);
    expect(Math.max(...readings.map((r) => r.powerKw))).toBeLessThan(36 * 0.1);
  });

  it('без неисправностей несимметрия фаз под нагрузкой ниже порога аварии (40 %)', () => {
    const sim = new MachineSim(eq({}), { rng: mulberry32(3), timezone: TZ, faultsPerHour: 0 });
    for (const r of run(sim, 60)) {
      if (r.powerKw > 36 * 0.3) expect(imbalancePct(r.currentsA)!).toBeLessThan(40);
    }
  });

  it('с частыми неисправностями в показаниях видны перегрузка, обрыв фазы и пропуски (потеря связи)', () => {
    const sim = new MachineSim(eq({}), { rng: mulberry32(11), timezone: TZ, faultsPerHour: 20 });
    const readings = run(sim, 240);
    expect(readings.some((r) => r.powerKw > 36 * 1.15)).toBe(true);
    expect(readings.some((r) => r.powerKw > 5 && Math.min(...r.currentsA) < 0.05)).toBe(true);
    expect(readings.length).toBeLessThan(240 * 12);
  });

  it('неисправность «потеря связи» — показаний нет, потом снова есть', () => {
    const sim = new MachineSim(eq({}), { rng: mulberry32(5), timezone: TZ, faultsPerHour: 0 });
    sim.forceFault('comm_loss', T0, 60_000);
    expect(sim.tick(T0 + 5000, 5000)).toBeNull();
    expect(sim.tick(T0 + 61_000, 5000)).not.toBeNull();
  });

  it('неисправность «обрыв фазы» обнуляет ток одной фазы', () => {
    const sim = new MachineSim(eq({}), { rng: mulberry32(5), timezone: TZ, faultsPerHour: 0 });
    sim.forceMode('work', T0);
    sim.forceFault('phase_loss', T0, 60_000);
    const r = sim.tick(T0 + 5000, 5000)!;
    expect(Math.min(...r.currentsA)).toBeLessThan(0.05);
  });

  it('копит энергию (кВт·ч растёт)', () => {
    const sim = new MachineSim(eq({}), { rng: mulberry32(5), timezone: TZ, faultsPerHour: 0, energyKwh: 100 });
    const rs = run(sim, 30);
    expect(rs.at(-1)!.energyKwh!).toBeGreaterThan(100);
  });
});

describe('MachineSim — холодильное оборудование', () => {
  const night = Date.UTC(2026, 9, 8, 19, 0, 0); // 00:00 Ташкент, вне смены

  it('морозильная камера работает круглосуточно: ночью компрессор включается и выключается', () => {
    const sim = new MachineSim(eq({ id: 'coldroom-1', kind: 'coldroom', nominalKw: 3 }), { rng: mulberry32(4), timezone: TZ, faultsPerHour: 0 });
    const loads = run(sim, 120, night).map((r) => r.powerKw / 3);
    expect(Math.max(...loads)).toBeGreaterThan(0.8);
    expect(Math.min(...loads)).toBeLessThan(0.1);
  });
});

describe('toPayload', () => {
  it('сообщение симулятора проходит parseReading без потерь (контракт MQTT)', () => {
    const sim = new MachineSim(eq({}), { rng: mulberry32(9), timezone: TZ, faultsPerHour: 0 });
    const r = sim.tick(T0, 5000)!;
    const json = toPayload(r);
    const parsed = parseReading('bakery/oven-1/power', json, { nowMs: T0 });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.reading.ts).toBe(T0);
    expect(parsed.reading.powerKw).toBeCloseTo(r.powerKw, 3);
    expect(parsed.reading.meterId).toBe('ESP32_SIM_OVN1');
    expect(JSON.parse(json).ts).toBe(new Date(T0).toISOString());
  });
});
