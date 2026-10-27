import { useSyncExternalStore } from 'react';
import { yardDemo, type DockDelivery, type Trip } from '@bakery/shared';

/**
 * Демо двора («▶ Показать двор»): короткие рейсы фургонов и поставка, начиная через ~40 с (yardDemo в packages/shared).
 * Живёт только в браузере и только для показа — склад и реальное расписание не меняет.
 */
export interface YardDemo {
  startedAt: number;
  trips: Trip[];
  deliveries: DockDelivery[];
}

let current: YardDemo | null = null;
const listeners = new Set<() => void>();

export function startYardDemo(vehicleIds: string[]): void {
  const now = Date.now();
  current = { startedAt: now, ...yardDemo(now, vehicleIds) };
  for (const l of listeners) l();
}

export function useYardDemo(): YardDemo | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
