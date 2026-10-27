import { memo, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Select } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  SEMI_TIMING,
  VAN_TIMING,
  cargoSlots,
  carrierState,
  countDone,
  dockState,
  type DockPhase,
  type DockVisit,
  type FloorPoint,
  type HaulPlan,
  type SiteConfig,
  type SupplierUnloading,
  type TripLoading,
  type YardLane,
} from '@bakery/shared';
import { M } from './materials';
import { BrandLivery, RearDoors, TRUCK_LENGTH, Truck, VAN_BODY } from './Truck';
import { VehicleNightLights } from './NightLighting';

/**
 * Машины во дворе по расписанию (packages/shared/src/dock.ts): фургоны и тягач поставщика въезжают, сдают задом
 * к рампе, открывают двери, грузятся или разгружаются и уезжают. Рохля возит лотки со склада готовой продукции
 * в фургон, погрузчик — поддоны из прицепа на склад сырья.
 *
 * Положение всего движущегося считается в каждом кадре из (расписание, Date.now()) — ничего не накапливается:
 * после перезагрузки или переключения вкладки картинка та же. React перерисовывается только при смене фазы.
 */

const LOADING_PHASES: ReadonlySet<DockPhase> = new Set(['doorsOpening', 'working', 'doorsClosing', 'departing']);

// ───────────────────────────── маршруты двора ─────────────────────────────

const frontOf = (config: SiteConfig) => config.site.hall.depth / 2;
/** Зазор от переднего края цеха до заднего торца машины у рампы. */
const DOCK_GAP = 0.5;

/** Полоса фургона: въезд и выезд справа (со стороны рамп отгрузки), задний ход радиусом 6 м. */
export function vanLane(config: SiteConfig, dockX: number): YardLane {
  const parkedZ = frontOf(config) + DOCK_GAP;
  // полоса въезда — дальше носа соседних фургонов у рамп, с запасом на полширины
  const laneZ = parkedZ + TRUCK_LENGTH.semi + 2.4;
  return { dockX, parkedZ, side: 1, laneZ, exitLaneZ: laneZ + 3, radius: 6, farX: config.site.hall.width / 2 + 22 };
}

/** Длина тягача Tesla Semi с полуприцепом, м (tesla-semi.glb). */
export const SEMI_LENGTH = 15.3;
export const SEMI_HEIGHT = 4.06;

/** Полоса тягача поставщика: въезд и выезд слева (со стороны рампы приёмки), радиус 9 м. */
export function supplierLane(config: SiteConfig, dockX: number): YardLane {
  const parkedZ = frontOf(config) + DOCK_GAP;
  return { dockX, parkedZ, side: -1, laneZ: parkedZ + 11.5, exitLaneZ: parkedZ + 15, radius: 9, farX: -(config.site.hall.width / 2 + 28) };
}

// ───────────────────────────── выбор машины ─────────────────────────────

export interface VehicleSelect {
  selected: string | null;
  hovered: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

const pick = (sel: VehicleSelect, id: string) => ({
  onPointerOver: (e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), sel.onHover(id)),
  onPointerOut: () => sel.onHover(null),
  onClick: (e: ThreeEvent<MouseEvent>) => (e.stopPropagation(), sel.onSelect(id)),
});

/** Фаза для подписи: React узнаёт о ней только при смене, а не каждый кадр. */
function usePhase(initial: DockPhase) {
  const [phase, setPhase] = useState<DockPhase>(initial);
  const ref = useRef(initial);
  return [phase, (p: DockPhase) => {
    if (ref.current === p) return;
    ref.current = p;
    setPhase(p);
  }] as const;
}

// ───────────────────────────── груз ─────────────────────────────

/** Пластиковый лоток с хлебом 600 × 400 мм, высота 260 мм — ставятся штабелями. */
const CRATE = { w: 0.6, h: 0.26, l: 0.4 };
const crateGeo = new THREE.BoxGeometry(CRATE.w, CRATE.h * 0.82, CRATE.l);
const breadGeo = new THREE.BoxGeometry(CRATE.w - 0.08, CRATE.h * 0.18, CRATE.l - 0.08);
const crateMat = new THREE.MeshStandardMaterial({ color: '#2f6db5', roughness: 0.55 });
const breadMat = new THREE.MeshStandardMaterial({ color: '#d39a52', roughness: 0.85 });
/** Внутренний объём будки фургона. */
const VAN_INNER = { w: VAN_BODY.width - 2 * VAN_BODY.wall - 0.04, h: VAN_BODY.height - 2 * VAN_BODY.wall - 0.04, l: VAN_BODY.length - VAN_BODY.wall - 0.1 };

/** Поддон с мешками (поставка сырья) — как на стеллажах склада сырья: 1100 × 900 мм, 20 мешков в 4 слоя. */
const PALLET = { w: 1.1, h: 0.85, l: 0.9 };
const palletGeo = new THREE.BoxGeometry(PALLET.w, 0.14, PALLET.l);
/** Мешки на поддоне одной геометрией (раскладка — как в Pallet из SupplyScene: 5 в слое, слои вперевязку). */
const sackStackGeo = (() => {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 20; i++) {
    const layer = Math.floor(i / 5);
    const k = i % 5;
    const rot = layer % 2;
    const x = k < 4 ? (k % 2 ? 0.24 : -0.24) : 0;
    const z = k < 4 ? (k < 2 ? -0.18 : 0.18) : 0;
    const g = new THREE.BoxGeometry(0.44, 0.16, 0.32);
    if (rot) g.rotateY(Math.PI / 2);
    g.translate(rot ? z : x, 0.22 + layer * 0.17, rot ? x : z);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return merged;
})();
/** Прицеп tesla-semi.glb изнутри: x ±1,25, пол на 1,32, крыша 3,93, от заднего торца 0,2 до 11,2 м. */
const TRAILER = { halfW: 1.25, floorY: 1.32, roofY: 3.93, z0: 0.2, z1: 11.2 };
const TRAILER_INNER = { w: TRAILER.halfW * 2 - 0.1, h: PALLET.h, l: TRAILER.z1 - TRAILER.z0 - 0.1 };

/** Набор InstancedMesh для штук груза: места заданы заранее, видно первые count. 1 draw call на материал. */
function useInstances(slots: [number, number, number][], parts: { geo: THREE.BufferGeometry; mat: THREE.Material; dy: number }[]) {
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    parts.forEach((p, k) => {
      const mesh = refs.current[k];
      if (!mesh) return;
      slots.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y + p.dy, z)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = 0;
      mesh.visible = false;
    });
  }, [slots, parts]);
  const setCount = (n: number) => {
    for (const mesh of refs.current) {
      if (!mesh || mesh.count === n) continue;
      mesh.count = n;
      mesh.visible = n > 0; // пустой набор не рисуется вовсе (ни в кадре, ни в тенях)
    }
  };
  const nodes = parts.map((p, k) => (
    <instancedMesh key={k} ref={(el) => void (refs.current[k] = el)} args={[p.geo, p.mat, Math.max(1, slots.length)]} castShadow receiveShadow frustumCulled={false} />
  ));
  return { setCount, nodes };
}

const CRATE_PARTS = [
  { geo: crateGeo, mat: crateMat, dy: -CRATE.h * 0.09 },
  { geo: breadGeo, mat: breadMat, dy: CRATE.h * 0.32 },
];
const PALLET_PARTS = [
  { geo: palletGeo, mat: M.wood, dy: -PALLET.h / 2 + 0.07 },
  { geo: sackStackGeo, mat: M.sack, dy: -PALLET.h / 2 },
];

// ───────────────────────────── огни ─────────────────────────────

const reverseMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fffbe8', emissiveIntensity: 2.2, toneMapped: false });

/** Белые фонари заднего хода — горят только на заднем ходу. */
function ReverseLights({ lightsRef, x, y }: { lightsRef: React.RefObject<THREE.Group | null>; x: number; y: number }) {
  return (
    <group ref={lightsRef} visible={false}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * x, y, -0.06]} material={reverseMat}>
          <boxGeometry args={[0.14, 0.1, 0.03]} />
        </mesh>
      ))}
    </group>
  );
}

// ───────────────────────────── фургон ─────────────────────────────

export interface VanProps {
  id: string;
  plate: string;
  lane: YardLane;
  visits: DockVisit[];
  loadings: TripLoading[];
  brand: string;
  tagline?: string;
  color: string;
  sel: VehicleSelect;
  isNight: boolean;
  /** Подпись над рампой по текущей фазе (рисует SupplyScene). */
  label: (phase: DockPhase) => ReactNode;
}

export const MovingVan = memo(function MovingVan({ id, plate, lane, visits, loadings, brand, tagline, color, sel, isNight, label }: VanProps) {
  const group = useRef<THREE.Group>(null);
  const door = useRef(0);
  const reverse = useRef<THREE.Group>(null);
  const [phase, setPhase] = usePhase(dockState(visits, lane, Date.now(), VAN_TIMING).phase);
  const slots = useMemo(() => cargoSlots(VAN_INNER, CRATE), []);
  const crates = useInstances(slots, CRATE_PARTS);
  const byVisit = useMemo(() => new Map(loadings.map((l) => [l.visit.id, l])), [loadings]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = Date.now();
    const st = dockState(visits, lane, now, VAN_TIMING);
    g.visible = st.phase !== 'away';
    g.position.set(st.x, 0, st.z);
    g.rotation.y = st.heading;
    door.current = st.door;
    if (reverse.current) reverse.current.visible = st.phase === 'reversing';
    const l = st.visit && LOADING_PHASES.has(st.phase) ? byVisit.get(st.visit.id) : undefined;
    crates.setCount(l ? Math.min(slots.length, countDone(l.haul.doneAt, now)) : 0);
    setPhase(st.phase);
  });

  const active = sel.selected === id || sel.hovered === id;
  return (
    <group>
      <Select enabled={active}>
        <group ref={group} {...pick(sel, id)}>
          <Truck cab="semi" brand={brand} tagline={tagline} color={color} plate={plate} loading={phase === 'working'} doorRef={door} />
          {/* лотки в будке: от кабины к дверям, рядами снизу вверх */}
          <group position={[0, VAN_BODY.floorY + VAN_BODY.wall, 0.04]}>{crates.nodes}</group>
          <ReverseLights lightsRef={reverse} x={VAN_BODY.width / 2 - 0.5} y={0.62} />
          {isNight && <VehicleNightLights frontZ={TRUCK_LENGTH.semi} width={2.1} headlightY={0.95} roofY={3.08} />}
        </group>
      </Select>
      {/* пока фургон в рейсе — по пустому месту у рампы тоже можно выбрать машину */}
      <mesh position={[lane.dockX, 0.02, lane.parkedZ + 2.5]} rotation={[-Math.PI / 2, 0, 0]} {...pick(sel, id)} visible={phase === 'away'}>
        <planeGeometry args={[2.3, 5]} />
        <meshBasicMaterial color="#2f7bff" transparent opacity={active ? 0.14 : 0.04} depthWrite={false} />
      </mesh>
      {label(phase)}
    </group>
  );
});

// ───────────────────────────── тягач поставщика ─────────────────────────────

const SEMI_URL = '/models/tesla-semi.glb';
useGLTF.preload(SEMI_URL);
/** Борта прицепа в tesla-semi.glb: плоскости x = +1,278 и −1,272, y 1,30…3,97, z 0,17…11,26. */
const TRAILER_SIDES = { right: 1.278 + 0.006, left: 1.272 + 0.006, y: 2.635, z: 5.715, length: 11.0, height: 2.6 };
const trailerDoorMat = new THREE.MeshStandardMaterial({ color: '#e4e6e6', roughness: 0.5 });
const linerMat = new THREE.MeshStandardMaterial({ color: '#6b7075', roughness: 0.8, side: THREE.BackSide });

/**
 * Тягач с полуприцепом с открытым задом: из модели убираются треугольники задней стенки и дверей прицепа
 * (всё, что целиком у заднего торца выше пола прицепа), вместо них — свои створки на петлях и обшивка внутри.
 * Исходная сцена useGLTF не меняется (её же склеивает GltfModel) — геометрия копируется с новым индексом.
 */
function useOpenSemi() {
  const { scene } = useGLTF(SEMI_URL);
  return useMemo(() => {
    const root = scene.clone(true);
    root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const src = mesh.geometry;
      const pos = src.getAttribute('position');
      const index = src.index;
      const tris = index ? index.count / 3 : pos.count / 3;
      const keep: number[] = [];
      for (let t = 0; t < tris; t++) {
        let rear = true;
        const ids = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k));
        for (const i of ids) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          if (v.z > 0.45 || v.y < 1.25) rear = false;
        }
        if (!rear) keep.push(...ids);
      }
      const g = src.clone();
      g.setIndex(keep);
      mesh.geometry = g;
    });
    return root;
  }, [scene]);
}

export interface SupplierProps {
  id: string;
  lane: YardLane;
  unloadings: SupplierUnloading[];
  brand: string;
  tagline: string;
  color: string;
  sel: VehicleSelect;
  isNight: boolean;
  label: (phase: DockPhase, u: SupplierUnloading | null) => ReactNode;
}

export const MovingSupplier = memo(function MovingSupplier({ id, lane, unloadings, brand, tagline, color, sel, isNight, label }: SupplierProps) {
  const group = useRef<THREE.Group>(null);
  const door = useRef(0);
  const reverse = useRef<THREE.Group>(null);
  const visits = useMemo(() => unloadings.map((u) => u.visit), [unloadings]);
  const byVisit = useMemo(() => new Map(unloadings.map((u) => [u.visit.id, u])), [unloadings]);
  const initial = dockState(visits, lane, Date.now(), SEMI_TIMING);
  const [phase, setPhase] = usePhase(initial.phase);
  const [visitId, setVisitId] = useState<string | null>(initial.visit?.id ?? null);
  const semi = useOpenSemi();
  const all = useMemo(() => cargoSlots(TRAILER_INNER, PALLET), []);
  // поддоны стоят у дверей: занимаем n мест, ближайших к дверям; показываем первыми дальние — и по ходу разгрузки
  // исчезают те, что у дверей (их и забирает погрузчик)
  const n = Math.min(all.length, (visitId && byVisit.get(visitId)?.pallets) || 0);
  const slots = useMemo(() => all.slice(all.length - n), [all, n]);
  const pallets = useInstances(slots, PALLET_PARTS);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = Date.now();
    const st = dockState(visits, lane, now, SEMI_TIMING);
    g.visible = st.phase !== 'away';
    g.position.set(st.x, 0, st.z);
    g.rotation.y = st.heading;
    door.current = st.door;
    if (reverse.current) reverse.current.visible = st.phase === 'reversing';
    const u = st.visit ? byVisit.get(st.visit.id) : undefined;
    // приехал полный, по ходу разгрузки поддоны уходят от дверей к кабине, уезжает пустым
    const left = !u ? 0 : st.phase === 'arriving' || st.phase === 'reversing' || st.phase === 'parked' ? u.pallets : st.phase === 'departing' ? 0 : u.pallets - countDone(u.haul.pickedAt, now);
    pallets.setCount(Math.min(slots.length, left));
    setPhase(st.phase);
    const vid = st.visit?.id ?? null;
    if (vid !== visitId) setVisitId(vid);
  });

  const active = sel.selected === id || sel.hovered === id;
  return (
    <group>
      <Select enabled={active}>
        <group ref={group} {...pick(sel, id)}>
          <primitive object={semi} />
          <BrandLivery brand={brand} tagline={tagline} color={color} {...TRAILER_SIDES} px={480} center />
          {/* обшивка прицепа изнутри — видна, когда двери открыты */}
          <mesh position={[0, (TRAILER.floorY + TRAILER.roofY) / 2, (TRAILER.z0 + TRAILER.z1) / 2]} material={linerMat} receiveShadow>
            <boxGeometry args={[TRAILER.halfW * 2, TRAILER.roofY - TRAILER.floorY, TRAILER.z1 - TRAILER.z0]} />
          </mesh>
          <mesh position={[0, TRAILER.floorY - 0.02, (TRAILER.z0 + TRAILER.z1) / 2 - 0.05]} material={M.steelDark} receiveShadow>
            <boxGeometry args={[TRAILER.halfW * 2 + 0.05, 0.06, TRAILER.z1 - TRAILER.z0 + 0.1]} />
          </mesh>
          <RearDoors doorRef={door} hingeX={1.3} y0={1.3} height={2.66} material={trailerDoorMat} />
          <group position={[0, TRAILER.floorY, TRAILER.z0 + 0.05]}>{pallets.nodes}</group>
          <ReverseLights lightsRef={reverse} x={0.95} y={1.1} />
          {isNight && <VehicleNightLights frontZ={SEMI_LENGTH} width={2.45} headlightY={1.08} roofY={3.96} isSemiTrailer />}
        </group>
      </Select>
      {label(phase, visitId ? byVisit.get(visitId) ?? null : null)}
    </group>
  );
});

// ───────────────────────────── перевозчики ─────────────────────────────

interface CarrierPath {
  /** От места назначения к источнику. */
  points: FloorPoint[];
  /** Куда смотреть, стоя у источника и у места назначения (rotation.y). */
  faceSource: number;
  faceDest: number;
}

function polyline(points: FloorPoint[]) {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]));
  return { points, lengths, total: lengths.reduce((a, b) => a + b, 0) };
}

/** Точка на ломаной через d метров и направление движения там. */
function along(pl: ReturnType<typeof polyline>, d: number): { x: number; z: number; dx: number; dz: number } {
  let i = 0;
  let left = Math.min(Math.max(0, d), pl.total);
  while (i < pl.lengths.length - 1 && left > pl.lengths[i]!) left -= pl.lengths[i++]!;
  const [x0, z0] = pl.points[i]!;
  const [x1, z1] = pl.points[i + 1] ?? pl.points[i]!;
  const f = pl.lengths[i] ? left / pl.lengths[i]! : 0;
  return { x: x0 + (x1 - x0) * f, z: z0 + (z1 - z0) * f, dx: x1 - x0, dz: z1 - z0 };
}

const ease = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/**
 * Положение перевозчика по расписанию ходок: координаты — чистая функция времени;
 * поворот на месте сглаживается (разворот у стеллажа или у кузова), это единственное, что зависит от прошлого кадра.
 */
function useCarrier(plans: () => HaulPlan[], path: CarrierPath, apply: (state: { x: number; z: number; heading: number; visible: boolean; carrying: number; moving: boolean; dist: number }) => void) {
  const pl = useMemo(() => polyline(path.points), [path]);
  const heading = useRef(NaN);
  useFrame((_, delta) => {
    const now = Date.now();
    const plan = plans().find((p) => p.runs.length && now >= p.runs[0]!.departAt - 60_000 && now < p.runs.at(-1)!.end + 30_000);
    if (!plan) return apply({ x: 0, z: 0, heading: 0, visible: false, carrying: 0, moving: false, dist: 0 });
    const c = carrierState(plan, now);
    const d = c.leg === 'toSource' ? pl.total * ease(c.t) : c.leg === 'atSource' ? pl.total : c.leg === 'toDest' ? pl.total * (1 - ease(c.t)) : 0;
    const p = along(pl, d);
    const moving = c.leg === 'toSource' || c.leg === 'toDest';
    const dir = c.leg === 'toDest' ? -1 : 1;
    const target = moving ? Math.atan2(p.dx * dir, p.dz * dir) : c.leg === 'atSource' ? path.faceSource : path.faceDest;
    if (Number.isNaN(heading.current)) heading.current = target;
    const diff = Math.atan2(Math.sin(target - heading.current), Math.cos(target - heading.current));
    heading.current += diff * Math.min(1, delta * 5);
    apply({ x: p.x, z: p.z, heading: heading.current, visible: true, carrying: c.carrying, moving, dist: d });
  });
}

const WORKER_URL = '/models/worker.glb';
useGLTF.preload(WORKER_URL);
const STEP = 0.72;

/**
 * Рабочий с рохлей (worker.glb: рабочий у ручки лицом к +z, вилы до ~2,1 м впереди) возит лотки
 * со склада готовой продукции в фургон. Лотки на вилах — по числу, которое он везёт сейчас.
 */
export const TrolleyLoader = memo(function TrolleyLoader({ loadings, path }: { loadings: TripLoading[]; path: CarrierPath }) {
  const { scene } = useGLTF(WORKER_URL);
  const object = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.raycast = () => {};
      }
    });
    return c;
  }, [scene]);
  const ref = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  // штабель на вилах: 2 в глубину × 4 в высоту
  const slots = useMemo<[number, number, number][]>(() => {
    const out: [number, number, number][] = [];
    for (let k = 0; k < 4; k++) for (const z of [1.25, 1.7]) out.push([0, 0.2 + CRATE.h / 2 + k * (CRATE.h + 0.01), z]);
    return out;
  }, []);
  const crates = useInstances(slots, CRATE_PARTS);
  const plans = useMemo(() => loadings.map((l) => l.haul), [loadings]);
  useCarrier(() => plans, path, (s) => {
    const g = ref.current;
    if (!g || !body.current) return;
    g.visible = s.visible;
    if (!s.visible) return;
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.heading;
    const phase = (s.dist / STEP) * Math.PI;
    body.current.position.y = s.moving ? 0.025 * Math.abs(Math.sin(phase)) : 0;
    crates.setCount(Math.min(slots.length, s.carrying));
  });
  return (
    <group ref={ref} visible={false}>
      <group ref={body}>
        <primitive object={object} />
      </group>
      {crates.nodes}
    </group>
  );
});

const FORKLIFT_URL = '/models/forklift.glb';
useGLTF.preload(FORKLIFT_URL);
/** В forklift.glb вилы смотрят к +z, длина машины с вилами ≈ 2 м (центр в 0). */
const FORK_TIP = 1.02;

/** Погрузчик возит поддоны из прицепа на склад сырья; между ходками стоит у стеллажей. */
export const ForkliftUnloader = memo(function ForkliftUnloader({ unloadings, path }: { unloadings: SupplierUnloading[]; path: CarrierPath }) {
  const { scene } = useGLTF(FORKLIFT_URL);
  const object = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);
  const ref = useRef<THREE.Group>(null);
  const pallet = useRef<THREE.Group>(null);
  const plans = useMemo(() => unloadings.map((u) => u.haul), [unloadings]);
  const idle = useMemo(() => along(polyline(path.points), 0), [path]);
  useCarrier(() => plans, path, (s) => {
    const g = ref.current;
    if (!g) return;
    // вне разгрузки погрузчик стоит у стеллажей склада сырья
    if (!s.visible) {
      g.position.set(idle.x, 0, idle.z);
      g.rotation.y = path.faceDest;
      if (pallet.current) pallet.current.visible = false;
      return;
    }
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.heading;
    if (pallet.current) pallet.current.visible = s.carrying > 0;
  });
  return (
    <group ref={ref}>
      <primitive object={object} />
      <group ref={pallet} position={[0, 0.12, FORK_TIP - PALLET.l / 2 + 0.05]} visible={false}>
        <mesh geometry={palletGeo} material={M.wood} position={[0, 0.07, 0]} castShadow />
        <mesh geometry={sackStackGeo} material={M.sack} castShadow />
      </group>
    </group>
  );
});

/** Путь рохли: от места у рампы (вилы в кузове) к стеллажу склада готовой продукции. */
export function loaderPath(config: SiteConfig, dockX: number): CarrierPath {
  const row = config.supply!.layout.goodsRacks;
  const toward = row.x > 0 ? 1 : -1; // стеллаж у правой стены — подходим со стороны цеха
  const dest: FloorPoint = [dockX, frontOf(config) - 1.75];
  const src: FloorPoint = [row.x - toward * (0.5 + 2.2), row.z + 1.6]; // ближний к рампам пролёт: у дальнего разгружает рабочий с упаковки
  const pts: FloorPoint[] = Math.abs(dockX - src[0]) < 0.4 ? [dest, src] : [dest, [dockX, src[1]], src];
  return { points: pts, faceSource: toward > 0 ? Math.PI / 2 : -Math.PI / 2, faceDest: 0 };
}

/** Путь погрузчика: от стеллажей склада сырья (место назначения) к прицепу у рампы приёмки (источник). */
export function forkliftPath(config: SiteConfig, dockX: number): CarrierPath {
  const row = config.supply!.layout.dryRacks;
  const toward = row.x < 0 ? -1 : 1;
  const dest: FloorPoint = [row.x - toward * (0.5 + FORK_TIP + 0.75), row.z + 2.5];
  const src: FloorPoint = [dockX, frontOf(config) + DOCK_GAP - FORK_TIP + 0.05];
  return { points: [dest, [dockX, dest[1]], src], faceSource: 0, faceDest: toward < 0 ? -Math.PI / 2 : Math.PI / 2 };
}

