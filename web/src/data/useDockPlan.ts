import { useMemo, useSyncExternalStore } from 'react';
import { palletsFor, supplierUnloadings, tripLoadings, vanVisits, type DockVisit, type SupplierUnloading, type Trip, type TripLoading } from '@bakery/shared';
import { useDataSource, useSupply } from './store';

export interface DockPlan {
  /** По фургонам: визиты к рампе и погрузки рейсов. */
  vans: Map<string, { visits: DockVisit[]; loadings: TripLoading[] }>;
  /** Разгрузки поставщика у рампы приёмки. */
  supplier: SupplierUnloading[];
}

/** Ключ списка рейсов: меняется, когда появился срочный рейс (заказ из Telegram, сквозной цикл). */
const tripsKey = (trips: Trip[]) => `${trips.length}:${trips.slice(0, 6).map((t) => t.id).join(',')}`;

/**
 * Расписание машин у рамп — те же функции, по которым склад списывает и приходует груз (packages/shared/src/dock.ts).
 * Снимок цепочки обновляется раз в 30 с, а срочный рейс подхватывается сразу, по уведомлению источника данных.
 */
export function useDockPlan(): DockPlan | null {
  const ds = useDataSource();
  const snap = useSupply();
  // момент снимка, а не Date.now(): снимок цепочки берётся из кэша источника, свежими приходят только срочные рейсы
  const at = snap?.now ?? 0;
  const key = useSyncExternalStore(
    (cb) => ds.subscribe(cb),
    () => {
      const s = at ? ds.getSupply?.(at) : null;
      return s ? tripsKey(s.trips) : '';
    },
  );
  return useMemo(() => {
    const supply = ds.config.supply;
    if (!snap || !supply) return null;
    const live = ds.getSupply?.(snap.now);
    const trips = live && tripsKey(live.trips) === key ? live.trips : snap.trips;
    const vans = new Map(supply.vehicles.map((v) => [v.id, { visits: vanVisits(trips, v.id), loadings: tripLoadings(trips, v.id, v.capacityKg) }]));
    const packKg = new Map(supply.materials.map((m) => [m.id, m.packSize ?? 25]));
    const supplier = supplierUnloadings(snap.deliveries.map((d) => ({ id: `${d.materialId}@${d.at}`, at: d.at, pallets: palletsFor(d.qty, packKg.get(d.materialId)) })));
    return { vans, supplier };
  }, [ds, snap, key]);
}
