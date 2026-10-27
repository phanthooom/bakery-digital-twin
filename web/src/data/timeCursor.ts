import { useEffect, useState, useSyncExternalStore } from 'react';
import { SupplySim } from './mockSupply';

/**
 * Курсор времени «Машины времени»: интерфейс показывает либо «сейчас», либо выбранный момент в прошлом,
 * который можно проигрывать с ускорением. Вне React (в useFrame сцены) время берётся через sceneNow().
 */
export type TimeCursor =
  | { mode: 'live' }
  | {
      mode: 'past';
      /** Момент в прошлом, с которого идёт отсчёт (мс UTC). */
      anchorT: number;
      /** performance.now() в момент установки якоря. */
      anchorWall: number;
      /** Во сколько раз быстрее реального времени идёт проигрывание (0 — пауза). */
      speed: number;
    };

let cursor: TimeCursor = { mode: 'live' };
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** Текущее время сцены: «сейчас» или проигрываемый момент в прошлом (не дальше «сейчас»). */
export function sceneNow(): number {
  if (cursor.mode === 'live') return Date.now();
  const t = cursor.anchorT + (performance.now() - cursor.anchorWall) * cursor.speed;
  return Math.min(t, Date.now());
}

export function getTimeCursor(): TimeCursor {
  return cursor;
}

/** Перейти в момент t (на паузе или продолжая проигрывание с той же скоростью). */
export function seekTo(t: number, speed = cursor.mode === 'past' ? cursor.speed : 0): void {
  if (t >= Date.now() - 1000) return goLive();
  cursor = { mode: 'past', anchorT: t, anchorWall: performance.now(), speed };
  emit();
}

/** Проигрывать с ускорением (×1, ×10, ×60…) или поставить на паузу (0). */
export function setSpeed(speed: number): void {
  if (cursor.mode !== 'past') return;
  cursor = { mode: 'past', anchorT: sceneNow(), anchorWall: performance.now(), speed };
  emit();
}

export function goLive(): void {
  if (cursor.mode === 'live') return;
  cursor = { mode: 'live' };
  emit();
}

export function subscribeTimeCursor(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useTimeCursor(): TimeCursor {
  return useSyncExternalStore(subscribeTimeCursor, getTimeCursor);
}

/**
 * Время сцены, округлённое вниз до stepMs: компонент перерисуется, когда оно сменит шаг.
 * Вживую ведёт себя как useNow(stepMs); в прошлом — идёт вместе с проигрыванием и прыгает при перемотке.
 */
export function useSceneTime(stepMs: number): number {
  const c = useTimeCursor();
  const quant = () => Math.floor(sceneNow() / stepMs) * stepMs;
  const [t, setT] = useState(quant);
  useEffect(() => {
    setT(quant());
    const playing = c.mode === 'live' || c.speed > 0;
    if (!playing) return;
    // при ускоренном проигрывании шаг наступает чаще в реальном времени
    const every = Math.max(100, Math.min(stepMs, c.mode === 'past' ? stepMs / c.speed : stepMs));
    const id = setInterval(() => setT(quant()), every);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, stepMs]);
  return t;
}

/**
 * Момент из ссылки: ?t=2026-10-27T22:40:05Z (как в уведомлении об аварии) или ?t=03:40 / 03:40:15 — время цеха сегодня
 * (если оно ещё не наступило — вчера). null — параметра нет или он не разобрался.
 */
export function parseTimeParam(value: string | null, now: number, timezone: string): number | null {
  if (!value) return null;
  const v = value.trim();
  const hm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v);
  if (hm) {
    const [h, m, s] = [Number(hm[1]), Number(hm[2]), Number(hm[3] ?? 0)];
    if (h > 23 || m > 59 || s > 59) return null;
    let t = SupplySim.localMidnight(now, timezone) + ((h * 60 + m) * 60 + s) * 1000;
    if (t > now) t -= 24 * 3_600_000;
    return t;
  }
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}
