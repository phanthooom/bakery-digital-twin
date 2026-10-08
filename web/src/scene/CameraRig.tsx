import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import * as THREE from 'three';
import type { SiteConfig } from '@bakery/shared';
import { SPECS } from './machines';

const OVERVIEW_DIR = new THREE.Vector3(-0.14, 0.7, 0.7).normalize();
const OVERVIEW_TARGET = new THREE.Vector3(0, 0.6, -1.2);

/**
 * Камера: общий вид, облёт к выбранному станку, сдвиг кадра влево,
 * когда справа открыта карточка (чтобы станок не прятался под ней).
 */
export function CameraRig({ config, selectedId, viewToken, cardOffset }: { config: SiteConfig; selectedId: string | null; viewToken: number; cardOffset: [number, number] }) {
  const ref = useRef<CameraControls>(null);
  const { size, camera } = useThree();
  const firstRun = useRef(true);

  const overview = (smooth: boolean) => {
    const c = ref.current;
    if (!c) return;
    const { width: W } = config.site.hall;
    const cam = camera as THREE.PerspectiveCamera;
    const vfov = THREE.MathUtils.degToRad(cam.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (size.width / Math.max(1, size.height)));
    const dist = Math.max((W / 2 + 2.2) / Math.tan(hfov / 2), 11 / Math.tan(vfov / 2));
    const pos = OVERVIEW_DIR.clone().multiplyScalar(dist).add(OVERVIEW_TARGET);
    void c.setLookAt(pos.x, pos.y, pos.z, OVERVIEW_TARGET.x, OVERVIEW_TARGET.y, OVERVIEW_TARGET.z, smooth);
  };

  useEffect(() => {
    overview(!firstRun.current);
    firstRun.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewToken]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !selectedId) return;
    const eq = config.equipment.find((e) => e.id === selectedId);
    if (!eq) return;
    const h = (SPECS[eq.kind] ?? SPECS.generic).height;
    const { x, z } = eq.position;
    const narrow = size.width < size.height;
    const d = (4.6 + h * 1.6) * (narrow ? 1.5 : 1);
    // смотрим спереди и чуть со стороны центра цеха, чтобы у стен камера не упиралась в стену
    const side = x > 0 ? -1 : 1;
    const dir = new THREE.Vector3(side * 0.42, 0.55, 1).normalize().multiplyScalar(d);
    void c.setLookAt(x + dir.x, h * 0.45 + dir.y, z + dir.z, x, h * 0.45, z, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, config]);

  useEffect(() => {
    void ref.current?.setFocalOffset(cardOffset[0], cardOffset[1], 0, true);
  }, [cardOffset[0], cardOffset[1]]);

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
