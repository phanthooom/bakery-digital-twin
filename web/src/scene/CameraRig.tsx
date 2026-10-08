import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import * as THREE from 'three';
import type { SiteConfig } from '@bakery/shared';
import { createWheelInterpreter, zoomAboutPoint } from './gestures';

const OVERVIEW_DIR = new THREE.Vector3(-0.14, 0.7, 0.7).normalize();
const OVERVIEW_TARGET = new THREE.Vector3(0, 0.6, -1.2);

/**
 * Камера: общий вид, облёт к выбранному станку, сдвиг кадра влево,
 * когда справа открыта карточка (чтобы станок не прятался под ней).
 */
/** Куда подлететь: точка на полу (x, z), высота, на которую смотрим, и дистанция. */
export interface CameraFocus {
  key: string;
  x: number;
  z: number;
  lookY: number;
  dist: number;
}

export function CameraRig({ config, focus, viewToken, cardOffset }: { config: SiteConfig; focus: CameraFocus | null; viewToken: number; cardOffset: [number, number] }) {
  const ref = useRef<CameraControls>(null);
  const { size, camera, gl } = useThree();
  const firstRun = useRef(true);
  /** Вид до подлёта к станку — туда камера вернётся, когда карточку закроют. */
  const savedPose = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const prevSelected = useRef<string | null>(null);

  const overview = (smooth: boolean) => {
    const c = ref.current;
    if (!c) return;
    const { width: W } = config.site.hall;
    const cam = camera as THREE.PerspectiveCamera;
    const vfov = THREE.MathUtils.degToRad(cam.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (size.width / Math.max(1, size.height)));
    const dist = Math.max((W / 2 + 3.5) / Math.tan(hfov / 2), 11 / Math.tan(vfov / 2));
    const pos = OVERVIEW_DIR.clone().multiplyScalar(dist).add(OVERVIEW_TARGET);
    void c.setLookAt(pos.x, pos.y, pos.z, OVERVIEW_TARGET.x, OVERVIEW_TARGET.y, OVERVIEW_TARGET.z, smooth);
  };

  useEffect(() => {
    savedPose.current = null; // «Весь цех» важнее возврата к прошлому виду
    overview(!firstRun.current);
    firstRun.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewToken]);

  useEffect(() => {
    const c = ref.current;
    const prev = prevSelected.current;
    prevSelected.current = focus?.key ?? null;
    if (!c) return;
    if (!focus) {
      // карточку закрыли (повторный клик, ×, Esc, клик мимо) — плавно назад, как подлетали
      const pose = savedPose.current;
      savedPose.current = null;
      if (prev && pose) void c.setLookAt(pose.position.x, pose.position.y, pose.position.z, pose.target.x, pose.target.y, pose.target.z, true);
      return;
    }
    if (!prev) savedPose.current = { position: c.getPosition(new THREE.Vector3()), target: c.getTarget(new THREE.Vector3()) };
    const { x, z, lookY } = focus;
    const narrow = size.width < size.height;
    const d = focus.dist * (narrow ? 1.5 : 1);
    // смотрим спереди и чуть со стороны центра цеха, чтобы у стен камера не упиралась в стену
    const side = x > 0 ? -1 : 1;
    const dir = new THREE.Vector3(side * 0.42, 0.55, 1).normalize().multiplyScalar(d);
    void c.setLookAt(x + dir.x, lookY + dir.y, z + dir.z, x, lookY, z, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  useEffect(() => {
    void ref.current?.setFocalOffset(cardOffset[0], cardOffset[1], 0, true);
  }, [cardOffset[0], cardOffset[1]]);

  // Тачпад: щипок — масштаб к курсору, два пальца — сдвиг по полу цеха, Option/Alt + два пальца — поворот.
  // Колесо мыши — масштаб к курсору. Перетаскивание мышью/пальцем остаётся за camera-controls.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const el = gl.domElement;
    const { width: W, depth: D } = config.site.hall;
    c.mouseButtons.wheel = CameraControlsImpl.ACTION.NONE;
    c.setBoundary(new THREE.Box3(new THREE.Vector3(-W / 2 - 3, 0, -D / 2 - 3), new THREE.Vector3(W / 2 + 3, 4, D / 2 + 6)));

    const interpret = createWheelInterpreter();
    const raycaster = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const tgt = new THREE.Vector3();

    const zoomAt = (factor: number, clientX: number, clientY: number) => {
      c.getPosition(pos);
      c.getTarget(tgt);
      const rect = el.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const point = raycaster.ray.intersectPlane(floor, hit) ?? tgt;
      const r = zoomAboutPoint(pos, tgt, point, factor, { min: c.minDistance, max: c.maxDistance });
      void c.setLookAt(r.position.x, r.position.y, r.position.z, r.target.x, r.target.y, r.target.z, false);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // иначе браузер масштабирует всю страницу на щипок
      const intent = interpret(e);
      if (intent.kind === 'zoom') zoomAt(intent.factor, e.clientX, e.clientY);
      else if (intent.kind === 'pan') {
        const vfov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov);
        const perPx = (2 * c.distance * Math.tan(vfov / 2)) / Math.max(1, el.clientHeight);
        // вертикальный свайп двигает по полу; при наклонной камере пиксель экрана «длиннее» на полу
        const groundStretch = 1 / Math.max(0.35, Math.cos(c.polarAngle));
        void c.truck(intent.dx * perPx, 0, false);
        void c.forward(-intent.dy * perPx * groundStretch, false);
      } else if (intent.kind === 'orbit') {
        void c.rotate(-intent.dx * 0.006, -intent.dy * 0.006, false);
      }
    };

    // Safari на macOS шлёт щипок как gesture*-события со scale
    let lastScale = 1;
    type GestureLike = Event & { scale: number; clientX: number; clientY: number };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      lastScale = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as GestureLike;
      if (g.scale > 0) zoomAt(lastScale / g.scale, g.clientX, g.clientY);
      lastScale = g.scale;
    };
    const prevent = (e: Event) => e.preventDefault();

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    el.addEventListener('gestureend', prevent);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('gestureend', prevent);
    };
  }, [gl, camera, config]);

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __cameraControls?: unknown }).__cameraControls = ref.current;
  }, []);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={2}
      maxDistance={60}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI * 0.46}
      smoothTime={0.45}
      draggingSmoothTime={0.12}
    />
  );
}
