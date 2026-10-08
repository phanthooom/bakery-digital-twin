import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type Viewport = [number, number];

export interface Insets {
  left: number;
  right: number;
}

const EASE = 0.28; // Доля пути к цели за кадр (плавный зум без рывков)
const FRICTION = 0.92; // Затухание инерции после свайпа пальцем/мышью
const PINCH_ZOOM_SPEED = 0.01;
const SCROLL_ZOOM_SPEED = 0.0025;

export function clampViewport(
  [start, end]: Viewport,
  total: number,
  minSpan = 3
): Viewport {
  const max = Math.max(0, total - 1);
  const span = Math.min(max, Math.max(Math.min(minSpan, max), end - start));
  const s = Math.min(Math.max(0, start), max - span);
  return [s, s + span];
}

export function isViewportZoomed(view: Viewport, total: number): boolean {
  return total > 1 && (view[0] > 0.02 || view[1] < total - 1 - 0.02);
}

/**
 * Плавный видимый диапазон [start, end] (дробные индексы точек) для графика по оси X.
 *
 * - свайп двумя пальцами вверх/вниз на тачпаде или колесо мыши — масштаб вокруг курсора;
 * - щипок двумя пальцами (wheel + ctrlKey), Ctrl+колесо, Safari gesture* — масштаб;
 * - горизонтальный свайп двумя пальцами / Shift+колесо — прокрутка по времени;
 * - перетаскивание мышью или пальцем — прокрутка с инерцией;
 * - двойной клик — сброс на весь период.
 */
export function useChartViewport(
  ref: RefObject<HTMLElement | null>,
  total: number,
  insets: Insets = { left: 40, right: 16 },
  minSpan = 3
) {
  const full = useCallback((): Viewport => [0, Math.max(0, total - 1)], [total]);
  const [view, setView] = useState<Viewport>(full);
  const current = useRef<Viewport>(full());
  const target = useRef<Viewport>(full());
  const velocity = useRef(0); // индексов за кадр
  const frame = useRef<number | null>(null);

  const clamp = useCallback(
    (next: Viewport): Viewport => clampViewport(next, total, minSpan),
    [total, minSpan]
  );

  const tick = useCallback(() => {
    frame.current = null;
    if (velocity.current) {
      const [s, e] = target.current;
      target.current = clamp([s + velocity.current, e + velocity.current]);
      velocity.current *= FRICTION;
      if (Math.abs(velocity.current) < 0.002) velocity.current = 0;
    }
    const [cs, ce] = current.current;
    const [ts, te] = target.current;
    const next: Viewport = [cs + (ts - cs) * EASE, ce + (te - ce) * EASE];
    const settled = Math.abs(ts - next[0]) < 0.001 && Math.abs(te - next[1]) < 0.001;
    current.current = settled ? target.current : next;
    setView(current.current);
    if (!settled || velocity.current) frame.current = requestAnimationFrame(tick);
  }, [clamp]);

  const animate = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(tick);
  }, [tick]);

  const moveTo = useCallback(
    (next: Viewport, immediate = false) => {
      target.current = clamp(next);
      if (immediate) {
        current.current = target.current;
        setView(target.current);
      }
      animate();
    },
    [clamp, animate]
  );

  const reset = useCallback(() => {
    velocity.current = 0;
    moveTo(full());
  }, [moveTo, full]);

  // Новые данные (другой период или станок) — сразу весь диапазон
  useEffect(() => {
    velocity.current = 0;
    moveTo(full(), true);
  }, [total, moveTo, full]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || total < 2) return;

    const plotWidth = () => Math.max(1, el.clientWidth - insets.left - insets.right);
    const anchorAt = (clientX: number) => {
      const rect = el.getBoundingClientRect();
      return Math.min(1, Math.max(0, (clientX - rect.left - insets.left) / plotWidth()));
    };
    const zoomAround = (factor: number, anchor: number) => {
      const [s, e] = target.current;
      const span = e - s;
      const point = s + anchor * span;
      const nextSpan = span * factor;
      moveTo([point - anchor * nextSpan, point - anchor * nextSpan + nextSpan]);
    };
    const panByPixels = (dx: number, immediate: boolean) => {
      const [s, e] = target.current;
      const shift = (dx / plotWidth()) * (e - s);
      moveTo([s + shift, e + shift], immediate);
      return shift;
    };

    const onWheel = (e: WheelEvent) => {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
      const dy = e.deltaY * unit;
      e.preventDefault();
      velocity.current = 0;
      if (e.ctrlKey) {
        // Щипок: приближаем/отдаляем
        zoomAround(Math.exp(dy * PINCH_ZOOM_SPEED), anchorAt(e.clientX));
      } else if (Math.abs(dx) > Math.abs(dy)) {
        panByPixels(dx, true);
      } else {
        // Свайп двумя пальцами вверх/вниз или колесо мыши
        zoomAround(Math.exp(-dy * SCROLL_ZOOM_SPEED), anchorAt(e.clientX));
      }
    };

    let gestureScale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureScale = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const ge = e as Event & { scale: number; clientX: number };
      zoomAround(gestureScale / ge.scale, anchorAt(ge.clientX));
      gestureScale = ge.scale;
    };

    const pointers = new Map<number, { x: number; t: number }>();
    let pinchDistance = 0;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, t: e.timeStamp });
      velocity.current = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (a && b) {
          pinchDistance = Math.abs(a.x - b.x);
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      if (!el.hasPointerCapture(e.pointerId) && (pointers.size === 2 || Math.abs(prev.x - e.clientX) > 3)) {
        el.setPointerCapture(e.pointerId);
      }
      if (pointers.size === 2) {
        pointers.set(e.pointerId, { x: e.clientX, t: e.timeStamp });
        const [a, b] = [...pointers.values()];
        if (a && b) {
          const distance = Math.abs(a.x - b.x);
          if (pinchDistance > 10 && distance > 10) {
            zoomAround(pinchDistance / distance, anchorAt((a.x + b.x) / 2));
          }
          pinchDistance = distance;
        }
        return;
      }
      const dx = prev.x - e.clientX;
      const shift = panByPixels(dx, true);
      const dt = Math.max(1, e.timeStamp - prev.t);
      velocity.current = (shift / dt) * 16;
      pointers.set(e.pointerId, { x: e.clientX, t: e.timeStamp });
      if (Math.abs(dx) > 2) el.style.cursor = 'grabbing';
    };

    const onPointerUp = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      el.style.cursor = '';
      if (pointers.size > 0 || !prev || e.timeStamp - prev.t > 80) velocity.current = 0;
      if (velocity.current) animate();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('dblclick', reset);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('dblclick', reset);
    };
  }, [ref, total, insets.left, insets.right, moveTo, animate, reset]);

  const isZoomed = isViewportZoomed(view, total);
  return { view, isZoomed, reset, moveTo };
}
