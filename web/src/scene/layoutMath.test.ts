import { describe, expect, it } from 'vitest';
import type { EquipmentConfig } from '@bakery/shared';
import { calcCableDrop, rotateStep, snapAndClamp } from './layoutMath';

describe('layoutMath — расчёты конструктора 3D-планировки цеха', () => {
  it('snapAndClamp привязывает координаты к сетке 0,5 м и удерживает станок внутри стен цеха', () => {
    const hall = { width: 48, depth: 36 };
    expect(snapAndClamp(10.23, -4.74, hall, 0.5)).toEqual({ x: 10, z: -4.5 });
    // За пределами стен — зажимает с отступом 1,2 м от стены (24 - 1.2 = 22.8)
    expect(snapAndClamp(40, -30, hall, 0.5, 1.2)).toEqual({ x: 22.8, z: -16.8 });
  });

  it('rotateStep поворачивает станок по кругу кратно 90° и возвращает угол в [0, 2π)', () => {
    const r90 = rotateStep(0, Math.PI / 2);
    expect(r90).toBeCloseTo(Math.PI / 2, 3);
    const r360 = rotateStep(r90 * 3, Math.PI / 2);
    expect(r360).toBeCloseTo(0, 3);
    const rMinus90 = rotateStep(0, -Math.PI / 2);
    expect(rMinus90).toBeCloseTo((3 * Math.PI) / 2, 3);
  });

  it('calcCableDrop считает длину кабеля и падение напряжения ΔU при перестановке станка', () => {
    const oven: EquipmentConfig = {
      id: 'oven-1',
      name: 'Ротационная печь 1',
      kind: 'oven',
      stage: 'baking',
      nominalKw: 45,
      phases: 3,
      position: { x: 8, y: 0, z: -6 },
    };
    const near = calcCableDrop(oven, 12);
    const far = calcCableDrop(oven, 36);
    expect(far.dropV).toBeCloseTo(near.dropV * 3, 1);
    expect(far.dropPct).toBeGreaterThan(near.dropPct);
    expect(near.cableMm2).toBeGreaterThanOrEqual(16);
  });
});
