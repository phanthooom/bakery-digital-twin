import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { useNow } from '../ui/useNow';
import type { SupplySnapshot } from './mockSupply';
import { validateSiteConfig, type EquipmentState } from '@bakery/shared';
import rawConfig from '../../../config/equipment.json';
import type { DataSource } from './DataSource';
import { MockDataSource } from './MockDataSource';

export function createDataSource(): DataSource {
  const { config, errors } = validateSiteConfig(rawConfig);
  if (!config) throw new Error(`config/equipment.json: ${errors.join('; ')}`);
  const mode = import.meta.env.VITE_DATA_SOURCE ?? 'mock';
  if (mode !== 'mock') console.warn(`VITE_DATA_SOURCE=${mode} пока не реализован, используется мок`);
  return new MockDataSource(config);
}

export const DataSourceContext = createContext<DataSource | null>(null);

export function useDataSource(): DataSource {
  const ds = useContext(DataSourceContext);
  if (!ds) throw new Error('DataSourceContext не задан');
  return ds;
}

export function useStates(): ReadonlyMap<string, EquipmentState> {
  const ds = useDataSource();
  return useSyncExternalStore(
    useCallback((cb) => ds.subscribe(cb), [ds]),
    () => ds.getStates(),
  );
}

/** Состояние одного станка — компонент перерисуется только при его изменении. */
export function useEquipmentState(id: string): EquipmentState | undefined {
  const ds = useDataSource();
  return useSyncExternalStore(
    useCallback((cb) => ds.subscribe(cb), [ds]),
    () => ds.getStates().get(id),
  );
}

/** Снимок цепочки поставок; обновляется раз в 30 с (склад и рейсы меняются медленно). */
export function useSupply(): SupplySnapshot | null {
  const ds = useDataSource();
  const now = useNow(30_000);
  return useMemo(() => ds.getSupply?.(now) ?? null, [ds, now]);
}
