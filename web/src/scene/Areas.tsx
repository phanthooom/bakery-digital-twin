import { memo, useMemo, type ReactNode } from 'react';
import { Html, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { AreaConfig, FloorRect, SiteConfig } from '@bakery/shared';
import { useSupply } from '../data/store';
import { SupplySim } from '../data/mockSupply';
import { fmtMass } from '../ui/format';
import { supplyView, type TrolleyLoad } from '../ui/supplyView';
import { FloorLabel, ZoneOutline } from './Hall';
import { M } from './materials';
import { MergeStatic } from './MergeStatic';

/**
 * Участки и помещения без счётчиков (config.areas): весовая, тележки с тестом перед печами,
 * остывание, мойка тары, стеклянный офис мастера, бытовые (санпропускник, раздевалка, столовая).
 * Тележки перед печами и на остывании — по выпуску (supplyView.floor), остальное — обстановка.
 */

const PART_H = 2.6; // перегородки
const partition = new THREE.MeshStandardMaterial({ color: '#f3f2ee', roughness: 0.9 });
const glassMat = new THREE.MeshStandardMaterial({ color: '#cfe3ee', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
const frameMat = new THREE.MeshStandardMaterial({ color: '#5d6368', metalness: 0.5, roughness: 0.4 });
const tileWet = new THREE.MeshStandardMaterial({ color: '#d7e0e4', roughness: 0.7 });
const officeFloor = new THREE.MeshStandardMaterial({ color: '#cdb89a', roughness: 0.8 });
const breadMat = new THREE.MeshStandardMaterial({ color: '#c98a3e', roughness: 0.75 });
const lockerMat = new THREE.MeshStandardMaterial({ color: '#7f97ab', roughness: 0.55, metalness: 0.3 });
const tableTop = new THREE.MeshStandardMaterial({ color: '#e9e5dc', roughness: 0.6 });
const binMat = new THREE.MeshStandardMaterial({ color: '#f5f5f2', roughness: 0.5 });
const lidColors = ['#c8242b', '#2f63b8', '#2e8b57'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));

const cx = (z: FloorRect) => (z.x0 + z.x1) / 2;
const cz = (z: FloorRect) => (z.z0 + z.z1) / 2;

function Tag({ position, title, value }: { position: [number, number, number]; title: string; value: string }) {
  return (
    <Html position={position} center zIndexRange={[19, 0]} style={{ pointerEvents: 'none' }}>
      <div className="scene-tag supply-tag">
        <span className="scene-tag-name">{title}</span>
        <span className="scene-tag-value">{value}</span>
      </div>
    </Html>
  );
}

function Box({ p, s, m, cast = true }: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material; cast?: boolean }) {
  return (
    <mesh position={p} material={m} castShadow={cast} receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  );
}

/** Стол на четырёх ножках: верх на высоте h. */
function Table({ x, z, w, d, h = 0.78, top = M.steel }: { x: number; z: number; w: number; d: number; h?: number; top?: THREE.Material }) {
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, h - 0.02, 0]} s={[w, 0.04, d]} m={top} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} p={[(sx * (w - 0.08)) / 2, (h - 0.04) / 2, (sz * (d - 0.08)) / 2]} s={[0.04, h - 0.04, 0.04]} m={M.steel} cast={false} />))}
    </group>
  );
}

/** Перегородка с проёмами: от (x0, z0) до (x1, z1) по прямой; gaps — проёмы [от, до] вдоль неё, м. */
function Partition({ a, b, gaps = [], h = PART_H, glass = false }: { a: [number, number]; b: [number, number]; gaps?: [number, number][]; h?: number; glass?: boolean }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ang = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  const solid: [number, number][] = [];
  let s = 0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > s) solid.push([s, g0]);
    s = Math.max(s, g1);
  }
  if (s < len) solid.push([s, len]);
  return (
    <group position={[a[0], 0, a[1]]} rotation={[0, ang, 0]}>
      {solid.map(([u0, u1]) =>
        glass ? (
          <group key={u0}>
            <mesh position={[(u0 + u1) / 2, h / 2, 0]} material={glassMat}>
              <planeGeometry args={[u1 - u0, h]} />
            </mesh>
            <Box p={[(u0 + u1) / 2, h, 0]} s={[u1 - u0, 0.06, 0.06]} m={frameMat} />
            <Box p={[(u0 + u1) / 2, 0.05, 0]} s={[u1 - u0, 0.1, 0.06]} m={frameMat} />
            {[u0, u1].map((u) => (
              <Box key={u} p={[u, h / 2, 0]} s={[0.06, h, 0.06]} m={frameMat} />
            ))}
          </group>
        ) : (
          <Box key={u0} p={[(u0 + u1) / 2, h / 2, 0]} s={[u1 - u0, h, 0.1]} m={partition} />
        ),
      )}
    </group>
  );
}

/** Тележка-шпилька: стойки, противни и на них тесто или хлеб. */
function Trolley({ x, z, item }: { x: number; z: number; item: THREE.Material }) {
  return (
    <group position={[x, 0, z]}>
      {[-0.25, 0.25].flatMap((dx) => [-0.3, 0.3].map((dz) => <Box key={`${dx}${dz}`} p={[dx, 0.85, dz]} s={[0.03, 1.6, 0.03]} m={M.steel} cast={false} />))}
      {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5].map((y) => (
        <group key={y} position={[0, y, 0]}>
          <Box p={[0, 0, 0]} s={[0.52, 0.02, 0.62]} m={M.steelLight} cast={false} />
          {[-0.18, 0, 0.18].map((dz) => (
            <mesh key={dz} position={[0, 0.045, dz]} material={item} scale={[1.6, 0.55, 0.7]}>
              <sphereGeometry args={[0.09, 8, 6]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function TrolleyArea({ area, load, item, title }: { area: AreaConfig; load: TrolleyLoad | null; item: THREE.Material; title: string }) {
  const n = Math.min(12, load?.trolleys ?? 0);
  const z = area.zone;
  const cols = Math.max(1, Math.floor((z.x1 - z.x0 - 0.8) / 0.8));
  return (
    <group>
      <MergeStatic>
        {Array.from({ length: n }, (_, i) => (
          <Trolley key={i} x={z.x0 + 0.8 + (i % cols) * 0.8} z={z.z0 + 1.2 + Math.floor(i / cols) * 1.4} item={item} />
        ))}
      </MergeStatic>
      {load && load.kg > 0 && <Tag position={[cx(z), 2.1, cz(z)]} title={title} value={`${fmtMass(load.kg)} · ${load.trolleys} тел.`} />}
    </group>
  );
}

function Weighing({ area }: { area: AreaConfig }) {
  const z = area.zone;
  const x = cx(z);
  const zc = cz(z);
  return (
    <MergeStatic>
      {/* платформенные весы с табло на стойке */}
      <Box p={[x - 1.6, 0.04, zc + 0.3]} s={[1.2, 0.08, 1.2]} m={M.steelDark} />
      <Box p={[x - 2.25, 0.6, zc - 0.2]} s={[0.05, 1.2, 0.05]} m={M.steel} cast={false} />
      <Box p={[x - 2.25, 1.25, zc - 0.2]} s={[0.3, 0.2, 0.08]} m={M.black} />
      {/* стол дозировки: настольные весы и тара с сырьём */}
      <Table x={x + 0.6} z={zc - 0.9} w={1.8} d={0.8} />
      <Box p={[x + 0.2, 0.82, zc - 0.9]} s={[0.36, 0.05, 0.3]} m={M.steelLight} />
      <Box p={[x + 0.2, 0.9, zc - 1.12]} s={[0.16, 0.1, 0.03]} m={M.black} />
      {lidColors.map((lid, i) => (
        <group key={i} position={[x + 0.75 + i * 0.36, 0.78, zc - 0.9]}>
          <mesh position={[0, 0.14, 0]} material={binMat} castShadow>
            <cylinderGeometry args={[0.14, 0.12, 0.28, 14]} />
          </mesh>
          <mesh position={[0, 0.29, 0]} material={lid}>
            <cylinderGeometry args={[0.145, 0.145, 0.025, 14]} />
          </mesh>
        </group>
      ))}
      {/* поддон с мешками у весов */}
      <group position={[x + 1.9, 0, zc + 0.9]}>
        <Box p={[0, 0.07, 0]} s={[1.1, 0.14, 0.9]} m={M.wood} />
        {[-0.25, 0.25].flatMap((dx) => [-0.2, 0.2].map((dz) => <RoundedBox key={`${dx}${dz}`} args={[0.46, 0.17, 0.34]} radius={0.06} position={[dx, 0.24, dz]} material={M.sack} castShadow />))}
      </group>
    </MergeStatic>
  );
}

function Washing({ area }: { area: AreaConfig }) {
  const z = area.zone;
  const door = (z.x1 - z.x0) / 2;
  return (
    <MergeStatic>
      <mesh position={[cx(z), 0.006, cz(z)]} rotation={[-Math.PI / 2, 0, 0]} material={tileWet} receiveShadow>
        <planeGeometry args={[z.x1 - z.x0, z.z1 - z.z0]} />
      </mesh>
      <Partition a={[z.x0, z.z1]} b={[z.x0, z.z0]} />
      <Partition a={[z.x0, z.z0]} b={[z.x1, z.z0]} gaps={[[door - 0.9, door + 0.9]]} />
      <Partition a={[z.x1, z.z0]} b={[z.x1, z.z1]} />
      {/* туннельная мойка лотков: корпус, загрузка и выгрузка на роликах */}
      <group position={[cx(z) + 0.8, 0, z.z1 - 1.4]}>
        <RoundedBox args={[2.4, 1.5, 1.1]} radius={0.05} position={[0, 0.75, 0]} material={M.steel} castShadow />
        <Box p={[0, 1.2, 0.56]} s={[0.5, 0.25, 0.02]} m={M.black} />
        {[-1, 1].map((s) => (
          <Box key={s} p={[s * 1.75, 0.85, 0]} s={[1.1, 0.06, 0.7]} m={M.steelLight} />
        ))}
      </group>
      {/* мойка ручная и стеллаж чистых лотков */}
      <Table x={z.x0 + 1.2} z={z.z1 - 0.8} w={1.6} d={0.7} h={0.9} />
      <Box p={[z.x0 + 1.2, 0.86, z.z1 - 0.8]} s={[1.0, 0.1, 0.5]} m={M.steelDark} cast={false} />
      <group position={[z.x1 - 0.8, 0, z.z0 + 1.2]}>
        {[-0.3, 0.3].flatMap((dx) => [-0.25, 0.25].map((dz) => <Box key={`${dx}${dz}`} p={[dx, 0.9, dz]} s={[0.04, 1.8, 0.04]} m={M.steel} cast={false} />))}
        {[0.3, 0.6, 0.9, 1.2, 1.5].map((y) => (
          <Box key={y} p={[0, y, 0]} s={[0.66, 0.05, 0.56]} m={M.steelLight} />
        ))}
      </group>
      {/* решётка трапа в полу */}
      <Box p={[cx(z) - 1.2, 0.012, cz(z)]} s={[0.4, 0.01, 0.4]} m={M.steelDark} cast={false} />
    </MergeStatic>
  );
}

/** Экран мастера: схема цеха с зонами — тот же двойник на мониторе. */
function useScreenTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 160;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0f1b2a';
    g.fillRect(0, 0, 256, 160);
    g.strokeStyle = '#5aa9ff';
    g.lineWidth = 3;
    g.strokeRect(20, 20, 216, 120);
    g.fillStyle = '#2fbf71';
    for (let i = 0; i < 6; i++) g.fillRect(30 + i * 34, 28, 22, 18);
    g.fillStyle = '#f2a03d';
    g.fillRect(200, 70, 26, 50);
    g.fillStyle = '#9fb4c8';
    g.fillRect(30, 70, 26, 50);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

function Office({ area }: { area: AreaConfig }) {
  const z = area.zone;
  const screen = useScreenTexture();
  const door = (z.x1 - z.x0) / 2;
  return (
    <group>
      <MergeStatic>
        <mesh position={[cx(z), 0.008, cz(z)]} rotation={[-Math.PI / 2, 0, 0]} material={officeFloor} receiveShadow>
          <planeGeometry args={[z.x1 - z.x0, z.z1 - z.z0]} />
        </mesh>
        <Partition a={[z.x0, z.z0]} b={[z.x1, z.z0]} glass />
        <Partition a={[z.x1, z.z0]} b={[z.x1, z.z1]} glass />
        <Partition a={[z.x1, z.z1]} b={[z.x0, z.z1]} gaps={[[door - 0.5, door + 0.5]]} glass />
        <Partition a={[z.x0, z.z1]} b={[z.x0, z.z0]} glass />
        <Table x={cx(z) - 0.2} z={z.z0 + 0.8} w={1.8} d={0.8} h={0.76} top={tableTop} />
        <Box p={[cx(z) - 0.2, 0.79, z.z0 + 0.62]} s={[0.25, 0.04, 0.18]} m={M.black} />
        <Box p={[cx(z) - 0.2, 0.95, z.z0 + 0.6]} s={[0.04, 0.3, 0.04]} m={M.black} cast={false} />
        {/* кресло */}
        <Box p={[cx(z) - 0.2, 0.48, z.z0 + 1.55]} s={[0.5, 0.08, 0.5]} m={M.black} />
        <Box p={[cx(z) - 0.2, 0.75, z.z0 + 1.8]} s={[0.5, 0.5, 0.06]} m={M.black} />
        <Box p={[cx(z) - 0.2, 0.22, z.z0 + 1.55]} s={[0.05, 0.44, 0.05]} m={M.steel} cast={false} />
        {/* шкаф с документами */}
        <Box p={[z.x1 - 0.45, 0.9, cz(z) + 0.6]} s={[0.5, 1.8, 0.9]} m={lockerMat} />
      </MergeStatic>
      {/* монитор — отдельно: у него своя текстура */}
      <group position={[cx(z) - 0.2, 1.25, z.z0 + 0.6]}>
        <Box p={[0, 0, -0.03]} s={[0.92, 0.58, 0.04]} m={M.black} />
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[0.86, 0.52]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Amenities({ area }: { area: AreaConfig }) {
  const z = area.zone;
  const w = (z.x1 - z.x0) / 3;
  const xs = [z.x0, z.x0 + w, z.x0 + 2 * w, z.x1];
  const names = ['САНПРОПУСКНИК', 'РАЗДЕВАЛКА', 'СТОЛОВАЯ'];
  const rooms: ReactNode[] = [];
  // санпропускник: раковины вдоль стены и зеркало
  rooms.push(
    <group key="san">
      {[0, 1, 2].map((i) => (
        <group key={i} position={[xs[0]! + 0.8 + i * 0.9, 0, z.z1 - 0.45]}>
          <Box p={[0, 0.8, 0]} s={[0.55, 0.12, 0.45]} m={binMat} />
          <Box p={[0, 0.4, 0.1]} s={[0.08, 0.8, 0.08]} m={binMat} cast={false} />
          <Box p={[0, 1.5, 0.2]} s={[0.5, 0.6, 0.02]} m={glassMat} cast={false} />
        </group>
      ))}
    </group>,
  );
  // раздевалка: шкафчики и скамья
  rooms.push(
    <group key="lock">
      {Array.from({ length: 5 }, (_, i) => (
        <Box key={i} p={[xs[1]! + 0.45 + i * 0.52, 0.9, z.z1 - 0.35]} s={[0.48, 1.8, 0.5]} m={lockerMat} />
      ))}
      <Box p={[xs[1]! + w / 2, 0.45, z.z1 - 1.3]} s={[2.2, 0.06, 0.35]} m={M.wood} />
    </group>,
  );
  // столовая: два стола со стульями и стойка с холодильником
  rooms.push(
    <group key="cant">
      {[0, 1].map((r) => (
        <group key={r} position={[xs[2]! + w / 2, 0, z.z0 + 1.8 + r * 2]}>
          <Table x={0} z={0} w={1.6} d={0.8} h={0.75} top={tableTop} />
          {[-0.5, 0.5].flatMap((dx) => [-1, 1].map((s) => <Box key={`${dx}${s}`} p={[dx, 0.45, s * 0.65]} s={[0.4, 0.06, 0.4]} m={M.wood} />))}
        </group>
      ))}
      <Box p={[xs[3]! - 0.45, 0.95, z.z1 - 0.5]} s={[0.7, 1.9, 0.7]} m={binMat} />
    </group>,
  );
  return (
    <group>
      <MergeStatic>
        {/* внешний контур: к цеху — стена с дверями в каждую комнату, к стене корпуса — открыто */}
        <Partition a={[z.x0, z.z1]} b={[z.x0, z.z0]} />
        <Partition a={[z.x0, z.z0]} b={[z.x1, z.z0]} gaps={[0, 1, 2].map((i) => [i * w + w / 2 - 0.5, i * w + w / 2 + 0.5] as [number, number])} />
        <Partition a={[z.x1, z.z0]} b={[z.x1, z.z1]} />
        {[xs[1]!, xs[2]!].map((x) => (
          <Partition key={x} a={[x, z.z0]} b={[x, z.z1]} gaps={[[z.z1 - z.z0 - 1.6, z.z1 - z.z0 - 0.6]]} />
        ))}
        {rooms}
      </MergeStatic>
      {names.map((n, i) => (
        <FloorLabel key={n} text={n} x={xs[i]! + 0.3} z={cz(z) + 0.4} height={0.34} />
      ))}
    </group>
  );
}

export const Areas = memo(function Areas({ config }: { config: SiteConfig }) {
  const snap = useSupply();
  const floor = useMemo(() => (snap && config.supply ? supplyView(snap, config, SupplySim.localMidnight(snap.now, config.site.timezone)).floor : null), [snap, config]);
  const areas = config.areas ?? [];
  return (
    <group>
      {areas.map((a) => (
        <group key={a.id}>
          {a.kind !== 'office' && a.kind !== 'amenities' && a.kind !== 'washing' && <ZoneOutline zone={a.zone} color="#8b8a83" />}
          {a.kind !== 'amenities' && <FloorLabel text={a.label} x={a.zone.x0 + 0.4} z={a.zone.z1 - 0.55} height={0.42} />}
          {a.kind === 'weighing' && <Weighing area={a} />}
          {a.kind === 'ovenQueue' && <TrolleyArea area={a} load={floor?.ovenQueue ?? null} item={M.dough} title="Ждёт печь" />}
          {a.kind === 'cooling' && <TrolleyArea area={a} load={floor?.cooling ?? null} item={breadMat} title="Остывает" />}
          {a.kind === 'washing' && <Washing area={a} />}
          {a.kind === 'office' && <Office area={a} />}
          {a.kind === 'amenities' && <Amenities area={a} />}
        </group>
      ))}
    </group>
  );
});
