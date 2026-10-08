import { describe, expect, it } from 'vitest';
import { Inventory, validateSiteConfig } from '@bakery/shared';
import rawConfig from '../../../config/equipment.json';
import type { SupplySnapshot } from '../data/mockSupply';
import { supplyView } from './supplyView';

const config = validateSiteConfig(rawConfig).config!;
const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 8, 5, 0, 0);

function snapshot(fill: (inv: Inventory) => void, extra: Partial<SupplySnapshot> = {}): SupplySnapshot {
  const inv = new Inventory({ materials: config.supply!.materials, products: config.supply!.products });
  fill(inv);
  return { now: NOW, inventory: inv, trips: [], deliveries: [], production: [], shortages: [], ...extra };
}

describe('supplyView — что показать по цепочке', () => {
  it('сырьё: мало — ниже минимума или меньше 3 дней; критично — ниже половины минимума или меньше 1,5 дня', () => {
    const qty: Record<string, number> = { eggs: 75, butter: 230 };
    const snap = snapshot((inv) => {
      for (const m of config.supply!.materials) inv.receive({ materialId: m.id, qty: qty[m.id] ?? m.minStock * 5, supplier: 'S', at: NOW - 10 * 24 * H });
      // 7 дней по 100 кг круассанов: меланж 5 кг/сут, масло 28 кг/сут
      for (let d = 1; d <= 7; d++) inv.produce({ productId: 'croissant', kg: 100, at: NOW - d * 24 * H, shiftKey: 's' });
    });
    const v = supplyView(snap, config, NOW - 5 * H);
    const level = (id: string) => v.raw.find((r) => r.material.id === id)!.level;
    expect(level('flour')).toBe('ok');
    expect(level('eggs')).toBe('low'); // 40 кг при минимуме 60, хотя хватит на 8 дней
    expect(level('butter')).toBe('critical'); // 34 кг — на 1,2 дня
    expect(v.alerts.map((a) => a.level)).toEqual(['critical', 'warning']);
  });

  it('предупреждения: дефицит сырья, просрочка, истекает сегодня; критичное — первым', () => {
    const snap = snapshot((inv) => {
      for (const m of config.supply!.materials) inv.receive({ materialId: m.id, qty: m.id === 'yeast' ? 10 : m.minStock * 5, supplier: 'S', at: NOW - 3 * 24 * H });
      const old = inv.produce({ productId: 'baguette', kg: 50, at: NOW - 30 * H, shiftKey: 's' }).lot; // багет живёт сутки — уже просрочен
      inv.pack(old.id, NOW - 29 * H);
      const fresh = inv.produce({ productId: 'baguette', kg: 40, at: NOW - 16 * H, shiftKey: 's' }).lot; // истекает через 8 ч
      inv.pack(fresh.id, NOW - 15 * H);
    });
    const v = supplyView(snap, config, NOW - 5 * H);
    expect(v.alerts.map((a) => [a.level, a.tab])).toEqual([
      ['critical', 'raw'],
      ['critical', 'goods'],
      ['warning', 'goods'],
    ]);
    expect(v.alerts[0]!.text).toMatch(/^Дрожжи прессованные: .*поставка не запланирована$/);
    expect(v.alerts[1]!.text).toBe('Просрочено и не отгружено: 50 кг — на списание');
    expect(v.goods.find((g) => g.product.id === 'baguette')).toMatchObject({ packed: 90, expiringSoon: 40, expired: 50 });
  });
});
