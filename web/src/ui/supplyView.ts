import { vehicleState, type MaterialConfig, type ProductConfig, type SiteConfig, type Trip, type VehicleConfig } from '@bakery/shared';
import type { SupplySnapshot } from '../data/mockSupply';

const MIN = 60_000;
const HOUR = 60 * MIN;
/** Тележка-шпилька: 18 противней по ~2,5 кг. */
export const TROLLEY_KG = 45;
const OVEN_AHEAD_MIN = 75;
const COOLING_MIN = 45;

export type SupplyLevel = 'ok' | 'low' | 'critical';

export interface RawRow {
  material: MaterialConfig;
  stock: number;
  daysOfCover: number | null;
  level: SupplyLevel;
  /** Ближайший срок годности среди партий с остатком. */
  nearestExpiry: number | null;
  nextDelivery: number | null;
  lastDelivery: number | null;
}

export interface GoodsRow {
  product: ProductConfig;
  /** Упаковано, на складе. */
  packed: number;
  /** Выпущено, ждёт упаковки. */
  waiting: number;
  /** Упакованное, у которого срок выходит в ближайшие 12 ч. */
  expiringSoon: number;
  expired: number;
  producedToday: number;
  /** Списано (просрочка) за последние 7 дней. */
  writtenOff7d: number;
}

/** Машина поставщика у рампы приёмки — её id в выборе (у фургонов — id из config.supply.vehicles) и номер. */
export const SUPPLIER_VEHICLE = 'supplier';
export const SUPPLIER_PLATE = '01 X 555 SA';

export type SupplyTab = 'overview' | 'raw' | 'goods' | 'trips' | 'lots';

export interface SupplyAlert {
  level: 'warning' | 'critical';
  text: string;
  tab: SupplyTab;
}

export interface VehicleRow {
  vehicle: VehicleConfig;
  status: 'at_dock' | 'loading' | 'en_route';
  trip: Trip | null;
  next: Trip | null;
}

/** Поставка сырья для приёмки: когда, что и сколько. */
export interface DeliveryRow {
  at: number;
  material: MaterialConfig;
  qty: number;
  supplier: string;
}

export interface ReceivingView {
  /** Поставка, под которую машина поставщика стоит у рампы (за 15 мин до и 45 мин после). */
  atDock: DeliveryRow | null;
  /** Ближайшие будущие поставки по времени. */
  upcoming: DeliveryRow[];
}

/** Тележки на полу цеха: сколько кг и тележек (≈ TROLLEY_KG на тележку). */
export interface TrolleyLoad {
  kg: number;
  trolleys: number;
}

export interface FloorView {
  /** Тесто в расстойке и перед печами — партии, которые испекутся в ближайшие OVEN_AHEAD_MIN. */
  ovenQueue: TrolleyLoad;
  /** Хлеб на остывании — испечён за последние COOLING_MIN. */
  cooling: TrolleyLoad;
}

export interface SupplyView {
  raw: RawRow[];
  goods: GoodsRow[];
  vehicles: VehicleRow[];
  receiving: ReceivingView;
  floor: FloorView;
  alerts: SupplyAlert[];
  /** Рейсы с выездом в ближайшие/прошедшие 12 ч. */
  tripsToday: Trip[];
}

const fmt1 = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const kg = (v: number) => (v >= 1000 ? `${fmt1(v / 1000)} т` : `${Math.round(v)} кг`);

/**
 * Что показать по цепочке: уровень запаса сырья, склад готовой продукции, машины и предупреждения.
 * Пороги: сырья хватит меньше чем на 3 дня или остаток ниже минимума — «мало»;
 * меньше чем на 1,5 дня или ниже половины минимума — «критично».
 */
export function supplyView(snap: SupplySnapshot, config: SiteConfig, startOfToday: number): SupplyView {
  const supply = config.supply!;
  const inv = snap.inventory;
  const now = snap.now;

  const raw: RawRow[] = supply.materials.map((m) => {
    const stock = inv.stock(m.id);
    const daysOfCover = inv.daysOfCover(m.id, now);
    const level: SupplyLevel =
      (daysOfCover !== null && daysOfCover < 1.5) || stock < m.minStock * 0.5 ? 'critical' : (daysOfCover !== null && daysOfCover < 3) || stock < m.minStock ? 'low' : 'ok';
    const lots = inv.lots((l) => l.itemId === m.id);
    const deliveries = snap.deliveries.filter((d) => d.materialId === m.id);
    return {
      material: m,
      stock,
      daysOfCover,
      level,
      nearestExpiry: lots[0]?.expiresAt ?? null,
      nextDelivery: deliveries.find((d) => d.at > now)?.at ?? null,
      lastDelivery: deliveries.filter((d) => d.at <= now).at(-1)?.at ?? null,
    };
  });

  const goods: GoodsRow[] = supply.products.map((p) => ({
    product: p,
    packed: inv.stock(p.id, 'packed'),
    waiting: inv.stock(p.id, 'produced'),
    expiringSoon: inv.lots((l) => l.itemId === p.id && l.status === 'packed' && l.expiresAt > now && l.expiresAt <= now + 12 * HOUR).reduce((a, l) => a + l.qty, 0),
    expired: inv.lots((l) => l.itemId === p.id && l.expiresAt <= now).reduce((a, l) => a + l.qty, 0),
    producedToday: snap.production.filter((x) => x.productId === p.id && x.at >= startOfToday && x.at <= now).reduce((a, x) => a + x.kg, 0),
    writtenOff7d: inv.writeOffs(now - 7 * 24 * HOUR, now + 1).filter((w) => w.itemId === p.id).reduce((a, w) => a + w.qty, 0),
  }));

  const vehicles: VehicleRow[] = supply.vehicles.map((v) => ({ vehicle: v, ...vehicleState(v.id, snap.trips, now) }));

  const deliveries: DeliveryRow[] = snap.deliveries
    .flatMap((d) => {
      const material = supply.materials.find((m) => m.id === d.materialId);
      return material ? [{ at: d.at, material, qty: d.qty, supplier: d.supplier }] : [];
    })
    .sort((a, b) => a.at - b.at);
  const receiving: ReceivingView = {
    atDock: deliveries.find((d) => d.at > now - 45 * MIN && d.at < now + 15 * MIN) ?? null,
    upcoming: deliveries.filter((d) => d.at > now).slice(0, 4),
  };

  const alerts: SupplyAlert[] = [];
  for (const r of raw) {
    if (r.level === 'ok') continue;
    const cover = r.daysOfCover !== null ? `хватит на ${fmt1(r.daysOfCover)} дн.` : 'ниже минимума';
    const next = r.nextDelivery ? '' : ', поставка не запланирована';
    alerts.push({ level: r.level === 'critical' ? 'critical' : 'warning', text: `${r.material.name}: ${cover} (${kg(r.stock)})${next}`, tab: 'raw' });
  }
  const expired = goods.reduce((a, g) => a + g.expired, 0);
  if (expired > 0) alerts.push({ level: 'critical', text: `Просрочено и не отгружено: ${kg(expired)} — на списание`, tab: 'goods' });
  const lost = goods.reduce((a, g) => a + g.writtenOff7d, 0);
  const made = snap.production.filter((x) => x.at > now - 7 * 24 * HOUR && x.at <= now).reduce((a, x) => a + x.kg, 0);
  if (lost > 0 && made > 0 && lost / made > 0.02) {
    alerts.push({ level: 'warning', text: `Списано за 7 дней: ${kg(lost)} — ${fmt1((lost / made) * 100)} % выпуска`, tab: 'goods' });
  }
  for (const g of goods) {
    if (g.expiringSoon > 0) alerts.push({ level: 'warning', text: `${g.product.name}: ${kg(g.expiringSoon)} истекает в ближайшие 12 ч`, tab: 'goods' });
  }
  const recentShort = snap.shortages.filter((s) => s.kind === 'product' && s.at > now - 24 * HOUR);
  if (recentShort.length) {
    const total = recentShort.reduce((a, s) => a + s.missing, 0);
    alerts.push({ level: 'warning', text: `За сутки не хватило к отгрузке ${kg(total)} в ${new Set(recentShort.map((s) => s.ref)).size} заказах`, tab: 'trips' });
  }
  alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1));

  const tripsToday = snap.trips.filter((t) => t.departAt > now - 12 * HOUR && t.departAt < now + 12 * HOUR).sort((a, b) => a.departAt - b.departAt);
  const load = (kg: number): TrolleyLoad => ({ kg, trolleys: Math.ceil(kg / TROLLEY_KG) });
  const floor: FloorView = {
    ovenQueue: load((snap.planned ?? []).filter((p) => p.at > now && p.at <= now + OVEN_AHEAD_MIN * MIN).reduce((a, p) => a + p.kg, 0)),
    cooling: load(snap.production.filter((p) => p.at > now - COOLING_MIN * MIN && p.at <= now).reduce((a, p) => a + p.kg, 0)),
  };

  return { raw, goods, vehicles, receiving, floor, alerts, tripsToday };
}
