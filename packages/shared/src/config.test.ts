import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateSiteConfig } from './config';

const realConfig = JSON.parse(readFileSync(fileURLToPath(new URL('../../../config/equipment.json', import.meta.url)), 'utf8'));

describe('validateSiteConfig', () => {
  it('config/equipment.json валиден и содержит все станки и этапы из ТЗ', () => {
    const res = validateSiteConfig(realConfig);
    expect(res.errors).toEqual([]);
    const ids = res.config!.equipment.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['mixer-1', 'mixer-2', 'icemaker-1', 'moulder-1', 'conveyor-1', 'proofer-1', 'oven-1', 'oven-2']));
    expect(res.config!.stages.map((s) => s.name)).toEqual(expect.arrayContaining(['Замес', 'Формовка', 'Расстойка', 'Выпечка']));
  });

  it('цех 54 × 35 м; каждый станок стоит внутри прямоугольной зоны своего этапа и внутри цеха', () => {
    const { config } = validateSiteConfig(realConfig);
    const { width, depth } = config!.site.hall;
    expect([width, depth]).toEqual([54, 35]);
    for (const e of config!.equipment) {
      const z = config!.stages.find((s) => s.id === e.stage)!.zone;
      expect(e.position.x, e.id).toBeGreaterThan(z.x0);
      expect(e.position.x, e.id).toBeLessThan(z.x1);
      expect(e.position.z, e.id).toBeGreaterThan(z.z0);
      expect(e.position.z, e.id).toBeLessThan(z.z1);
      expect(Math.abs(e.position.x), e.id).toBeLessThan(width / 2);
      expect(Math.abs(e.position.z), e.id).toBeLessThan(depth / 2);
    }
  });

  it('персонал стоит у станков: у печей, формовки, замеса, заморозки и упаковки; неизвестный станок ловится', () => {
    const { config } = validateSiteConfig(realConfig);
    const at = config!.staff!.flatMap((s) => s.at);
    expect(at).toEqual(expect.arrayContaining(['oven-1', 'oven-2', 'moulder-1', 'mixer-1', 'blastfreezer-1', 'packer-1']));

    const bad = structuredClone(realConfig);
    bad.staff[0].at = ['no-such-machine'];
    bad.staff[1].at = [];
    const { errors } = validateSiteConfig(bad);
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('staff[0]: неизвестный станок "no-such-machine"'), expect.stringContaining('staff[1]: at')]));
  });

  it('помещения в центре цеха: весовая, тележки перед печами, остывание, мойка, офис мастера, бытовые; кривая зона ловится', () => {
    const { config } = validateSiteConfig(realConfig);
    expect(config!.areas!.map((a) => a.kind)).toEqual(expect.arrayContaining(['weighing', 'ovenQueue', 'cooling', 'washing', 'office', 'amenities']));
    expect(config!.staff!.some((s) => s.spot)).toBe(true);

    const bad = structuredClone(realConfig);
    bad.areas[0].zone = { x0: 0, z0: 0, x1: 99, z1: 1 };
    bad.areas[1].kind = 'spa';
    const { errors } = validateSiteConfig(bad);
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining(`areas[0] (${bad.areas[0].id}): zone`), expect.stringContaining(`areas[1] (${bad.areas[1].id}): kind`)]));
  });

  it('зона этапа — прямоугольник x0 < x1, z0 < z1 внутри цеха', () => {
    const bad = structuredClone(realConfig);
    bad.stages[0].zone = { x0: 5, z0: 0, x1: 1, z1: 3 };
    bad.stages[1].zone = { x0: -40, z0: 0, x1: 0, z1: 3 };
    const { errors } = validateSiteConfig(bad);
    expect(errors).toEqual(
      expect.arrayContaining([expect.stringContaining(`stages[0] (${bad.stages[0].id}): zone`), expect.stringContaining(`stages[1] (${bad.stages[1].id}): zone`)]),
    );
  });

  it('газ: счётчик на вводе, сигнализатор и газовые печи; кривые пороги и расход горелки ловятся', () => {
    const { config } = validateSiteConfig(realConfig);
    expect(config!.gas!.meter.maxM3h).toBeGreaterThan(0);
    expect(config!.equipment.filter((e) => e.gasM3h).map((e) => e.id)).toEqual(['oven-1', 'oven-2']);

    const bad = structuredClone(realConfig);
    bad.gas.detector.alarmLel = 5; // аварийный порог ниже предупредительного
    bad.gas.leak.idleMinutes = 0;
    bad.equipment.find((e: { id: string }) => e.id === 'oven-1').gasM3h = -1;
    const { errors } = validateSiteConfig(bad);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('gas.detector'),
        expect.stringContaining('gas.leak'),
        expect.stringContaining('gasM3h'),
      ]),
    );
  });

  it('находит дубли id, неизвестный этап, неверные фазы и мощность', () => {
    const bad = structuredClone(realConfig);
    bad.equipment[2].id = bad.equipment[1].id;
    bad.equipment[2].stage = 'no-such-stage';
    bad.equipment[3].phases = 2;
    bad.equipment[4].nominalKw = 0;
    const { errors, config } = validateSiteConfig(bad);
    expect(config).toBeNull();
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`дублируется id "${bad.equipment[1].id}"`),
        expect.stringContaining('неизвестный этап "no-such-stage"'),
        expect.stringContaining('phases'),
        expect.stringContaining('nominalKw'),
      ]),
    );
  });

  it('id должен подходить для MQTT-топика', () => {
    const bad = structuredClone(realConfig);
    bad.equipment[0].id = 'Печь/1';
    expect(validateSiteConfig(bad).errors.join()).toMatch(/id/);
  });

  it('требует позицию из трёх чисел', () => {
    const bad = structuredClone(realConfig);
    bad.equipment[0].position = { x: 1, y: 'a' };
    expect(validateSiteConfig(bad).errors.join()).toMatch(/position/);
  });

  it('учёт энергии: тарифы с датой и ценой, смены HH:MM без пропусков', () => {
    const base = structuredClone(realConfig);
    const energy = base.energy;
    expect(validateSiteConfig(base).config!.energy!.tariffs.length).toBeGreaterThan(0);
    const bad = { ...base, energy: { ...energy, tariffs: [{ from: '01.06.2026', pricePerKwh: 0 }], shifts: [{ id: '1', name: '1', from: '6', to: '14:00' }] } };
    expect(validateSiteConfig(bad).errors).toEqual([
      'energy.tariffs[0]: from — дата YYYY-MM-DD, pricePerKwh > 0',
      'energy.shifts[0]: from и to — время HH:MM',
      'energy.shifts: смены должны покрывать все 24 часа без наложений',
    ]);
  });

  it('цепочка: в рецептуре только известное сырьё', () => {
    const bad = structuredClone(realConfig);
    bad.supply.products[0].recipe.rye = 0.2;
    expect(validateSiteConfig(bad).errors).toEqual([`supply.products[0] (${bad.supply.products[0].id}): в рецептуре неизвестное сырьё "rye"`]);
  });

  it('не объект → ошибка', () => {
    expect(validateSiteConfig(null).errors.length).toBeGreaterThan(0);
  });
});
