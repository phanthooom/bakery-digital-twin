import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Html, RoundedBox, useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { Select } from '@react-three/postprocessing';
import * as THREE from 'three';
import { localParts, type MaterialConfig, type SiteConfig } from '@bakery/shared';
import { useSupply } from '../data/store';
import { SupplySim } from '../data/mockSupply';
import { fmtMass, fmtTime } from '../ui/format';
import { WarnIcon } from '../ui/StatusIcon';
import { SUPPLIER_PLATE, SUPPLIER_VEHICLE, supplyView, type SupplyTab, type SupplyView, type VehicleRow } from '../ui/supplyView';
import { GltfModel } from './GltfModel';
import { M } from './materials';
import { MergeStatic } from './MergeStatic';
import { makeStripeTexture } from './textures';
import type { CameraFocus } from './CameraRig';
import { BrandLivery, TRUCK_LENGTH, Truck } from './Truck';
import { VehicleNightLights } from './NightLighting';

/** Склады, упаковка, рампы и машины: приход сырья → склад сырья … склад готовой продукции → отгрузка. */

const BAY = 2.7;
const LEVELS = [0.12, 1.32];
/** Передний край цеха (бортик к двору), z. */
const frontOf = (config: SiteConfig) => config.site.hall.depth / 2;

const rackUpright = new THREE.MeshStandardMaterial({ color: '#2f63b8', roughness: 0.5, metalness: 0.3 });
const rackBeam = new THREE.MeshStandardMaterial({ color: '#ef8a1f', roughness: 0.5, metalness: 0.2 });
const carton = new THREE.MeshStandardMaterial({ color: '#c9a273', roughness: 0.9 });
const cartonTape = new THREE.MeshStandardMaterial({ color: '#b7231f', roughness: 0.7 });
const sackGeo = new THREE.BoxGeometry(0.44, 0.16, 0.32);
const cartonGeo = new THREE.BoxGeometry(0.5, 0.32, 0.4);
const tapeGeo = new THREE.BoxGeometry(0.5, 0.004, 0.06);

type Open = (tab: SupplyTab) => void;

function Tag({ position, title, value, warn, onClick }: { position: [number, number, number]; title: string; value?: string; warn?: 'warning' | 'critical' | null; onClick?: () => void }) {
  return (
    <Html position={position} center zIndexRange={[19, 0]} style={{ pointerEvents: onClick ? 'auto' : 'none' }}>
      <button type="button" className={`scene-tag supply-tag${warn ? ` is-${warn}` : ''}`} onClick={onClick} tabIndex={-1}>
        {warn && <WarnIcon level={warn} />}
        <span className="scene-tag-name">{title}</span>
        {value && <span className="scene-tag-value">{value}</span>}
      </button>
    </Html>
  );
}

function RackFrame({ x0, bays, levels = LEVELS, height = 2.55 }: { x0: number; bays: number; levels?: number[]; height?: number }) {
  return (
    <group>
      {Array.from({ length: bays + 1 }, (_, i) => (
        <group key={i} position={[x0 + i * BAY, 0, 0]}>
          {[-0.5, 0.5].map((z) => (
            <mesh key={z} position={[0, height / 2, z]} material={rackUpright} castShadow>
              <boxGeometry args={[0.08, height, 0.08]} />
            </mesh>
          ))}
        </group>
      ))}
      {levels.slice(1).concat(height - 0.05).map((y) =>
        [-0.5, 0.5].map((z) => (
          <mesh key={`${y}${z}`} position={[x0 + (bays * BAY) / 2, y, z]} material={rackBeam} castShadow>
            <boxGeometry args={[bays * BAY, 0.1, 0.06]} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Поддон с мешками: sacks — сколько мешков из 20 (5 в слое × 4 слоя). */
function Pallet({ position, sacks }: { position: [number, number, number]; sacks: number }) {
  const cells: [number, number, number][] = [];
  for (let i = 0; i < sacks; i++) {
    const layer = Math.floor(i / 5);
    const k = i % 5;
    const rot = layer % 2;
    const x = k < 4 ? (k % 2 ? 0.24 : -0.24) : 0;
    const z = k < 4 ? (k < 2 ? -0.18 : 0.18) : 0;
    cells.push([rot ? z : x, 0.22 + layer * 0.17, rot ? x : z]);
  }
  return (
    <group position={position}>
      <mesh position={[0, 0.07, 0]} material={M.wood} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.14, 0.9]} />
      </mesh>
      {cells.map((p, i) => (
        <mesh key={i} geometry={sackGeo} material={M.sack} position={p} rotation={[0, Math.floor(i / 5) % 2 ? Math.PI / 2 : 0, 0]} castShadow />
      ))}
    </group>
  );
}

/** Сухой склад сырья: стеллажи с поддонами, заполнение — по остатку каждого сырья. */
function DryRacks({ config, view, onOpen, showLabels }: { config: SiteConfig; view: SupplyView; onOpen: Open; showLabels: boolean }) {
  const row = config.supply!.layout.dryRacks;
  const bays = row.bays;
  const x0 = -(bays * BAY) / 2;
  const dry = view.raw.filter((r) => r.material.storage === 'dry');
  // ячейки (по 2 поддона на ярус в пролёте) делим между сырьём по вместимости ~4 минимума
  const slots: { x: number; y: number }[] = [];
  for (let b = 0; b < bays; b++) for (const y of LEVELS) for (const k of [0, 1]) slots.push({ x: x0 + b * BAY + 0.7 + k * 1.3, y });
  const palletKg = (m: MaterialConfig) => (m.packSize ?? 25) * 20;
  const want = dry.map((r) => Math.max(1, Math.ceil((r.material.minStock * 4) / palletKg(r.material))));
  const scale = Math.min(1, slots.length / want.reduce((a, b) => a + b, 0));
  let cursor = 0;
  const groups = dry.map((r, i) => {
    const n = i === dry.length - 1 ? slots.length - cursor : Math.max(1, Math.round(want[i]! * scale));
    const mine = slots.slice(cursor, cursor + n);
    cursor += n;
    let left = r.stock / (r.material.packSize ?? 25);
    const pallets = mine.map((s) => {
      const sacks = Math.max(0, Math.min(20, Math.round(left)));
      left -= sacks;
      return { ...s, sacks };
    });
    return { r, pallets };
  });
  const sackKey = groups.map(({ pallets }) => pallets.map((p) => p.sacks).join(',')).join('|');
  const [hover, setHover] = useState(false);
  const open = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen('raw');
  };
  return (
    <group position={[row.x, 0, row.z]} rotation={[0, row.rotationY ?? 0, 0]} onClick={open} onPointerOver={(e) => (e.stopPropagation(), setHover(true))} onPointerOut={() => setHover(false)}>
      <MergeStatic deps={[sackKey]}>
        <RackFrame x0={x0} bays={bays} />
        {groups.flatMap(({ r, pallets }) => pallets.filter((p) => p.sacks > 0).map((p, i) => <Pallet key={`${r.material.id}${i}`} position={[p.x, p.y, 0]} sacks={p.sacks} />))}
      </MergeStatic>
      {groups.map(({ r, pallets }) => (
        <group key={r.material.id}>
          {pallets.length > 0 && (showLabels || hover) && (
            <Tag
              position={[(pallets[0]!.x + pallets.at(-1)!.x) / 2, 2.85, 0.6]}
              title={r.material.name.split(' ')[0]!}
              value={fmtMass(r.stock)}
              warn={r.level === 'ok' ? null : r.level === 'critical' ? 'critical' : 'warning'}
              onClick={() => onOpen('raw')}
            />
          )}
        </group>
      ))}
      {!(showLabels || hover) && (
        <Tag
          position={[0, 2.85, 0.6]}
          title="Склад сырья"
          value={(() => {
            const bad = view.raw.filter((r) => r.level !== 'ok');
            return bad.length ? `${bad.map((r) => r.material.name.split(' ')[0]).join(', ')} — мало` : `${view.raw.length} позиций в норме`;
          })()}
          warn={view.raw.some((r) => r.level === 'critical') ? 'critical' : view.raw.some((r) => r.level === 'low') ? 'warning' : null}
          onClick={() => onOpen('raw')}
        />
      )}
      {hover && (
        <mesh position={[0, 1.3, 0]}>
          <boxGeometry args={[bays * BAY + 0.2, 2.7, 1.2]} />
          <meshBasicMaterial color="#2f7bff" transparent opacity={0.06} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Склад готовой продукции: стеллажи с коробками, заполнение — по упакованному остатку. */
function GoodsRacks({ config, view, onOpen }: { config: SiteConfig; view: SupplyView; onOpen: Open }) {
  const row = config.supply!.layout.goodsRacks;
  const bays = row.bays;
  const x0 = -(bays * BAY) / 2;
  const levels = [0.12, 0.92, 1.72];
  const fresh = view.goods.filter((g) => !g.product.frozen);
  const packed = fresh.reduce((a, g) => a + g.packed, 0);
  const frozen = view.goods.filter((g) => g.product.frozen).reduce((a, g) => a + g.packed, 0);
  const expiring = view.goods.reduce((a, g) => a + g.expiringSoon, 0);
  const expired = view.goods.reduce((a, g) => a + g.expired, 0);
  // коробка ≈ 10 кг; ячейка — 4×2 коробки
  const cells: [number, number, number][] = [];
  for (let b = 0; b < bays; b++) for (const y of levels) for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) cells.push([x0 + b * BAY + 0.42 + i * 0.62, y + 0.18, -0.22 + k * 0.44]);
  const boxes = Math.min(cells.length, Math.round(packed / 10));
  return (
    <group position={[row.x, 0, row.z]} rotation={[0, row.rotationY ?? 0, 0]} onClick={(e) => (e.stopPropagation(), onOpen('goods'))}>
      <MergeStatic deps={[boxes]}>
        <RackFrame x0={x0} bays={bays} levels={levels} height={2.3} />
        {cells.slice(0, boxes).map((p, i) => (
          <group key={i} position={p}>
            <mesh geometry={cartonGeo} material={carton} castShadow />
            <mesh position={[0, 0.161, 0]} geometry={tapeGeo} material={cartonTape} />
          </group>
        ))}
      </MergeStatic>
      <Tag
        position={[0, 2.75, 0.6]}
        title="Склад готовой продукции"
        value={`${fmtMass(packed)} · заморозка ${fmtMass(frozen)}`}
        warn={expired > 0 ? 'critical' : expiring > 0 ? 'warning' : null}
        onClick={() => onOpen('goods')}
      />
    </group>
  );
}

/** Тележки с продукцией (NVIDIA SimReady trolley_catering_a01 + багеты и круассаны), ждущие упаковки. */
function PackingQueue({ config, view, onOpen }: { config: SiteConfig; view: SupplyView; onOpen: Open }) {
  const { x, z } = config.supply!.layout.packingQueue;
  const waiting = view.goods.reduce((a, g) => a + g.waiting, 0);
  const carts = Math.max(2, Math.min(3, Math.ceil(waiting / 80)));
  return (
    <group onClick={(e) => (e.stopPropagation(), onOpen('goods'))}>
      {Array.from({ length: carts }, (_, i) => (
        <group key={i} position={[x - 0.5 + i * 0.9, 0, z]}>
          <GltfModel url="/models/bakery-trolley.glb" fallback={null} />
        </group>
      ))}
      {waiting > 0 && <Tag position={[x + 0.35, 2.0, z]} title="Ждёт упаковки" value={fmtMass(waiting)} onClick={() => onOpen('goods')} />}
    </group>
  );
}

function DockPlate({ x, front }: { x: number; front: number }) {
  const stripes = useMemo(() => {
    const t = makeStripeTexture();
    t.repeat.set(4, 1);
    return t;
  }, []);
  return (
    <group position={[x, 0, front]}>
      <mesh position={[0, 0.31, 0.12]}>
        <boxGeometry args={[2.3, 0.03, 0.3]} />
        <meshStandardMaterial map={stripes} roughness={0.8} />
      </mesh>
      {[-1.25, 1.25].map((dx) => (
        <mesh key={dx} position={[dx, 0.25, 0.32]} material={M.black}>
          <boxGeometry args={[0.18, 0.35, 0.14]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Тягач с полуприцепом поставщика — Tesla Semi (GLB, «Tesla semi truck» by iZnoGouD, CC BY 4.0).
 * В файле: метры, зад прицепа в z = 0 по центру, кабина к +z, один меш с цветами вершин.
 * Пока грузится или если не загрузился — процедурная машина поставщика.
 */
const SEMI_URL = '/models/tesla-semi.glb';
const SEMI_HEIGHT = 4.06;
const SEMI_LENGTH = 15.3;
/** Борта прицепа в tesla-semi.glb: плоскости x = +1,278 и −1,272, y 1,30…3,97, z 0,17…11,26. */
const TRAILER = { right: 1.278 + 0.006, left: 1.272 + 0.006, y: 2.635, z: 5.715, length: 11.0, height: 2.6 };
useGLTF.preload(SEMI_URL);

const dockX = (docks: { x: number }[], i: number) => docks[i]?.x ?? docks[docks.length - 1]!.x + i * 2.8;

/** Куда подлететь камере к машине: фургон — спереди сбоку, длинный тягач с прицепом — сбоку со стороны цеха. */
export function vehicleFocus(config: SiteConfig, id: string): CameraFocus | null {
  const supply = config.supply;
  if (!supply) return null;
  const z0 = frontOf(config) + 0.5;
  if (id === SUPPLIER_VEHICLE) {
    const x = supply.layout.receivingDock.x;
    return { key: `vehicle:${id}`, x, z: z0 + SEMI_LENGTH / 2, lookY: 2, dist: 26, dir: [x < 0 ? 1 : -1, 0.55, 0.45] };
  }
  const i = supply.vehicles.findIndex((v) => v.id === id);
  if (i < 0) return null;
  return { key: `vehicle:${id}`, x: dockX(supply.layout.shippingDocks, i), z: z0 + TRUCK_LENGTH.semi / 2, lookY: 1.6, dist: 14 };
}

interface VehicleSelect {
  selected: string | null;
  hovered: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

/** Машина задом к рампе (зад у переднего края цеха, кабина — от цеха); наведение и выбор — контуром, как у станков. */
function DockedVehicle({ id, x, front, sel, children }: { id: string; x: number; front: number; sel: VehicleSelect; children: ReactNode }) {
  return (
    <Select enabled={sel.selected === id || sel.hovered === id}>
      <group
        position={[x, 0, front + 0.5]}
        onPointerOver={(e) => (e.stopPropagation(), sel.onHover(id))}
        onPointerOut={() => sel.onHover(null)}
        onClick={(e) => (e.stopPropagation(), sel.onSelect(id))}
      >
        {children}
      </group>
    </Select>
  );
}

const VEHICLE_LABEL: Record<VehicleRow['status'], string> = { at_dock: 'у рампы', loading: 'погрузка', en_route: 'в рейсе' };

function ShippingDocks({ config, view, onOpen, showLabels, sel, isNight }: { config: SiteConfig; view: SupplyView; onOpen: Open; showLabels: boolean; sel: VehicleSelect; isNight?: boolean }) {
  const docks = config.supply!.layout.shippingDocks;
  const xs = docks.map((d) => d.x);
  const FRONT_Z = frontOf(config);
  const color = config.site.brand?.color ?? '#B71F3E';
  const tz = config.site.timezone;
  const mine = (id: string | null) => id !== null && view.vehicles.some((v) => v.vehicle.id === id);
  return (
    <group>
      {view.vehicles.map((v, i) => {
        const id = v.vehicle.id;
        const x = dockX(docks, i);
        const present = v.status !== 'en_route';
        const active = sel.hovered === id || sel.selected === id;
        const when = v.status === 'en_route' ? `вернётся ${fmtTime(v.trip!.returnAt, tz)}` : v.status === 'loading' ? `выезд ${fmtTime(v.trip!.departAt, tz)}` : v.next ? `следующий рейс ${fmtTime(v.next.departAt, tz)}` : 'рейсов нет';
        return (
          <group key={id}>
            <DockPlate x={x} front={FRONT_Z} />
            {present ? (
              <DockedVehicle id={id} x={x} front={FRONT_Z} sel={sel}>
                <Truck cab="semi" brand={config.site.brand?.name ?? 'Bakery'} tagline={config.site.brand?.tagline} color={color} plate={v.vehicle.plate} loading={v.status === 'loading'} />
                {isNight && <VehicleNightLights frontZ={TRUCK_LENGTH.semi} width={2.1} headlightY={0.95} roofY={3.08} />}
              </DockedVehicle>
            ) : (
              // машина в рейсе — пустое место у рампы, по нему тоже можно выбрать машину
              <mesh
                position={[x, 0.02, FRONT_Z + 3]}
                rotation={[-Math.PI / 2, 0, 0]}
                onPointerOver={(e) => (e.stopPropagation(), sel.onHover(id))}
                onPointerOut={() => sel.onHover(null)}
                onClick={(e) => (e.stopPropagation(), sel.onSelect(id))}
              >
                <planeGeometry args={[2.3, 5]} />
                <meshBasicMaterial color="#2f7bff" transparent opacity={active ? 0.14 : 0.04} depthWrite={false} />
              </mesh>
            )}
            {(showLabels || active) && (
              <Tag position={[x, present ? 3.7 : 0.8, FRONT_Z + (present ? 2.2 : 3)]} title={`${v.vehicle.name} · ${VEHICLE_LABEL[v.status]}`} value={when} onClick={() => sel.onSelect(id)} />
            )}
          </group>
        );
      })}
      {!showLabels && !mine(sel.hovered) && !mine(sel.selected) && (
        <Tag
          position={[(xs[0]! + xs[xs.length - 1]!) / 2, 3.9, FRONT_Z + 2.2]}
          title="Отгрузка"
          value={`у рампы ${view.vehicles.filter((v) => v.status === 'at_dock').length} · погрузка ${view.vehicles.filter((v) => v.status === 'loading').length} · в рейсе ${view.vehicles.filter((v) => v.status === 'en_route').length}`}
          onClick={() => onOpen('trips')}
        />
      )}
    </group>
  );
}

function ReceivingDock({ config, view, now, sel, isNight }: { config: SiteConfig; view: SupplyView; now: number; sel: VehicleSelect; isNight?: boolean }) {
  const x = config.supply!.layout.receivingDock.x;
  const FRONT_Z = frontOf(config);
  const tz = config.site.timezone;
  const { atDock, upcoming } = view.receiving;
  const next = upcoming[0];
  const today = localParts(now, tz).date;
  return (
    <group>
      <DockPlate x={x} front={FRONT_Z} />
      {/* весы на полу у ворот приёмки */}
      <mesh position={[x, 0.03, FRONT_Z - 1.4]} material={M.steelDark} receiveShadow>
        <boxGeometry args={[1.4, 0.05, 1.4]} />
      </mesh>
      {/* пока что тягач стоит у рампы всегда; разгрузка — по окну поставки (atDock) */}
      <DockedVehicle id={SUPPLIER_VEHICLE} x={x} front={FRONT_Z} sel={sel}>
        <GltfModel url={SEMI_URL} keepOrigin fallback={<Truck color="#7c8a7b" plate={SUPPLIER_PLATE} />}>
          <BrandLivery brand={config.site.brand?.name ?? 'Bakery'} tagline={config.site.brand?.tagline ?? ''} color={config.site.brand?.color ?? '#B71F3E'} {...TRAILER} px={480} center />
        </GltfModel>
        {isNight && <VehicleNightLights frontZ={SEMI_LENGTH} width={2.45} headlightY={1.08} roofY={3.96} isSemiTrailer />}
      </DockedVehicle>
      <Tag
        position={[x, SEMI_HEIGHT + 0.6, FRONT_Z + 2.2]}
        title={atDock ? `Приёмка: ${atDock.material.name.split(' ')[0]}` : 'Приёмка сырья'}
        value={atDock ? 'разгрузка' : next ? `${next.material.name.split(' ')[0]} · ${localParts(next.at, tz).date === today ? '' : 'завтра '}${fmtTime(next.at, tz)}` : 'поставок нет'}
        onClick={() => sel.onSelect(SUPPLIER_VEHICLE)}
      />
    </group>
  );
}

export interface SupplySceneProps {
  config: SiteConfig;
  onOpen: Open;
  showLabels: boolean;
  /** Выбранная машина (id фургона или SUPPLIER_VEHICLE). */
  selectedVehicle: string | null;
  onSelectVehicle: (id: string) => void;
  /** Ночной режим промышленного освещения */
  isNight?: boolean;
}

export const SupplyScene = memo(function SupplyScene({ config, onOpen, showLabels, selectedVehicle, onSelectVehicle, isNight = false }: SupplySceneProps) {
  const snap = useSupply();
  const view = useMemo(() => (snap ? supplyView(snap, config, SupplySim.localMidnight(snap.now, config.site.timezone)) : null), [snap, config]);
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);
  if (!config.supply || !view || !snap) return null;
  const sel: VehicleSelect = { selected: selectedVehicle, hovered, onHover: setHovered, onSelect: onSelectVehicle };
  return (
    <group>
      <DryRacks config={config} view={view} onOpen={onOpen} showLabels={showLabels} />
      <GoodsRacks config={config} view={view} onOpen={onOpen} />
      <PackingQueue config={config} view={view} onOpen={onOpen} />
      <ReceivingDock config={config} view={view} now={snap.now} sel={sel} isNight={isNight} />
      <ShippingDocks config={config} view={view} onOpen={onOpen} showLabels={showLabels} sel={sel} isNight={isNight} />
      {/* Вилочные погрузчики (NVIDIA SimReady vehicle_forklift_orange_a01), паллета приёмки и пожарные посты */}
      <group position={[-23.2, 0, 13.5]} rotation={[0, 0.35, 0]}>
        <GltfModel url="/models/forklift.glb" fallback={null} />
      </group>
      <group position={[23.2, 0, 13.5]} rotation={[0, -0.35, 0]}>
        <GltfModel url="/models/forklift.glb" fallback={null} />
      </group>
      <group position={[-17.2, 0, 15.6]}>
        <GltfModel url="/models/pallet-loaded.glb" fallback={null} />
      </group>
      <group position={[-15.2, 0, 16.5]}>
        <GltfModel url="/models/fire-stand.glb" fallback={null} />
      </group>
      <group position={[15.2, 0, 16.5]}>
        <GltfModel url="/models/fire-stand.glb" fallback={null} />
      </group>
    </group>
  );
});
