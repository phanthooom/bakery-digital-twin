import { describe, expect, it } from 'vitest';
import { createWheelInterpreter, zoomAboutPoint, type WheelInput } from './gestures';

const wheel = (over: Partial<WheelInput>): WheelInput => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  altKey: false,
  timeStamp: 1000,
  ...over,
});

describe('жесты тачпада и колесо мыши', () => {
  it('щипок «пальцы врозь» (wheel + ctrlKey, deltaY < 0) приближает', () => {
    const interpret = createWheelInterpreter();
    const intent = interpret(wheel({ ctrlKey: true, deltaY: -10 }));
    expect(intent.kind).toBe('zoom');
    if (intent.kind === 'zoom') expect(intent.factor).toBeLessThan(1);
  });

  it('два пальца влево-вправо по тачпаду сдвигают камеру по горизонтали, а не зумят', () => {
    const interpret = createWheelInterpreter();
    expect(interpret(wheel({ deltaX: 12, deltaY: 0.4 }))).toEqual({ kind: 'pan', dx: 12, dy: 0.4 });
  });

  it('щелчок колеса обычной мыши (целое deltaY ≥ 50, без deltaX) — зум, как раньше', () => {
    const interpret = createWheelInterpreter();
    const out = interpret(wheel({ deltaY: 100 }));
    expect(out.kind).toBe('zoom');
    if (out.kind === 'zoom') expect(out.factor).toBeGreaterThan(1);
    const firefox = interpret(wheel({ deltaY: 3, deltaMode: 1, timeStamp: 5000 }));
    expect(firefox.kind).toBe('zoom');
  });

  it('быстрый свайп двумя пальцами не превращается в зум посреди жеста (крупные целые дельты инерции)', () => {
    const interpret = createWheelInterpreter();
    interpret(wheel({ deltaX: 0.5, deltaY: 8, timeStamp: 1000 }));
    expect(interpret(wheel({ deltaY: 120, timeStamp: 1100 })).kind).toBe('pan');
    // после паузы то же событие снова считается колесом мыши
    expect(interpret(wheel({ deltaY: 120, timeStamp: 3000 })).kind).toBe('zoom');
  });

  it('Option/Alt + два пальца — поворот камеры вокруг цеха', () => {
    const interpret = createWheelInterpreter();
    expect(interpret(wheel({ deltaX: 6, deltaY: -2, altKey: true }))).toEqual({ kind: 'orbit', dx: 6, dy: -2 });
  });
});

describe('zoomAboutPoint — масштаб к точке под курсором', () => {
  const pos = { x: 0, y: 10, z: 10 };
  const target = { x: 0, y: 0, z: 0 };
  const point = { x: 4, y: 0, z: 0 };

  it('при приближении камера и центр вращения сдвигаются к точке под курсором', () => {
    const r = zoomAboutPoint(pos, target, point, 0.5, { min: 1, max: 100 });
    expect(r.target).toEqual({ x: 2, y: 0, z: 0 });
    expect(r.position).toEqual({ x: 2, y: 5, z: 5 });
  });

  it('не подлетает ближе минимальной дистанции и не улетает дальше максимальной', () => {
    const near = zoomAboutPoint(pos, target, point, 0.01, { min: 2, max: 100 });
    expect(Math.hypot(near.position.x - near.target.x, near.position.y - near.target.y, near.position.z - near.target.z)).toBeCloseTo(2, 5);
    const far = zoomAboutPoint(pos, target, point, 100, { min: 2, max: 28.28427 });
    expect(Math.hypot(far.position.x - far.target.x, far.position.y - far.target.y, far.position.z - far.target.z)).toBeCloseTo(28.28427, 3);
  });
});
