import { describe, expect, it } from 'vitest';
import { Inventory, type Catalog } from './inventory';

const H = 3_600_000;
const D = 24 * H;
const T0 = Date.UTC(2026, 9, 1, 3, 0, 0); // 1 октября, 08:00 по Ташкенту

const CATALOG: Catalog = {
  materials: [
    { id: 'flour', name: 'Мука', unit: 'кг', storage: 'dry', minStock: 500, shelfLifeDays: 180 },
    { id: 'butter', name: 'Масло', unit: 'кг', storage: 'cold', minStock: 50, shelfLifeDays: 30 },
  ],
  products: [
    { id: 'croissant', name: 'Круассан', shelfLifeDays: 180, frozen: true, recipe: { flour: 0.5, butter: 0.25 } },
    { id: 'baguette', name: 'Багет', shelfLifeDays: 1, frozen: false, recipe: { flour: 0.6 } },
  ],
};

describe('Inventory — приход сырья', () => {
  it('партия от поставщика с остатком и сроком годности', () => {
    const inv = new Inventory(CATALOG);
    const lot = inv.receive({ materialId: 'flour', qty: 1000, supplier: 'Мелькомбинат', at: T0 });
    expect(lot).toMatchObject({ itemId: 'flour', kind: 'raw', qty: 1000, initialQty: 1000, expiresAt: T0 + 180 * D, source: { supplier: 'Мелькомбинат' } });
    expect(inv.stock('flour')).toBe(1000);
  });
});

describe('Inventory — выпуск по рецептуре', () => {
  it('списывает сырьё по рецептуре, первым — то, что раньше испортится (FEFO)', () => {
    const inv = new Inventory(CATALOG);
    const old = inv.receive({ materialId: 'flour', qty: 100, supplier: 'A', at: T0, expiresAt: T0 + 10 * D });
    const fresh = inv.receive({ materialId: 'flour', qty: 1000, supplier: 'B', at: T0 + H });
    inv.receive({ materialId: 'butter', qty: 200, supplier: 'C', at: T0 });
    const r = inv.produce({ productId: 'croissant', kg: 400, at: T0 + 2 * H, shiftKey: '2026-10-01#1' });
    // 400 кг × 0,5 = 200 кг муки: 100 из старой партии, 100 из свежей
    expect(r.consumed.filter((c) => c.itemId === 'flour')).toEqual([
      { lotId: old.id, itemId: 'flour', qty: 100 },
      { lotId: fresh.id, itemId: 'flour', qty: 100 },
    ]);
    expect(inv.stock('flour')).toBe(900);
    expect(inv.stock('butter')).toBe(100);
    expect(r.lot).toMatchObject({ itemId: 'croissant', kind: 'product', qty: 400, status: 'produced', expiresAt: T0 + 2 * H + 180 * D });
    expect(r.shortages).toEqual([]);
  });

  it('не хватает сырья — выпускает сколько хватило и сообщает о нехватке', () => {
    const inv = new Inventory(CATALOG);
    inv.receive({ materialId: 'flour', qty: 30, supplier: 'A', at: T0 });
    const r = inv.produce({ productId: 'baguette', kg: 100, at: T0 + H, shiftKey: 's' });
    expect(r.lot.qty).toBe(50); // 30 кг муки / 0,6
    expect(r.shortages).toEqual([{ materialId: 'flour', missing: 30 }]);
    expect(inv.stock('flour')).toBe(0);
  });
});

describe('Inventory — упаковка и отгрузка', () => {
  const setup = () => {
    const inv = new Inventory(CATALOG);
    inv.receive({ materialId: 'flour', qty: 1000, supplier: 'A', at: T0 });
    const a = inv.produce({ productId: 'baguette', kg: 60, at: T0, shiftKey: 's1' }).lot;
    const b = inv.produce({ productId: 'baguette', kg: 60, at: T0 + 4 * H, shiftKey: 's2' }).lot;
    return { inv, a, b };
  };

  it('отгружается только упакованное, FEFO; заказ запоминает партии', () => {
    const { inv, a, b } = setup();
    expect(inv.ship({ orderId: 'o1', client: 'Кафе', lines: [{ productId: 'baguette', kg: 10 }], vehicleId: 'van-1', at: T0 + 5 * H }).shortages).toEqual([
      { productId: 'baguette', missing: 10 },
    ]);
    inv.pack(a.id, T0 + 5 * H);
    inv.pack(b.id, T0 + 5 * H);
    const s = inv.ship({ orderId: 'o2', client: 'Кафе', lines: [{ productId: 'baguette', kg: 80 }], vehicleId: 'van-1', at: T0 + 6 * H });
    expect(s.picks).toEqual([
      { lotId: a.id, productId: 'baguette', qty: 60 },
      { lotId: b.id, productId: 'baguette', qty: 20 },
    ]);
    expect(inv.stock('baguette')).toBe(40);
    expect(inv.stock('baguette', 'produced')).toBe(0);
  });

  it('прослеживаемость: из каких партий сырья сделана партия и кому она уехала', () => {
    const { inv, a } = setup();
    inv.pack(a.id, T0 + H);
    inv.ship({ orderId: 'o7', client: 'Ресторан «Плов»', lines: [{ productId: 'baguette', kg: 15 }], vehicleId: 'van-2', at: T0 + 2 * H });
    const t = inv.trace(a.id);
    expect(t.inputs.map((x) => [x.lot.itemId, x.qty])).toEqual([['flour', 36]]);
    expect(t.inputs[0]!.lot.source).toEqual({ supplier: 'A' });
    expect(t.shipments).toEqual([{ orderId: 'o7', client: 'Ресторан «Плов»', vehicleId: 'van-2', qty: 15, at: T0 + 2 * H }]);
    // и обратно: партия муки → какие партии продукции и заказы затронуты
    const flourLot = t.inputs[0]!.lot;
    expect(inv.affectedBy(flourLot.id).map((l) => l.id)).toEqual(expect.arrayContaining([a.id]));
  });
});

describe('Inventory — сколько хватит и что истекает', () => {
  it('дни запаса = остаток / средний расход в сутки за окно', () => {
    const inv = new Inventory(CATALOG);
    inv.receive({ materialId: 'flour', qty: 1000, supplier: 'A', at: T0 });
    for (let d = 0; d < 7; d++) inv.produce({ productId: 'baguette', kg: 100, at: T0 + d * D, shiftKey: `d${d}` }); // 60 кг муки в сутки
    expect(inv.stock('flour')).toBe(580);
    expect(inv.daysOfCover('flour', T0 + 7 * D, 7)).toBeCloseTo(580 / 60, 5);
    expect(inv.daysOfCover('butter', T0 + 7 * D, 7)).toBeNull(); // не расходуется
  });

  it('партии, у которых срок выходит в ближайшие N часов', () => {
    const inv = new Inventory(CATALOG);
    inv.receive({ materialId: 'flour', qty: 100, supplier: 'A', at: T0 });
    const lot = inv.produce({ productId: 'baguette', kg: 50, at: T0, shiftKey: 's' }).lot;
    expect(inv.expiring(T0 + 10 * H, 24).map((l) => l.id)).toEqual([lot.id]);
    expect(inv.expiring(T0 + 25 * H, 24).map((l) => l.id)).toEqual([]); // уже просрочена — отдельный список
    expect(inv.expired(T0 + 25 * H).map((l) => l.id)).toEqual([lot.id]);
  });

  it('списание просрочки: остаток партии уходит в потери, их видно за период', () => {
    const inv = new Inventory(CATALOG);
    inv.receive({ materialId: 'flour', qty: 100, supplier: 'A', at: T0 });
    const lot = inv.produce({ productId: 'baguette', kg: 50, at: T0, shiftKey: 's' }).lot;
    inv.writeOff(lot.id, T0 + 26 * H, 'срок годности');
    expect(inv.stock('baguette')).toBe(0);
    expect(inv.expired(T0 + 26 * H)).toEqual([]);
    expect(inv.writeOffs(T0, T0 + 2 * D)).toEqual([{ lotId: lot.id, itemId: 'baguette', qty: 50, at: T0 + 26 * H, reason: 'срок годности' }]);
  });
});
