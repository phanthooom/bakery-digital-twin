import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Видимое окно графика по времени: [от, до], мс. */
export type Viewport = [number, number];

/** Весь период графика и самое узкое окно, до которого можно приблизить. */
export interface Domain {
  min: number;
  max: number;
  minSpan: number;
}

export interface Insets {
  left: number;
  right: number;
}

/* ── Чистые функции окна (тестируются, см. useChartViewport.test.ts) ── */

export function clampView([s, e]: Viewport, d: Domain): Viewport {
  const full = Math.max(0, d.max - d.min);
  const span = Math.min(full, Math.max(Math.min(d.minSpan, full), e - s));
  const start = Math.min(Math.max(d.min, s), d.max - span);
  return [start, start + span];
}

/** Масштаб в factor раз (меньше 1 — приблизить) вокруг точки anchor (0…1 по ширине графика). */
export function zoomView([s, e]: Viewport, factor: number, anchor: number, d: Domain): Viewport {
  const span = e - s;
  const at = s + anchor * span;
  const next = span * factor;
  return clampView([at - anchor * next, at - anchor * next + next], d);
}

export function panView([s, e]: Viewport, deltaMs: number, d: Domain): Viewport {
  return clampView([s + deltaMs, e + deltaMs], d);
}

export function isZoomed([s, e]: Viewport, d: Domain): boolean {
  const full = d.max - d.min;
  return full > 0 && e - s < full * 0.995;
}

/**
 * Период сдвинулся (пришли новые показания). Весь период остаётся всем периодом;
 * окно у правого края едет за «сейчас»; окно в прошлом стоит на месте.
 */
export function followDomain(view: Viewport, prev: Domain, next: Domain): Viewport {
  if (!isZoomed(view, prev)) return [next.min, next.max];
  const span = view[1] - view[0];
  if (view[1] >= prev.max - span * 0.01) return clampView([next.max - span, next.max], next);
  return clampView(view, next);
}

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export type WheelAction = { kind: 'zoom'; factor: number } | { kind: 'pan'; px: number };

const PINCH_ZOOM_SPEED = 0.01;
const SCROLL_ZOOM_SPEED = 0.0025;

/**
 * Колесо/тачпад → действие, как в графике ai-solar-panels (amCharts wheelX: panX, wheelY: zoomX):
 * два пальца вверх-вниз и колесо мыши — растянуть/сжать ось времени (вверх — приблизить);
 * щипок (ctrlKey) — то же; два пальца влево-вправо и Shift+колесо — сдвиг.
 * lock — ось уже идущего жеста: мелкое дрожание пальцев не переключает зум ↔ сдвиг.
 */
export function wheelToAction(e: WheelLike, pageHeight: number, lock?: WheelAction['kind']): WheelAction {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? pageHeight : 1;
  const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
  const dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit;
  if (e.ctrlKey) return { kind: 'zoom', factor: Math.exp(dy * PINCH_ZOOM_SPEED) };
  const kind = lock ?? (Math.abs(dx) > Math.abs(dy) ? 'pan' : 'zoom');
  return kind === 'pan' ? { kind, px: dx } : { kind, factor: Math.exp(dy * SCROLL_ZOOM_SPEED) };
}

/* ── Хук ── */

const EASE = 0.25; // доля пути к цели за кадр — плавный зум без рывков
const FRICTION = 0.92; // затухание инерции после броска мышью/пальцем
const AXIS_LOCK_MS = 220;

/**
 * Окно графика с жестами: колесо/тачпад (wheelToAction), Safari gesture*, перетаскивание мышью
 * или пальцем с инерцией, щипок двумя пальцами на сенсорном экране, двойной клик — плавный сброс.
 * Когда график показывает весь период, прокрутка вниз отдаётся странице (карточка листается).
 */
export function useChartViewport(ref: RefObject<HTMLElement | null>, domain: Domain, insets: Insets) {
  const d = useRef(domain);
  const [view, setView] = useState<Viewport>([domain.min, domain.max]);
  const current = useRef<Viewport>([domain.min, domain.max]);
  const target = useRef<Viewport>([domain.min, domain.max]);
  const velocity = useRef(0); // мс за кадр
  const frame = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  // новые показания или другой период: окно следует за периодом без анимации
  useLayoutEffect(() => {
    const prev = d.current;
    const next = { min: domain.min, max: domain.max, minSpan: domain.minSpan };
    d.current = next;
    if (prev.min === next.min && prev.max === next.max && prev.minSpan === next.minSpan) return;
    const prevSpan = prev.max - prev.min;
    const nextSpan = next.max - next.min;
    // другой период (1 ч → 24 ч) — сразу весь период
    const periodChanged = Math.abs(prevSpan - nextSpan) > Math.max(prevSpan, nextSpan) * 0.05;
    current.current = periodChanged ? [next.min, next.max] : followDomain(current.current, prev, next);
    target.current = periodChanged ? [next.min, next.max] : followDomain(target.current, prev, next);
    if (periodChanged) velocity.current = 0;
    setView(current.current);
  }, [domain.min, domain.max, domain.minSpan]);

  const tick = useCallback(() => {
    frame.current = null;
    if (velocity.current) {
      const moved = panView(target.current, velocity.current, d.current);
      if (moved[0] === target.current[0]) velocity.current = 0; // упёрлись в край
      target.current = moved;
      velocity.current *= FRICTION;
      const span = target.current[1] - target.current[0];
      if (Math.abs(velocity.current) < span * 0.0002) velocity.current = 0;
    }
    const [cs, ce] = current.current;
    const [ts, te] = target.current;
    const next: Viewport = [cs + (ts - cs) * EASE, ce + (te - ce) * EASE];
    const eps = (te - ts) * 0.0005;
    const settled = Math.abs(ts - next[0]) < eps && Math.abs(te - next[1]) < eps;
    current.current = settled ? target.current : next;
    setView(current.current);
    if (!settled || velocity.current) frame.current = requestAnimationFrame(tick);
  }, []);

  const animate = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(tick);
  }, [tick]);

  const moveTo = useCallback(
    (next: Viewport, immediate = false) => {
      target.current = clampView(next, d.current);
      if (immediate) {
        current.current = target.current;
        setView(target.current);
      }
      animate();
    },
    [animate]
  );

  const reset = useCallback(() => {
    velocity.current = 0;
    moveTo([d.current.min, d.current.max]);
  }, [moveTo]);

  /** Масштаб вокруг точки anchor (0…1 по ширине графика) — для клавиш и кнопок. */
  const zoomBy = useCallback((factor: number, anchor = 0.5) => {
    velocity.current = 0;
    moveTo(zoomView(target.current, factor, anchor, d.current));
  }, [moveTo]);

  /** Показать момент t, если он за краем окна (клавиши ←/→). */
  const reveal = useCallback((t: number) => {
    const [s, e] = target.current;
    const span = e - s;
    if (t < s) moveTo([t - span * 0.1, t - span * 0.1 + span]);
    else if (t > e) moveTo([t + span * 0.1 - span, t + span * 0.1]);
  }, [moveTo]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const plotWidth = () => Math.max(1, el.clientWidth - insets.left - insets.right);
    const anchorAt = (clientX: number) => {
      const rect = el.getBoundingClientRect();
      return Math.min(1, Math.max(0, (clientX - rect.left - insets.left) / plotWidth()));
    };
    const msPerPx = () => (target.current[1] - target.current[0]) / plotWidth();

    let lock: WheelAction['kind'] | undefined;
    let lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.timeStamp - lastWheel > AXIS_LOCK_MS) lock = undefined;
      const action = wheelToAction(e, window.innerHeight, e.ctrlKey ? undefined : lock);
      // весь период и жест «отдалить» — пусть листается карточка/страница
      if (action.kind === 'zoom' && action.factor > 1 && !e.ctrlKey && !lock && !isZoomed(target.current, d.current)) return;
      e.preventDefault();
      lastWheel = e.timeStamp;
      if (!e.ctrlKey) lock = action.kind;
      velocity.current = 0;
      if (action.kind === 'zoom') moveTo(zoomView(target.current, action.factor, anchorAt(e.clientX), d.current));
      else moveTo(panView(target.current, action.px * msPerPx(), d.current), true);
    };

    let gestureScale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureScale = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const ge = e as Event & { scale: number; clientX: number };
      moveTo(zoomView(target.current, gestureScale / ge.scale, anchorAt(ge.clientX), d.current));
      gestureScale = ge.scale;
    };

    const pointers = new Map<number, { x: number; t: number }>();
    let pinchDistance = 0;
    let moved = false;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, t: e.timeStamp });
      velocity.current = 0;
      moved = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDistance = a && b ? Math.abs(a.x - b.x) : 0;
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      if (!moved && (pointers.size === 2 || Math.abs(prev.x - e.clientX) > 3)) {
        moved = true;
        el.setPointerCapture(e.pointerId);
        setDragging(true);
      }
      if (!moved) return;
      pointers.set(e.pointerId, { x: e.clientX, t: e.timeStamp });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (a && b) {
          const distance = Math.abs(a.x - b.x);
          if (pinchDistance > 10 && distance > 10) {
            moveTo(zoomView(target.current, pinchDistance / distance, anchorAt((a.x + b.x) / 2), d.current), true);
          }
          pinchDistance = distance;
        }
        return;
      }
      const shift = (prev.x - e.clientX) * msPerPx();
      moveTo(panView(target.current, shift, d.current), true);
      velocity.current = (shift / Math.max(1, e.timeStamp - prev.t)) * 16;
    };
    const onPointerUp = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size > 0 || !prev || e.timeStamp - prev.t > 80) velocity.current = 0;
      if (!pointers.size) setDragging(false);
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
  }, [ref, insets.left, insets.right, moveTo, animate, reset]);

  return { view, isZoomed: isZoomed(view, domain), dragging, reset, zoomBy, reveal };
}
