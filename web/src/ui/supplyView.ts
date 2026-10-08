import { vehicleState, type MaterialConfig, type ProductConfig, type SiteConfig, type Trip, type VehicleConfig } from '@bakery/shared';
import type { SupplySnapshot } from '../data/mockSupply';

const HOUR = 3_600_000;

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

export interface SupplyView {
  raw: RawRow[];
  goods: GoodsRow[];
  vehicles: VehicleRow[];
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
  return { raw, goods, vehicles, alerts, tripsToday };
}
