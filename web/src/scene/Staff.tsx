import { memo, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { SiteConfig } from '@bakery/shared';
import { SPECS } from './machines';

/**
 * Персонал (config.staff): пекари в белых куртках и колпаках.
 * Один станок или место (spot) — стоит перед ним лицом к нему и понемногу смещается вдоль фронта, будто работает;
 * несколько — ходит между ними и у каждого стоит PAUSE секунд.
 * Модель (baker.glb, «Finley» by Innerscene, CC0) статична. Все пекари — один инстанс-меш, колпаки — второй:
 * два вызова отрисовки (плюс тени) на любое число людей.
 */
const URL = '/models/baker.glb';
useGLTF.preload(URL);

const SPEED = 0.8; // м/с
const PAUSE = 10; // с у станка
const STAND = 0.75; // м от фронта станка
const STEP = 0.7;

interface Station {
  x: number;
  z: number;
  /** Куда смотреть, стоя у станка (поворот вокруг y; модель смотрит к +z). */
  face: number;
  /** Вдоль фронта станка — для покачивания у рабочего места. */
  along: [number, number];
}

function stationsFor(config: SiteConfig): Station[][] {
  const byId = new Map(config.equipment.map((e) => [e.id, e]));
  return (config.staff ?? []).map((s) => {
    if (s.spot) {
      const h = (s.spot.faceDeg * Math.PI) / 180;
      return [{ x: s.spot.x, z: s.spot.z, face: h, along: [Math.cos(h), -Math.sin(h)] as [number, number] }];
    }
    return (s.at ?? []).map((id) => {
      const eq = byId.get(id)!;
      const r = eq.rotationY ?? 0;
      const d = (SPECS[eq.kind] ?? SPECS.generic).depth / 2 + STAND;
      const side = s.side ?? 0;
      // фронт станка — локальная +z, вдоль фронта — локальная +x
      return {
        x: eq.position.x + Math.sin(r) * d + Math.cos(r) * side,
        z: eq.position.z + Math.cos(r) * d - Math.sin(r) * side,
        face: r + Math.PI,
        along: [Math.cos(r), -Math.sin(r)] as [number, number],
      };
    });
  });
}

const capMat = new THREE.MeshStandardMaterial({ color: '#fbfbf8', roughness: 0.85 });
const capGeo = (() => {
  const g = new THREE.CylinderGeometry(0.125, 0.105, 0.2, 14);
  // голова в baker.glb: центр над началом координат (−0,035; 0,031), макушка — 1,81 м
  g.translate(-0.035, 1.8, 0.031);
  return g;
})();

export const Staff = memo(function Staff({ config }: { config: SiteConfig }) {
  const { scene } = useGLTF(URL);
  const routes = useMemo(() => stationsFor(config), [config]);
  const n = routes.length;

  const { body, cap, local } = useMemo(() => {
    scene.updateMatrixWorld(true);
    let src: THREE.Mesh | null = null;
    scene.traverse((o) => {
      if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
    });
    const mesh = src as unknown as THREE.Mesh;
    const body = new THREE.InstancedMesh(mesh.geometry, mesh.material as THREE.Material, n);
    const cap = new THREE.InstancedMesh(capGeo, capMat, n);
    for (const m of [body, cap]) {
      m.castShadow = true;
      m.frustumCulled = false; // экземпляры по всему цеху — границы исходного меша их не описывают
      m.raycast = () => {}; // клики проходят к станкам
    }
    // квантованная геометрия GLB масштабируется трансформом узла — переносим его в каждый экземпляр
    return { body, cap, local: mesh.matrixWorld.clone() };
  }, [scene, n]);

  useEffect(
    () => () => {
      body.dispose();
      cap.dispose();
    },
    [body, cap],
  );

  const st = useMemo(() => routes.map((r) => ({ heading: r[0]?.face ?? 0 })), [routes]);
  const m = useMemo(() => ({ pose: new THREE.Matrix4(), tmp: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), up: new THREE.Vector3(0, 1, 0) }), []);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    routes.forEach((stations, i) => {
      let x: number;
      let z: number;
      let target: number;
      let bob = 0;
      if (stations.length === 1) {
        // работает у станка: медленно переступает вдоль фронта
        const s = stations[0]!;
        const off = 0.22 * Math.sin(t * 0.35 + i * 1.7);
        x = s.x + s.along[0] * off;
        z = s.z + s.along[1] * off;
        target = s.face + 0.12 * Math.sin(t * 0.5 + i);
      } else {
        // обходит свои станки туда и обратно с остановками
        const legs = stations.slice(1).map((b, k) => Math.hypot(b.x - stations[k]!.x, b.z - stations[k]!.z));
        const seq = [...legs.map((_, k) => k), ...legs.map((_, k) => legs.length - 1 - k)];
        const cycle = seq.reduce((a, k) => a + legs[k]! / SPEED + PAUSE, 0);
        let u = (t + i * 7) % cycle;
        let leg = 0;
        let back = false;
        for (let j = 0; j < seq.length; j++) {
          const dur = legs[seq[j]!]! / SPEED + PAUSE;
          if (u < dur || j === seq.length - 1) {
            leg = seq[j]!;
            back = j >= legs.length;
            break;
          }
          u -= dur;
        }
        const a = stations[back ? leg + 1 : leg]!;
        const b = stations[back ? leg : leg + 1]!;
        if (u < PAUSE) {
          x = a.x;
          z = a.z;
          target = a.face;
        } else {
          const f = Math.min(1, ((u - PAUSE) * SPEED) / legs[leg]!);
          x = a.x + (b.x - a.x) * f;
          z = a.z + (b.z - a.z) * f;
          target = Math.atan2(b.x - a.x, b.z - a.z);
          bob = 0.022 * Math.abs(Math.sin((((u - PAUSE) * SPEED) / STEP) * Math.PI));
        }
      }
      const h = st[i]!;
      const diff = Math.atan2(Math.sin(target - h.heading), Math.cos(target - h.heading));
      h.heading += diff * Math.min(1, delta * 5);
      m.q.setFromAxisAngle(m.up, h.heading);
      m.p.set(x, bob, z);
      m.pose.compose(m.p, m.q, m.s);
      body.setMatrixAt(i, m.tmp.multiplyMatrices(m.pose, local));
      cap.setMatrixAt(i, m.pose);
    });
    body.instanceMatrix.needsUpdate = true;
    cap.instanceMatrix.needsUpdate = true;
  });

  if (!n) return null;
  return (
    <>
      <primitive object={body} />
      <primitive object={cap} />
    </>
  );
});
