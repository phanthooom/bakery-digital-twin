import { useSyncExternalStore } from 'react';
import type { Outputs } from '../ui/energyReport';

/**
 * Выпуск продукции за смену (кг), который мастер вводит вручную.
 * Пока хранится в браузере (localStorage); с бэкендом переедет в API, интерфейс тот же.
 */
const KEY = 'bakery.output.v1';
const listeners = new Set<() => void>();

function load(): Outputs {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === 'number' && v > 0)) as Outputs;
  } catch {
    return {};
  }
}

let current: Outputs = load();

export function setOutput(shiftKey: string, kg: number | null): void {
  const next = { ...current };
  if (kg && kg > 0) next[shiftKey] = Math.round(kg * 10) / 10;
  else delete next[shiftKey];
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // приватный режим или запрет хранилища — значение живёт до перезагрузки
  }
  for (const l of listeners) l();
}

export function useOutputs(): Outputs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
