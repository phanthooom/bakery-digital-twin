/** Машины и рейсы доставки: где машина сейчас — по расписанию рейса (позже — по GPS-трекеру). */

export interface VehicleConfig {
  id: string;
  name: string;
  /** Госномер. */
  plate: string;
  capacityKg: number;
  refrigerated: boolean;
}

export interface TripOrder {
  orderId: string;
  client: string;
  kg: number;
  /** Точка доставки на карте (WGS84). */
  lat?: number;
  lon?: number;
}

export interface Trip {
  id: string;
  vehicleId: string;
  /** Выезд от рампы, мс. */
  departAt: number;
  /** Возврат к рампе, мс. */
  returnAt: number;
  /** Сколько минут до выезда идёт погрузка. */
  loadMinutes: number;
  orders: TripOrder[];
}

export type TripStatus = 'planned' | 'loading' | 'en_route' | 'returned';

export function tripStatus(t: Trip, now: number): TripStatus {
  if (now < t.departAt - t.loadMinutes * 60_000) return 'planned';
  if (now < t.departAt) return 'loading';
  if (now < t.returnAt) return 'en_route';
  return 'returned';
}

export type VehicleStatus = 'at_dock' | 'loading' | 'en_route';

/** Состояние машины сейчас: текущий рейс (погрузка или в пути) и ближайший следующий. */
export function vehicleState(vehicleId: string, trips: Trip[], now: number): { status: VehicleStatus; trip: Trip | null; next: Trip | null } {
  const mine = trips.filter((t) => t.vehicleId === vehicleId).sort((a, b) => a.departAt - b.departAt);
  const trip = mine.find((t) => {
    const s = tripStatus(t, now);
    return s === 'loading' || s === 'en_route';
  }) ?? null;
  const next = mine.find((t) => t !== trip && tripStatus(t, now) === 'planned') ?? null;
  const status: VehicleStatus = trip ? (tripStatus(trip, now) === 'loading' ? 'loading' : 'en_route') : 'at_dock';
  return { status, trip, next };
}
