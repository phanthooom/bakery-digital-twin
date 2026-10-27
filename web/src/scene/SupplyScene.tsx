import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { localParts, type DockPhase, type MaterialConfig, type SiteConfig } from '@bakery/shared';
import { useSupply } from '../data/store';
import { useDockPlan, type DockPlan } from '../data/useDockPlan';
import { startYardDemo } from '../data/yardDemo';
import { SupplySim } from '../data/mockSupply';
import { fmtMass, fmtTime } from '../ui/format';
import { WarnIcon } from '../ui/StatusIcon';
import { SUPPLIER_PLATE, SUPPLIER_VEHICLE, supplyView, type SupplyTab, type SupplyView, type VehicleRow } from '../ui/supplyView';
import { GltfModel } from './GltfModel';
import { M } from './materials';
import { MergeStatic } from './MergeStatic';
import { makeStripeTexture } from './textures';
import type { CameraFocus } from './CameraRig';
import { ForkliftUnloader, MovingSupplier, MovingVan, SEMI_HEIGHT, SEMI_LENGTH, TrolleyLoader, forkliftPath, loaderPath, supplierLane, vanLane, type VehicleSelect } from './DockTraffic';

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
  // фургон — изнутри цеха через ворота рампы: видно открытые двери, лотки в кузове и рохлю у рампы
  return { key: `vehicle:${id}`, x: dockX(supply.layout.shippingDocks, i), z: z0 + 2, lookY: 1.5, dist: 12, dir: [-0.12, 0.38, -0.92] };
}

/**
 * Нижний край экрана по центру, над безопасной зоной (полоска «домой» в iPhone, панели Telegram Mini App)
 * и над панелью сквозного цикла «Производство», если она открыта. Раскладку читаем не чаще раза в 0,5 с.
 */
const pinCache = { at: 0, bottom: 0 };
function pinBottom(_el: THREE.Object3D, _camera: THREE.Camera, size: { width: number; height: number }): [number, number] {
  const now = performance.now();
  if (now - pinCache.at > 500) {
    pinCache.at = now;
    const safe = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--twa-safe-bottom')) || 0;
    const panel = document.querySelector<HTMLElement>('.production-control');
    const canvas = document.querySelector<HTMLElement>('.scene canvas');
    const panelGap = panel && canvas ? canvas.getBoundingClientRect().bottom - panel.getBoundingClientRect().top + 8 : 0;
    pinCache.bottom = Math.max(safe, panelGap);
  }
  return [size.width / 2, size.height - pinCache.bottom - 34];
}

/** Подпись фургона по фазе визита к рампе. */
const VAN_PHASE_LABEL: Record<DockPhase, string> = {
  away: 'в рейсе',
  arriving: 'въезжает',
  reversing: 'задний ход к рампе',
  parked: 'у рампы',
  doorsOpening: 'погрузка',
  working: 'погрузка',
  doorsClosing: 'погрузка',
  departing: 'выезжает',
};

function ShippingDocks({ config, view, plan, onOpen, showLabels, sel, isNight }: { config: SiteConfig; view: SupplyView; plan: DockPlan; onOpen: Open; showLabels: boolean; sel: VehicleSelect; isNight?: boolean }) {
  const docks = config.supply!.layout.shippingDocks;
  const xs = docks.map((d) => d.x);
  const FRONT_Z = frontOf(config);
  const color = config.site.brand?.color ?? '#B71F3E';
  const tz = config.site.timezone;
  const mine = (id: string | null) => id !== null && view.vehicles.some((v) => v.vehicle.id === id);
  const lanes = useMemo(() => docks.map((_, i) => vanLane(config, dockX(docks, i))), [config, docks]);
  const demoRef = useRef(() => {});
  demoRef.current = () => {
    startYardDemo(view.vehicles.map((v) => v.vehicle.id));
    sel.onSelect(view.vehicles[0]!.vehicle.id);
  };
  const paths = useMemo(() => docks.map((_, i) => loaderPath(config, dockX(docks, i))), [config, docks]);
  return (
    <group>
      {view.vehicles.map((v, i) => {
        const id = v.vehicle.id;
        const x = dockX(docks, i);
        const active = sel.hovered === id || sel.selected === id;
        const when = v.status === 'en_route' ? `вернётся ${fmtTime(v.trip!.returnAt, tz)}` : v.status === 'loading' ? `выезд ${fmtTime(v.trip!.departAt, tz)}` : v.next ? `следующий рейс ${fmtTime(v.next.departAt, tz)}` : 'рейсов нет';
        const p = plan.vans.get(id);
        return (
          <group key={id}>
            <DockPlate x={x} front={FRONT_Z} />
            {p && (
              <>
                <MovingVan
                  id={id}
                  plate={v.vehicle.plate}
                  lane={lanes[i]!}
                  visits={p.visits}
                  loadings={p.loadings}
                  brand={config.site.brand?.name ?? 'Bakery'}
                  tagline={config.site.brand?.tagline}
                  color={color}
                  sel={sel}
                  isNight={!!isNight}
                  label={(phase) =>
                    (showLabels || active) && (
                      // у выбранной машины — только название и фаза: подробности в карточке, а на телефоне длинная подпись не влезает
                      <Tag position={[x, phase === 'away' ? 0.8 : 3.7, FRONT_Z + (phase === 'away' ? 3 : 2.2)]} title={`${v.vehicle.name} · ${VAN_PHASE_LABEL[phase]}`} value={sel.selected === id ? undefined : when} onClick={() => sel.onSelect(id)} />
                    )
                  }
                />
                <TrolleyLoader loadings={p.loadings} path={paths[i]!} />
              </>
            )}
          </group>
        );
      })}
      {/* демо: все фазы двора за ~6 минут, не дожидаясь расписания. Кнопка закреплена внизу по центру экрана (на телефоне
          двор не всегда в кадре), над безопасной зоной Telegram; при выбранной машине прячется, чтобы не заслонять её */}
      {!mine(sel.selected) && (
      <Html center zIndexRange={[19, 0]} style={{ pointerEvents: 'auto' }} calculatePosition={pinBottom}>
        <button
          type="button"
          className="scene-tag supply-tag"
          style={{ background: config.site.brand?.color ?? '#B71F3E', borderColor: 'transparent', cursor: 'pointer' }}
          // обработчики — нативные: кнопка лежит поверх холста, и щелчок не должен дойти до сцены
          // (иначе «щелчок мимо станков» сразу снимает выбор фургона)
          ref={(el) => {
            if (!el || el.dataset.bound) return;
            el.dataset.bound = '1';
            const stop = (e: Event) => e.stopPropagation();
            el.addEventListener('pointerdown', stop);
            el.addEventListener('pointerup', stop);
            el.addEventListener('click', (e) => {
              e.stopPropagation();
              demoRef.current();
            });
          }}
          title="Фургоны въезжают, грузятся и уезжают, поставщик разгружается — сейчас, а не по расписанию (на склад не влияет)"
        >
          <span className="scene-tag-name" style={{ color: '#fff' }}>
            ▶ Показать двор
          </span>
        </button>
      </Html>
      )}
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

const SUPPLIER_PHASE_LABEL: Partial<Record<DockPhase, string>> = { arriving: 'въезжает', reversing: 'задний ход к рампе', parked: 'у рампы', doorsOpening: 'открывает двери', doorsClosing: 'закрывает двери', departing: 'уезжает' };

function ReceivingDock({ config, view, plan, now, sel, isNight }: { config: SiteConfig; view: SupplyView; plan: DockPlan; now: number; sel: VehicleSelect; isNight?: boolean }) {
  const x = config.supply!.layout.receivingDock.x;
  const FRONT_Z = frontOf(config);
  const tz = config.site.timezone;
  const { atDock, upcoming } = view.receiving;
  const next = upcoming[0];
  const today = localParts(now, tz).date;
  const lane = useMemo(() => supplierLane(config, x), [config, x]);
  const path = useMemo(() => forkliftPath(config, x), [config, x]);
  const nextText = next ? `${next.material.name.split(' ')[0]} · ${localParts(next.at, tz).date === today ? '' : 'завтра '}${fmtTime(next.at, tz)}` : 'поставок нет';
  return (
    <group>
      <DockPlate x={x} front={FRONT_Z} />
      {/* весы на полу у ворот приёмки */}
      <mesh position={[x, 0.03, FRONT_Z - 1.4]} material={M.steelDark} receiveShadow>
        <boxGeometry args={[1.4, 0.05, 1.4]} />
      </mesh>
      <MovingSupplier
        id={SUPPLIER_VEHICLE}
        lane={lane}
        unloadings={plan.supplier}
        brand={config.site.brand?.name ?? 'Bakery'}
        tagline={config.site.brand?.tagline ?? ''}
        color={config.site.brand?.color ?? '#B71F3E'}
        sel={sel}
        isNight={!!isNight}
        label={(phase) => (
          <Tag
            position={[x, phase === 'away' ? 1.2 : SEMI_HEIGHT + 0.6, FRONT_Z + 2.2]}
            title={phase === 'away' ? 'Приёмка сырья' : phase === 'working' && atDock ? `Приёмка: ${atDock.material.name.split(' ')[0]}` : `Поставщик${SUPPLIER_PHASE_LABEL[phase] ? ` · ${SUPPLIER_PHASE_LABEL[phase]}` : ''}`}
            value={phase === 'working' ? 'разгрузка' : phase === 'away' ? nextText : atDock ? atDock.material.name.split(' ')[0] : nextText}
            onClick={() => sel.onSelect(SUPPLIER_VEHICLE)}
          />
        )}
      />
      <ForkliftUnloader unloadings={plan.supplier} path={path} />
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
  const plan = useDockPlan();
  const view = useMemo(() => (snap ? supplyView(snap, config, SupplySim.localMidnight(snap.now, config.site.timezone)) : null), [snap, config]);
  const [hovered, setHovered] = useState<string | null>(null);
  // ?yard=demo — сразу показать двор (для презентаций)
  useEffect(() => {
    if (config.supply && new URLSearchParams(window.location.search).get('yard') === 'demo') startYardDemo(config.supply.vehicles.map((v) => v.id));
  }, [config]);
  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);
  if (!config.supply || !view || !snap || !plan) return null;
  const sel: VehicleSelect = { selected: selectedVehicle, hovered, onHover: setHovered, onSelect: onSelectVehicle };
  return (
    <group>
      <DryRacks config={config} view={view} onOpen={onOpen} showLabels={showLabels} />
      <GoodsRacks config={config} view={view} onOpen={onOpen} />
      <PackingQueue config={config} view={view} onOpen={onOpen} />
      <ReceivingDock config={config} view={view} plan={plan} now={snap.now} sel={sel} isNight={isNight} />
      <ShippingDocks config={config} view={view} plan={plan} onOpen={onOpen} showLabels={showLabels} sel={sel} isNight={isNight} />
      {/* Вилочные погрузчики (NVIDIA SimReady vehicle_forklift_orange_a01): у приёмки — ForkliftUnloader (возит поддоны
          по расписанию разгрузки); у отгрузки — стоит в углу, чтобы не мешать рохле. Паллета приёмки и пожарные посты. */}
      <group position={[25.6, 0, 16.6]} rotation={[0, -Math.PI / 2, 0]}>
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
