import { describe, expect, it } from 'vitest';
import { clampView, followDomain, isZoomed, panView, wheelToAction, zoomView, type Domain } from './useChartViewport';

const MIN = 60_000;
const H = 60 * MIN;
/** 6 часов истории, минимум 15 минут в окне. */
const D: Domain = { min: 0, max: 6 * H, minSpan: 15 * MIN };

describe('окно графика по времени', () => {
  it('не выходит за период и не отдаляется дальше всего периода', () => {
    expect(clampView([-H, 2 * H], D)).toEqual([0, 3 * H]);
    expect(clampView([5 * H, 8 * H], D)).toEqual([3 * H, 6 * H]);
    expect(clampView([-H, 9 * H], D)).toEqual([0, 6 * H]);
  });

  it('не сжимается уже минимального окна', () => {
    expect(clampView([H, H + MIN], D)).toEqual([H, H + 15 * MIN]);
  });

  it('приближение держит неподвижной точку под курсором', () => {
    const v = zoomView([0, 6 * H], 0.5, 0.25, D); // курсор на 1,5 ч
    expect(v).toEqual([0.75 * H, 3.75 * H]);
    const anchorT = v[0] + 0.25 * (v[1] - v[0]);
    expect(anchorT).toBe(1.5 * H);
  });

  it('сдвиг упирается в края периода', () => {
    expect(panView([H, 3 * H], 30 * MIN, D)).toEqual([1.5 * H, 3.5 * H]);
    expect(panView([H, 3 * H], -5 * H, D)).toEqual([0, 2 * H]);
  });

  it('весь период — не приближено, часть — приближено', () => {
    expect(isZoomed([0, 6 * H], D)).toBe(false);
    expect(isZoomed([H, 6 * H], D)).toBe(true);
  });
});

describe('новые показания (период сдвигается вправо)', () => {
  const next: Domain = { ...D, min: 3 * MIN, max: 6 * H + 3 * MIN };

  it('весь период остаётся всем периодом', () => {
    expect(followDomain([0, 6 * H], D, next)).toEqual([next.min, next.max]);
  });

  it('окно у правого края едет за «сейчас», ширина та же', () => {
    expect(followDomain([5 * H, 6 * H], D, next)).toEqual([5 * H + 3 * MIN, 6 * H + 3 * MIN]);
  });

  it('окно в прошлом стоит на месте — приближение не сбрасывается', () => {
    expect(followDomain([H, 2 * H], D, next)).toEqual([H, 2 * H]);
  });
});

describe('колесо и тачпад → действие', () => {
  const base = { deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, shiftKey: false };

  it('два пальца вверх-вниз и колесо мыши — растянуть/сжать ось (вверх = приблизить)', () => {
    const up = wheelToAction({ ...base, deltaY: -40 }, 300);
    expect(up.kind).toBe('zoom');
    expect(up.kind === 'zoom' && up.factor).toBeLessThan(1);
    const down = wheelToAction({ ...base, deltaY: 40 }, 300);
    expect(down.kind === 'zoom' && down.factor).toBeGreaterThan(1);
  });

  it('щипок (ctrlKey): развести пальцы — приблизить', () => {
    const a = wheelToAction({ ...base, deltaY: -10, ctrlKey: true }, 300);
    expect(a.kind === 'zoom' && a.factor).toBeLessThan(1);
  });

  it('два пальца влево-вправо и Shift+колесо — сдвиг по времени', () => {
    expect(wheelToAction({ ...base, deltaX: 30, deltaY: 4 }, 300)).toEqual({ kind: 'pan', px: 30 });
    expect(wheelToAction({ ...base, deltaY: 30, shiftKey: true }, 300)).toEqual({ kind: 'pan', px: 30 });
  });

  it('начатый жест держит свою ось: дрожание пальцев не переключает зум ↔ сдвиг', () => {
    expect(wheelToAction({ ...base, deltaX: 3, deltaY: 2 }, 300, 'zoom').kind).toBe('zoom');
    expect(wheelToAction({ ...base, deltaX: 2, deltaY: 6 }, 300, 'pan')).toEqual({ kind: 'pan', px: 2 });
  });

  it('колесо мыши в строках (deltaMode 1) пересчитывается в пиксели', () => {
    const lines = wheelToAction({ ...base, deltaY: 3, deltaMode: 1 }, 300);
    const px = wheelToAction({ ...base, deltaY: 48 }, 300);
    expect(lines).toEqual(px);
  });
});
