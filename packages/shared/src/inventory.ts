/**
 * Цепочка «сырьё → производство → упаковка → склад готовой продукции → отгрузка»:
 * партии, остатки, списание по рецептуре (FEFO), прослеживаемость.
 * Чистая модель без времени «сейчас»: каждое действие несёт свой момент at.
 */

const DAY = 24 * 3_600_000;

export interface MaterialConfig {
  id: string;
  name: string;
  /** Единица учёта: кг, л, шт. */
  unit: string;
  /** Где хранится: сухой склад или холодильная камера сырья. */
  storage: 'dry' | 'cold';
  /** Ниже этого остатка — пора заказывать. */
  minStock: number;
  shelfLifeDays: number;
  /** Сколько в одной упаковке поставщика (мешок 50 кг) — для 3D-склада. */
  packSize?: number;
}

export interface ProductConfig {
  id: string;
  name: string;
  shelfLifeDays: number;
  /** Хранится в морозильной камере. */
  frozen: boolean;
  /** Сырьё на 1 кг продукции, кг (или ед. сырья) по id материала. */
  recipe: Record<string, number>;
}

export interface Catalog {
  materials: MaterialConfig[];
  products: ProductConfig[];
}

export type LotStatus = 'produced' | 'packed';

export interface Lot {
  id: string;
  itemId: string;
  kind: 'raw' | 'product';
  /** Остаток в партии. */
  qty: number;
  initialQty: number;
  at: number;
  expiresAt: number;
  /** Только для продукции: выпущена (ждёт упаковки) или упакована (на складе ГП). */
  status?: LotStatus;
  packedAt?: number;
  source: { supplier: string } | { shiftKey: string; inputs: { lotId: string; qty: number }[] };
}

export interface Consumption {
  lotId: string;
  itemId: string;
  qty: number;
}

export interface Shipment {
  orderId: string;
  client: string;
  vehicleId: string;
  at: number;
  picks: { lotId: string; productId: string; qty: number }[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export class Inventory {
  private readonly lotsById = new Map<string, Lot>();
  private readonly consumption: { at: number; materialId: string; qty: number }[] = [];
  private readonly shipments: Shipment[] = [];
  private readonly losses: { lotId: string; itemId: string; qty: number; at: number; reason: string }[] = [];
  private seq = 0;

  constructor(readonly catalog: Catalog) {}

  private material(id: string) {
    const m = this.catalog.materials.find((x) => x.id === id);
    if (!m) throw new Error(`неизвестное сырьё «${id}»`);
    return m;
  }

  private product(id: string) {
    const p = this.catalog.products.find((x) => x.id === id);
    if (!p) throw new Error(`неизвестная продукция «${id}»`);
    return p;
  }

  private nextId(prefix: string, at: number) {
    this.seq++;
    const d = new Date(at).toISOString().slice(2, 10).replace(/-/g, '');
    return `${prefix}-${d}-${String(this.seq).padStart(4, '0')}`;
  }

  /** Партии в порядке FEFO: первой — та, что раньше испортится. */
  private fefo(itemId: string, filter: (l: Lot) => boolean = () => true) {
    return [...this.lotsById.values()]
      .filter((l) => l.itemId === itemId && l.qty > 1e-9 && filter(l))
      .sort((a, b) => a.expiresAt - b.expiresAt || a.at - b.at);
  }

  receive(p: { materialId: string; qty: number; supplier: string; at: number; expiresAt?: number; lotId?: string }): Lot {
    const m = this.material(p.materialId);
    const lot: Lot = {
      id: p.lotId ?? this.nextId('С', p.at),
      itemId: m.id,
      kind: 'raw',
      qty: p.qty,
      initialQty: p.qty,
      at: p.at,
      expiresAt: p.expiresAt ?? p.at + m.shelfLifeDays * DAY,
      source: { supplier: p.supplier },
    };
    this.lotsById.set(lot.id, lot);
    return lot;
  }

  /**
   * Выпуск продукции по рецептуре: списывает сырьё FEFO. Если чего-то не хватает,
   * выпускает столько, на сколько хватило самого дефицитного сырья.
   */
  produce(p: { productId: string; kg: number; at: number; shiftKey: string }): { lot: Lot; consumed: Consumption[]; shortages: { materialId: string; missing: number }[] } {
    const prod = this.product(p.productId);
    const recipe = Object.entries(prod.recipe);
    let kg = p.kg;
    const shortages: { materialId: string; missing: number }[] = [];
    for (const [materialId, perKg] of recipe) {
      const have = this.stock(materialId);
      const need = p.kg * perKg;
      if (have + 1e-9 < need) {
        shortages.push({ materialId, missing: r3(need - have) });
        kg = Math.min(kg, have / perKg);
      }
    }
    kg = r3(kg);
    const consumed: Consumption[] = [];
    for (const [materialId, perKg] of recipe) {
      let left = r3(kg * perKg);
      for (const lot of this.fefo(materialId)) {
        if (left <= 1e-9) break;
        const take = r3(Math.min(lot.qty, left));
        lot.qty = r3(lot.qty - take);
        left = r3(left - take);
        consumed.push({ lotId: lot.id, itemId: materialId, qty: take });
      }
      const used = r3(kg * perKg);
      if (used > 0) this.consumption.push({ at: p.at, materialId, qty: used });
    }
    const lot: Lot = {
      id: this.nextId('П', p.at),
      itemId: prod.id,
      kind: 'product',
      qty: kg,
      initialQty: kg,
      at: p.at,
      expiresAt: p.at + prod.shelfLifeDays * DAY,
      status: 'produced',
      source: { shiftKey: p.shiftKey, inputs: consumed.map((c) => ({ lotId: c.lotId, qty: c.qty })) },
    };
    this.lotsById.set(lot.id, lot);
    return { lot, consumed, shortages };
  }

  /** Партия упакована и ушла на склад готовой продукции. */
  pack(lotId: string, at: number): void {
    const lot = this.lotsById.get(lotId);
    if (!lot || lot.kind !== 'product') throw new Error(`нет партии продукции «${lotId}»`);
    lot.status = 'packed';
    lot.packedAt = at;
  }

  /** Отгрузка заказа: только упакованная продукция, FEFO. */
  ship(p: { orderId: string; client: string; lines: { productId: string; kg: number }[]; vehicleId: string; at: number }): { picks: Shipment['picks']; shortages: { productId: string; missing: number }[] } {
    const picks: Shipment['picks'] = [];
    const shortages: { productId: string; missing: number }[] = [];
    for (const line of p.lines) {
      let left = line.kg;
      for (const lot of this.fefo(line.productId, (l) => l.status === 'packed' && l.expiresAt > p.at)) {
        if (left <= 1e-9) break;
        const take = r3(Math.min(lot.qty, left));
        lot.qty = r3(lot.qty - take);
        left = r3(left - take);
        picks.push({ lotId: lot.id, productId: line.productId, qty: take });
      }
      if (left > 1e-9) shortages.push({ productId: line.productId, missing: r3(left) });
    }
    if (picks.length) this.shipments.push({ orderId: p.orderId, client: p.client, vehicleId: p.vehicleId, at: p.at, picks });
    return { picks, shortages };
  }

  /** Списание остатка партии (просрочка, брак) — уходит в потери. */
  writeOff(lotId: string, at: number, reason: string): void {
    const lot = this.lotsById.get(lotId);
    if (!lot || lot.qty <= 0) return;
    this.losses.push({ lotId, itemId: lot.itemId, qty: lot.qty, at, reason });
    lot.qty = 0;
  }

  /** Списания за период [fromMs, toMs). */
  writeOffs(fromMs: number, toMs = Infinity): { lotId: string; itemId: string; qty: number; at: number; reason: string }[] {
    return this.losses.filter((l) => l.at >= fromMs && l.at < toMs);
  }

  /** Остаток по сырью или продукции; для продукции можно отдельно «ждёт упаковки» / «упаковано». */
  stock(itemId: string, status?: LotStatus): number {
    return r3(this.fefo(itemId, (l) => !status || l.status === status).reduce((a, l) => a + l.qty, 0));
  }

  lots(filter: (l: Lot) => boolean = () => true): Lot[] {
    return [...this.lotsById.values()].filter((l) => l.qty > 1e-9 && filter(l)).sort((a, b) => a.expiresAt - b.expiresAt);
  }

  lot(id: string): Lot | undefined {
    return this.lotsById.get(id);
  }

  /** На сколько суток хватит сырья при среднем расходе за windowDays. null — сырьё не расходуется. */
  daysOfCover(materialId: string, now: number, windowDays = 7): number | null {
    const used = this.consumption.filter((c) => c.materialId === materialId && c.at >= now - windowDays * DAY && c.at <= now).reduce((a, c) => a + c.qty, 0);
    if (used <= 0) return null;
    return this.stock(materialId) / (used / windowDays);
  }

  /** Партии с остатком, у которых срок выходит в ближайшие withinHours. */
  expiring(now: number, withinHours: number): Lot[] {
    return this.lots((l) => l.expiresAt > now && l.expiresAt <= now + withinHours * 3_600_000);
  }

  /** Просроченные партии с остатком — их нельзя отгружать. */
  expired(now: number): Lot[] {
    return this.lots((l) => l.expiresAt <= now);
  }

  recentShipments(fromMs: number, toMs = Infinity): Shipment[] {
    return this.shipments.filter((s) => s.at >= fromMs && s.at < toMs);
  }

  /** Из каких партий сырья сделана партия продукции и кому она уехала. */
  trace(lotId: string): { lot: Lot; inputs: { lot: Lot; qty: number }[]; shipments: { orderId: string; client: string; vehicleId: string; qty: number; at: number }[] } {
    const lot = this.lotsById.get(lotId);
    if (!lot) throw new Error(`нет партии «${lotId}»`);
    const inputs = 'inputs' in lot.source ? lot.source.inputs.map((i) => ({ lot: this.lotsById.get(i.lotId)!, qty: i.qty })) : [];
    const shipments = this.shipments.flatMap((s) =>
      s.picks.filter((p) => p.lotId === lotId).map((p) => ({ orderId: s.orderId, client: s.client, vehicleId: s.vehicleId, qty: p.qty, at: s.at })),
    );
    return { lot, inputs, shipments };
  }

  /** Обратная прослеживаемость: какие партии продукции сделаны из этой партии сырья. */
  affectedBy(rawLotId: string): Lot[] {
    return [...this.lotsById.values()].filter((l) => 'inputs' in l.source && l.source.inputs.some((i) => i.lotId === rawLotId));
  }
}
