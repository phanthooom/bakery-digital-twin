import { Inventory, localParts, mulberry32, shiftAt, type SiteConfig, type Trip, type TripOrder } from '@bakery/shared';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Клиенты HoReCa для демо (вымышленные) с точками на карте Ташкента. */
export const DEMO_CLIENTS: { name: string; lat: number; lon: number }[] = [
  { name: 'Кафе «Демо-Бодом»', lat: 41.3111, lon: 69.2797 },
  { name: 'Ресторан «Демо-Чинор»', lat: 41.2995, lon: 69.2401 },
  { name: 'Кофейня «Демо-Зерно»', lat: 41.3264, lon: 69.2848 },
  { name: 'Отель «Демо-Сафар»', lat: 41.2856, lon: 69.2034 },
  { name: 'Бургерная «Демо-Гриль»', lat: 41.3381, lon: 69.3346 },
  { name: 'Кафе «Демо-Лагман»', lat: 41.3523, lon: 69.2866 },
  { name: 'Пекарня-кафе «Демо-Утро»', lat: 41.2742, lon: 69.2161 },
  { name: 'Ресторан «Демо-Сад»', lat: 41.3154, lon: 69.3215 },
  { name: 'Кейтеринг «Демо-Той»', lat: 41.2632, lon: 69.2539 },
  { name: 'Кофейня «Демо-Бариста»', lat: 41.3032, lon: 69.2687 },
  { name: 'Супермаркет «Демо-Маркет»', lat: 41.3427, lon: 69.2155 },
  { name: 'Гостиница «Демо-Шахар»', lat: 41.2925, lon: 69.3121 },
];

/** Поставки сырья: каждые N суток в час H, объём (± разброс). */
const DELIVERIES: Record<string, { everyDays: number; hour: number; qty: [number, number] }> = {
  flour: { everyDays: 3, hour: 7, qty: [1500, 1800] },
  sugar: { everyDays: 4, hour: 9, qty: [450, 550] },
  salt: { everyDays: 7, hour: 9, qty: [140, 160] },
  milk: { everyDays: 5, hour: 10, qty: [90, 110] },
  butter: { everyDays: 3, hour: 8, qty: [280, 330] },
  yeast: { everyDays: 3, hour: 8, qty: [50, 60] },
  eggs: { everyDays: 3, hour: 8, qty: [110, 130] },
};

/** Выпуск: [местный час, продукция, кг от-до]. Ночью пекут к утренним рейсам. */
const BATCHES: [number, string, [number, number]][] = [
  [7.5, 'baguette', [60, 90]], [7.5, 'burger-bun', [60, 90]], [8, 'toast', [55, 75]], [11, 'ciabatta', [45, 65]], [11, 'burger-bun', [50, 80]],
  [15, 'croissant', [80, 120]], [16, 'burger-bun', [40, 60]], [18.5, 'croissant', [70, 100]], [19, 'baguette', [30, 50]],
  [23.5, 'baguette', [80, 120]], [23.5, 'ciabatta', [45, 65]], [2.5, 'baguette', [60, 90]], [2.5, 'toast', [30, 50]], [3, 'croissant', [50, 80]],
];

/** Рейсы: машина, выезд и возврат (местные часы). */
const TRIPS: [string, number, number][] = [
  ['van-1', 5.5, 9.5], ['van-2', 6.5, 10.5], ['van-3', 8, 11.5], ['van-1', 13.5, 16.5], ['van-2', 15.5, 18.5],
];

/** Что и в каких долях заказывают. */
const ORDER_MIX: [string, number][] = [['baguette', 3], ['burger-bun', 3], ['ciabatta', 1.5], ['toast', 1.5], ['croissant', 2]];

type Ev =
  | { at: number; type: 'receive'; materialId: string; qty: number; supplier: string }
  | { at: number; type: 'produce'; productId: string; kg: number; key: number }
  | { at: number; type: 'pack'; ref: number }
  | { at: number; type: 'writeoff' }
  | { at: number; type: 'ship'; trip: Trip; order: TripOrder; lines: { productId: string; kg: number }[] };

export interface DeliveryRecord {
  at: number;
  materialId: string;
  qty: number;
  supplier: string;
  lotId: string | null;
}

export interface ShortageRecord {
  at: number;
  kind: 'material' | 'product';
  itemId: string;
  missing: number;
  ref: string;
}

export interface SupplySnapshot {
  now: number;
  inventory: Inventory;
  trips: Trip[];
  /** Поставки сырья за период и ожидаемые на неделю вперёд. */
  deliveries: DeliveryRecord[];
  /** Выпуск: партия, продукция, кг, смена. */
  production: { at: number; productId: string; kg: number; lotId: string; shiftKey: string }[];
  shortages: ShortageRecord[];
}

/**
 * Демо-цепочка: поставки сырья, выпуск по сменам со списанием по рецептуре, упаковка, заказы и рейсы.
 * События детерминированы (ГПСЧ по номеру дня) — снимок на любой момент воспроизводим.
 */
export class SupplySim {
  private readonly events: Ev[] = [];
  private readonly trips: Trip[] = [];
  private cache: { at: number; snap: SupplySnapshot } | null = null;

  /** Местная полночь (мс UTC) суток, в которые попадает t. */
  static localMidnight(t: number, timezone: string): number {
    return Date.parse(`${localParts(t, timezone).date}T00:00:00${tzSuffix(timezone)}`);
  }

  /** origin — местная полночь первого дня истории. */
  constructor(private readonly config: SiteConfig, readonly origin: number, days: number, seed = 42) {
    const supply = config.supply!;
    const tz = config.site.timezone;
    const dayStart = (i: number) => origin + i * DAY;
    // начальные остатки: по 3 «минимума» каждого сырья
    for (const m of supply.materials) this.events.push({ at: origin, type: 'receive', materialId: m.id, qty: m.minStock * 2, supplier: supply.suppliers[m.id] ?? 'Поставщик' });
    for (let i = 0; i < days + 2; i++) {
      const rnd = mulberry32(seed * 1000 + i);
      const between = ([a, b]: [number, number]) => Math.round(a + (b - a) * rnd());
      const at = (h: number) => dayStart(i) + h * HOUR;
      for (const [materialId, d] of Object.entries(DELIVERIES)) {
        // для демо: последняя поставка дрожжей сорвалась — видно предупреждение «заканчивается»
        if (materialId === 'yeast' && i >= days - 2) continue;
        if (i > 0 && i % d.everyDays === 0) this.events.push({ at: at(d.hour), type: 'receive', materialId, qty: between(d.qty), supplier: supply.suppliers[materialId] ?? 'Поставщик' });
      }
      // каждое утро в 05:00 списываем то, у чего вышел срок годности
      if (i > 0) this.events.push({ at: at(5), type: 'writeoff' });
      for (const [h, productId, kg] of BATCHES) {
        const t = at(h < 6 ? h + 24 : h); // ночные партии — уже следующие сутки
        const idx = this.events.length;
        this.events.push({ at: t, type: 'produce', productId, kg: between(kg), key: idx });
        const prod = supply.products.find((p) => p.id === productId)!;
        this.events.push({ at: t + (prod.frozen ? 4 * HOUR : 90 * MIN), type: 'pack', ref: idx });
      }
      TRIPS.forEach(([vehicleId, dep, ret], k) => {
        const n = 3 + Math.floor(rnd() * 4);
        const orders: TripOrder[] = [];
        const lineSets: { productId: string; kg: number }[][] = [];
        for (let o = 0; o < n; o++) {
          const client = DEMO_CLIENTS[Math.floor(rnd() * DEMO_CLIENTS.length)]!;
          const lines: { productId: string; kg: number }[] = [];
          const count = 1 + Math.floor(rnd() * 3);
          for (let l = 0; l < count; l++) {
            const productId = pickWeighted(ORDER_MIX, rnd());
            if (lines.some((x) => x.productId === productId)) continue;
            lines.push({ productId, kg: 10 + Math.round(rnd() * 6) * 5 });
          }
          orders.push({ orderId: `З-${localParts(at(dep), tz).date.slice(5).replace('-', '')}-${k + 1}${o + 1}`, client: client.name, kg: lines.reduce((a, x) => a + x.kg, 0), lat: client.lat, lon: client.lon });
          lineSets.push(lines);
        }
        const trip: Trip = { id: `Р-${localParts(at(dep), tz).date.slice(5).replace('-', '')}-${k + 1}`, vehicleId, departAt: at(dep), returnAt: at(ret), loadMinutes: 40, orders };
        this.trips.push(trip);
        orders.forEach((order, o) => this.events.push({ at: trip.departAt - 15 * MIN, type: 'ship', trip, order, lines: lineSets[o]! }));
      });
    }
    this.events.sort((a, b) => a.at - b.at);
  }

  /** Состояние цепочки на момент now (пересчёт не чаще раза в 20 с). */
  snapshot(now: number): SupplySnapshot {
    if (this.cache && Math.abs(now - this.cache.at) < 20_000) return this.cache.snap;
    const supply = this.config.supply!;
    const inv = new Inventory({ materials: supply.materials, products: supply.products });
    const lotByEvent = new Map<number, string>();
    const deliveries: DeliveryRecord[] = [];
    const production: SupplySnapshot['production'] = [];
    const shortages: ShortageRecord[] = [];
    const shifts = this.config.energy?.shifts;
    this.events.forEach((e) => {
      if (e.at > now) {
        if (e.type === 'receive' && e.at < now + 7 * DAY && e.at > this.origin) deliveries.push({ at: e.at, materialId: e.materialId, qty: e.qty, supplier: e.supplier, lotId: null });
        return;
      }
      if (e.type === 'receive') {
        const lot = inv.receive({ materialId: e.materialId, qty: e.qty, supplier: e.supplier, at: e.at });
        if (e.at > this.origin) deliveries.push({ at: e.at, materialId: e.materialId, qty: e.qty, supplier: e.supplier, lotId: lot.id });
      } else if (e.type === 'produce') {
        const s = shifts ? shiftAt(e.at, shifts, this.config.site.timezone) : null;
        const shiftKey = s ? `${s.date}#${s.shiftId}` : '';
        const r = inv.produce({ productId: e.productId, kg: e.kg, at: e.at, shiftKey });
        lotByEvent.set(e.key, r.lot.id);
        production.push({ at: e.at, productId: e.productId, kg: r.lot.qty, lotId: r.lot.id, shiftKey });
        for (const sh of r.shortages) shortages.push({ at: e.at, kind: 'material', itemId: sh.materialId, missing: sh.missing, ref: r.lot.id });
      } else if (e.type === 'writeoff') {
        for (const l of inv.expired(e.at)) inv.writeOff(l.id, e.at, 'срок годности');
      } else if (e.type === 'pack') {
        const id = lotByEvent.get(e.ref);
        if (id && inv.lot(id)!.qty > 0) inv.pack(id, e.at);
      } else {
        const r = inv.ship({ orderId: e.order.orderId, client: e.order.client, lines: e.lines, vehicleId: e.trip.vehicleId, at: e.at });
        for (const sh of r.shortages) shortages.push({ at: e.at, kind: 'product', itemId: sh.productId, missing: sh.missing, ref: e.order.orderId });
      }
    });
    const snap: SupplySnapshot = { now, inventory: inv, trips: this.trips, deliveries, production, shortages };
    this.cache = { at: now, snap };
    return snap;
  }
}

function pickWeighted(items: [string, number][], r: number): string {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let x = r * total;
  for (const [id, w] of items) {
    x -= w;
    if (x <= 0) return id;
  }
  return items[items.length - 1]![0];
}

/** «+05:00» для зоны (для Asia/Tashkent — постоянное смещение). */
function tzSuffix(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(Date.UTC(2000, 0, 1));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(name);
  return m ? `${m[1]}:${m[2] ?? '00'}` : 'Z';
}
