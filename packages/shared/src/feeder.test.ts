import { describe, expect, it } from 'vitest';
import { feederFor } from './feeder';
import type { EquipmentConfig } from './types';

const eq = (over: Partial<EquipmentConfig>): EquipmentConfig => ({
  id: 'oven-1',
  name: 'Печь 1',
  kind: 'oven',
  stage: 'baking',
  nominalKw: 36,
  phases: 3,
  position: { x: 0, y: 0, z: 0 },
  ...over,
});

describe('feederFor — линия питания станка', () => {
  it('без явных данных автомат подбирается по номинальному току с запасом 25 % из стандартного ряда', () => {
    // печь 36 кВт: Iн ≈ 57,7 А → ×1,25 ≈ 72 А → автомат 80 А, кабель 5×25 мм²
    expect(feederFor(eq({}), 6)).toMatchObject({ id: 'Л-06', breakerA: 80, cable: '5×25 мм²' });
  });

  it('однофазный станок — трёхжильный кабель; самый маленький автомат — 6 А', () => {
    // льдогенератор 1 кВт, 230 В: Iн ≈ 4,8 А → ×1,25 ≈ 6,0 А → 10 А
    expect(feederFor(eq({ nominalKw: 1, phases: 1 }), 3)).toMatchObject({ breakerA: 10, cable: '3×1,5 мм²' });
    // конвейер 0,37 кВт → 6 А
    expect(feederFor(eq({ nominalKw: 0.37 }), 5).breakerA).toBe(6);
  });

  it('данные из config (equipment.feeder) важнее подбора', () => {
    const f = feederFor(eq({ feeder: { id: 'QF-12', breakerA: 100, cable: '5×35 мм²' } }), 1);
    expect(f).toEqual({ id: 'QF-12', breakerA: 100, cable: '5×35 мм²' });
  });
});
