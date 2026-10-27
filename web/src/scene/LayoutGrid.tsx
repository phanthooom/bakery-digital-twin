import { memo, useEffect, useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SiteConfig } from '@bakery/shared';
import { SPECS } from './machines';
import { buildRoutes } from './powerRoutes';
import { calcCableDrop, snapAndClamp } from './layoutMath';

export interface LayoutGridProps {
  config: SiteConfig;
  selectedId: string | null;
  draggingId: string | null;
  onMoveEquipment: (id: string, x: number, z: number) => void;
  onEndDrag: () => void;
  isNight?: boolean;
}

/**
 * Строит геометрию 3D-сетки планировки (основной шаг 2,0 м и подсетка 0,5 м)
 * одним буфером LineSegments (всего 2 draw-вызова на весь цех).
 */
function useHallGridGeo(width: number, depth: number, stepMinor = 0.5, stepMajor = 2.0) {
  return useMemo(() => {
    const hw = width / 2;
    const hd = depth / 2;
    const minorPts: number[] = [];
    const majorPts: number[] = [];

    const isMajor = (val: number) => Math.abs(Math.round(val / stepMajor) * stepMajor - val) < 1e-3;

    for (let x = -hw; x <= hw + 1e-4; x += stepMinor) {
      const target = isMajor(x) ? majorPts : minorPts;
      target.push(x, 0, -hd, x, 0, hd);
    }
    for (let z = -hd; z <= hd + 1e-4; z += stepMinor) {
      const target = isMajor(z) ? majorPts : minorPts;
      target.push(-hw, 0, z, hw, 0, z);
    }

    const minorGeo = new THREE.BufferGeometry();
    minorGeo.setAttribute('position', new THREE.Float32BufferAttribute(minorPts, 3));

    const majorGeo = new THREE.BufferGeometry();
    majorGeo.setAttribute('position', new THREE.Float32BufferAttribute(majorPts, 3));

    return { minorGeo, majorGeo };
  }, [width, depth, stepMinor, stepMajor]);
}

/**
 * 3D-режим «📐 Планировка» (Интерактивный конструктор цеха):
 * - Метровая/полуметровая сетка на полу цеха (шаг 0,5 м и 2,0 м);
 * - Перетаскивание любого станка мышью/тачем по плоскости этажа с привязкой к сетке 0,5 м (Shift — 0,1 м);
 * - Автоматическая блокировка вращения камеры во время перетаскивания станка;
 * - Живая выноска координат, угла поворота, длины кабеля от ЩР-1 и падения напряжения ΔU.
 */
export const LayoutGrid = memo(function LayoutGrid({
  config,
  selectedId,
  draggingId,
  onMoveEquipment,
  onEndDrag,
  isNight = false,
}: LayoutGridProps) {
  const { camera, gl, controls } = useThree();
  const { width: W, depth: D } = config.site.hall;
  const { minorGeo, majorGeo } = useHallGridGeo(W, D, 0.5, 2.0);

  const activeId = draggingId ?? selectedId;
  const activeEq = useMemo(
    () => (activeId ? config.equipment.find((e) => e.id === activeId) ?? null : null),
    [config.equipment, activeId],
  );
  const activeIndex = useMemo(
    () => (activeId ? Math.max(1, config.equipment.findIndex((e) => e.id === activeId) + 1) : 1),
    [config.equipment, activeId],
  );

  // Живой расчёт длины кабельной трассы и потери напряжения для выбранного/перетаскиваемого станка
  const cableMetrics = useMemo(() => {
    if (!activeEq) return null;
    const routes = buildRoutes(config);
    const route = routes.find((r) => r.equipmentId === activeEq.id);
    return calcCableDrop(activeEq, route?.length ?? 0, activeIndex);
  }, [config, activeEq, activeIndex]);

  // Перетаскивание станка по горизонтальной плоскости его этажа через Raycaster
  useEffect(() => {
    if (!draggingId) return;
    const eq = config.equipment.find((e) => e.id === draggingId);
    if (!eq) return;

    const ctrl = (controls ?? (window as unknown as { __cameraControls?: { enabled?: boolean } }).__cameraControls) as
      | { enabled?: boolean }
      | undefined;
    if (ctrl) ctrl.enabled = false;
    document.body.style.cursor = 'grabbing';

    const planeY = eq.position.y ?? 0;
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    const onPointerMove = (e: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(floorPlane, hit)) {
        const step = e.shiftKey ? 0.1 : 0.5;
        const snapped = snapAndClamp(hit.x, hit.z, config.site.hall, step);
        onMoveEquipment(draggingId, snapped.x, snapped.z);
      }
    };

    const finish = () => {
      if (ctrl) ctrl.enabled = true;
      document.body.style.cursor = '';
      onEndDrag();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      if (ctrl) ctrl.enabled = true;
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [draggingId, camera, gl, controls, config.site.hall, config.equipment, onMoveEquipment, onEndDrag]);

  const spec = activeEq ? SPECS[activeEq.kind] ?? SPECS.generic : null;
  const r = spec ? spec.ringRadius + 0.25 : 1.2;
  const deg = activeEq ? Math.round((((activeEq.rotationY ?? 0) * 180) / Math.PI) % 360) : 0;

  return (
    <group>
      {/* Инженерная сетка 0,5 м / 2,0 м на полу 1-го этажа */}
      <group position={[0, 0.016, 0]}>
        <lineSegments geometry={minorGeo}>
          <lineBasicMaterial color={isNight ? '#1e3a5f' : '#c5ced8'} transparent opacity={isNight ? 0.42 : 0.55} depthWrite={false} />
        </lineSegments>
        <lineSegments geometry={majorGeo}>
          <lineBasicMaterial color={isNight ? '#38bdf8' : '#3b82f6'} transparent opacity={isNight ? 0.65 : 0.55} depthWrite={false} />
        </lineSegments>
      </group>

      {/* Подсветка габаритного контура, стрелки фасада и живой телеметрии кабеля вокруг выбранного станка */}
      {activeEq && spec && (
        <group
          position={[activeEq.position.x, (activeEq.position.y ?? 0) + 0.025, activeEq.position.z]}
          rotation={[0, activeEq.rotationY ?? 0, 0]}
        >
          {/* Опорное кольцо захвата */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[r - 0.06, r, 48]} />
            <meshBasicMaterial color="#2563eb" transparent opacity={0.85} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[r - 0.06, 48]} />
            <meshBasicMaterial color="#3b82f6" transparent opacity={0.14} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          {/* Стрелка направления лицевой стороны станка (+Z в локальных координатах) */}
          <mesh position={[0, 0.01, r + 0.22]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.18, 0.36, 3]} />
            <meshBasicMaterial color="#f59e0b" toneMapped={false} />
          </mesh>

          {/* Плавающая плашка параметров расстановки и кабельной трассы */}
          <Html position={[0, spec.height + 0.85, 0]} center zIndexRange={[26, 0]} style={{ pointerEvents: 'none' }}>
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.92)',
                color: '#f8fafc',
                border: '1px solid #38bdf8',
                borderRadius: 8,
                padding: '5px 10px',
                fontSize: 11.5,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <div style={{ color: '#38bdf8', fontWeight: 700 }}>
                📐 {activeEq.name} ({deg}°)
              </div>
              <div>
                X: {activeEq.position.x.toFixed(1).replace('.', ',')} м · Z: {activeEq.position.z.toFixed(1).replace('.', ',')} м
              </div>
              {cableMetrics && (
                <div style={{ color: cableMetrics.dropPct > 4 ? '#f87171' : '#a7f3d0' }}>
                  ⚡ Кабель {cableMetrics.cableLabel}: {cableMetrics.lengthM.toFixed(1).replace('.', ',')} м · ΔU {cableMetrics.dropV.toFixed(2).replace('.', ',')} В ({cableMetrics.dropPct.toFixed(2).replace('.', ',')} %)
                </div>
              )}
            </div>
          </Html>
        </group>
      )}
    </group>
  );
});
