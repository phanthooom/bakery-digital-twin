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

  it('каждый станок стоит внутри зоны своего этапа и внутри цеха', () => {
    const { config } = validateSiteConfig(realConfig);
    const half = config!.site.hall.width / 2;
    for (const e of config!.equipment) {
      const st = config!.stages.find((s) => s.id === e.stage)!;
      expect(e.position.x, e.id).toBeGreaterThan(st.xFrom);
      expect(e.position.x, e.id).toBeLessThan(st.xTo);
      expect(Math.abs(e.position.x), e.id).toBeLessThan(half);
    }
  });

  it('находит дубли id, неизвестный этап, неверные фазы и мощность', () => {
    const bad = structuredClone(realConfig);
    bad.equipment[1].id = 'mixer-1';
    bad.equipment[2].stage = 'packing';
    bad.equipment[3].phases = 2;
    bad.equipment[4].nominalKw = 0;
    const { errors, config } = validateSiteConfig(bad);
    expect(config).toBeNull();
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('дублируется id "mixer-1"'),
        expect.stringContaining('неизвестный этап "packing"'),
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

  it('не объект → ошибка', () => {
    expect(validateSiteConfig(null).errors.length).toBeGreaterThan(0);
  });
});
