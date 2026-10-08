/**
 * Жесты тачпада и колесо мыши → намерение для камеры.
 * В браузерах щипок на тачпаде (MacBook, Precision Touchpad в Windows) приходит как `wheel` с `ctrlKey: true`.
 */

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  /** 0 — пиксели, 1 — строки, 2 — страницы */
  deltaMode: number;
  ctrlKey: boolean;
  altKey: boolean;
  timeStamp: number;
}

export type CameraIntent =
  | { kind: 'zoom'; factor: number }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'orbit'; dx: number; dy: number }
  | { kind: 'none' };

const PINCH_K = 0.01;
const MAX_PINCH_STEP = 40;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** Колесо мыши: щелчок ≈ 100 px → масштаб ×1,16 */
const WHEEL_K = 0.0015;
const LINE_PX = 16;

function looksLikeMouseWheel(e: WheelInput): boolean {
  if (e.deltaMode !== 0) return true; // Firefox и др. шлют строки/страницы только с колеса
  return e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50;
}

/** Пока идёт жест тачпада (и его инерция), события с паузой меньше этой не переклассифицируются. */
const GESTURE_GAP_MS = 250;

export function createWheelInterpreter(): (e: WheelInput) => CameraIntent {
  let lastPanAt = Number.NEGATIVE_INFINITY;
  return (e) => {
    // Windows-тачпады шлют щипок крупными шагами — ограничиваем, чтобы зум не прыгал
    if (e.ctrlKey) return { kind: 'zoom', factor: Math.exp(clamp(e.deltaY, -MAX_PINCH_STEP, MAX_PINCH_STEP) * PINCH_K) };
    if (e.altKey) return { kind: 'orbit', dx: e.deltaX, dy: e.deltaY };
    const inTrackpadGesture = e.timeStamp - lastPanAt < GESTURE_GAP_MS;
    if (!inTrackpadGesture && looksLikeMouseWheel(e)) {
      const px = e.deltaY * (e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? 800 : 1);
      return { kind: 'zoom', factor: Math.exp(px * WHEEL_K) };
    }
    lastPanAt = e.timeStamp;
    return { kind: 'pan', dx: e.deltaX, dy: e.deltaY };
  };
}

export interface Vec {
  x: number;
  y: number;
  z: number;
}

/**
 * Масштаб «к курсору»: камера и центр вращения стягиваются к точке point (или от неё) в factor раз.
 * factor < 1 — приближение. Дистанция камера→центр ограничена [min, max].
 */
export function zoomAboutPoint(position: Vec, target: Vec, point: Vec, factor: number, limits: { min: number; max: number }): { position: Vec; target: Vec } {
  const dist = Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z);
  const next = Math.min(limits.max, Math.max(limits.min, dist * factor));
  const f = dist > 0 ? next / dist : 1;
  const scale = (v: Vec): Vec => ({ x: point.x + (v.x - point.x) * f, y: point.y + (v.y - point.y) * f, z: point.z + (v.z - point.z) * f });
  return { position: scale(position), target: scale(target) };
}
