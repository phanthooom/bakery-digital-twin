import { memo, useMemo, useState } from 'react';
import { Html, RoundedBox } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { localParts, type MaterialConfig, type SiteConfig } from '@bakery/shared';
import { useSupply } from '../data/store';
import { SupplySim } from '../data/mockSupply';
import { fmtMass, fmtTime } from '../ui/format';
import { WarnIcon } from '../ui/StatusIcon';
import { supplyView, type SupplyTab, type SupplyView, type VehicleRow } from '../ui/supplyView';
import { M } from './materials';
import { makeStripeTexture } from './textures';
import { Truck, type TruckProps } from './Truck';

/** Склады, упаковка, рампы и машины: приход сырья → склад сырья … склад готовой продукции → отгрузка. */

const RACK_Z = -4.3; // стеллажи у задней стены
const BAY = 2.7;
const LEVELS = [0.12, 1.32];
const FRONT_Z = 5.0; // передний край цеха (бортик)

const rackUpright = new THREE.MeshStandardMaterial({ color: '#2f63b8', roughness: 0.5, metalness: 0.3 });
const rackBeam = new THREE.MeshStandardMaterial({ color: '#ef8a1f', roughness: 0.5, metalness: 0.2 });
const carton = new THREE.MeshStandardMaterial({ color: '#c9a273', roughness: 0.9 });
const cartonTape = new THREE.MeshStandardMaterial({ color: '#b7231f', roughness: 0.7 });
const sackGeo = new THREE.BoxGeometry(0.44, 0.16, 0.32);
const cartonGeo = new THREE.BoxGeometry(0.5, 0.32, 0.4);

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
        <group key={i} position={[x0 + i * BAY, 0, RACK_Z]}>
          {[-0.5, 0.5].map((z) => (
            <mesh key={z} position={[0, height / 2, z]} material={rackUpright} castShadow>
              <boxGeometry args={[0.08, height, 0.08]} />
            </mesh>
          ))}
        </group>
      ))}
      {levels.slice(1).concat(height - 0.05).map((y) =>
        [-0.5, 0.5].map((z) => (
          <mesh key={`${y}${z}`} position={[x0 + (bays * BAY) / 2, y, RACK_Z + z]} material={rackBeam} castShadow>
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
    cells.push([rot ? z : x, 0.22 + layer * 0.17 + (k === 4 ? 0.0 : 0), rot ? x : z]);
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
  const { xFrom, xTo } = config.supply!.layout.dryRacks;
  const bays = Math.max(1, Math.floor((xTo - xFrom) / BAY));
  const x0 = (xFrom + xTo) / 2 - (bays * BAY) / 2;
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
  const [hover, setHover] = useState(false);
  const open = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen('raw');
  };
  return (
    <group onClick={open} onPointerOver={(e) => (e.stopPropagation(), setHover(true))} onPointerOut={() => setHover(false)}>
      <RackFrame x0={x0} bays={bays} />
      {groups.map(({ r, pallets }) => (
        <group key={r.material.id}>
          {pallets.filter((p) => p.sacks > 0).map((p, i) => (
            <Pallet key={i} position={[p.x, p.y, RACK_Z]} sacks={p.sacks} />
          ))}
          {pallets.length > 0 && (showLabels || hover) && (
            <Tag
              position={[(pallets[0]!.x + pallets.at(-1)!.x) / 2, 2.85, RACK_Z + 0.6]}
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
          position={[x0 + (bays * BAY) / 2, 2.85, RACK_Z + 0.6]}
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
        <mesh position={[x0 + (bays * BAY) / 2, 1.3, RACK_Z]}>
          <boxGeometry args={[bays * BAY + 0.2, 2.7, 1.2]} />
          <meshBasicMaterial color="#2f7bff" transparent opacity={0.06} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Склад готовой продукции: стеллажи с коробками, заполнение — по упакованному остатку. */
function GoodsRacks({ config, view, onOpen }: { config: SiteConfig; view: SupplyView; onOpen: Open }) {
  const { xFrom, xTo } = config.supply!.layout.goodsRacks;
  const bays = Math.max(1, Math.floor((xTo - xFrom) / BAY));
  const x0 = (xFrom + xTo) / 2 - (bays * BAY) / 2;
  const levels = [0.12, 0.92, 1.72];
  const fresh = view.goods.filter((g) => !g.product.frozen);
  const packed = fresh.reduce((a, g) => a + g.packed, 0);
  const frozen = view.goods.filter((g) => g.product.frozen).reduce((a, g) => a + g.packed, 0);
  const expiring = view.goods.reduce((a, g) => a + g.expiringSoon, 0);
  const expired = view.goods.reduce((a, g) => a + g.expired, 0);
  // коробка ≈ 10 кг; ячейка — 4×2 коробки
  const cells: [number, number, number][] = [];
  for (let b = 0; b < bays; b++) for (const y of levels) for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) cells.push([x0 + b * BAY + 0.42 + i * 0.62, y + 0.18, RACK_Z - 0.22 + k * 0.44]);
  const boxes = Math.min(cells.length, Math.round(packed / 10));
  return (
    <group onClick={(e) => (e.stopPropagation(), onOpen('goods'))}>
      <RackFrame x0={x0} bays={bays} levels={levels} height={2.3} />
      {cells.slice(0, boxes).map((p, i) => (
        <group key={i} position={p}>
          <mesh geometry={cartonGeo} material={carton} castShadow />
          <mesh position={[0, 0.161, 0]} material={cartonTape}>
            <boxGeometry args={[0.5, 0.004, 0.06]} />
          </mesh>
        </group>
      ))}
      <Tag
        position={[x0 + (bays * BAY) / 2, 2.75, RACK_Z + 0.6]}
        title="Склад готовой продукции"
        value={`${fmtMass(packed)} · заморозка ${fmtMass(frozen)}`}
        warn={expired > 0 ? 'critical' : expiring > 0 ? 'warning' : null}
        onClick={() => onOpen('goods')}
      />
    </group>
  );
}

/** Тележки с продукцией, которая ждёт упаковки. */
function PackingQueue({ config, view, onOpen }: { config: SiteConfig; view: SupplyView; onOpen: Open }) {
  const x = config.supply!.layout.packingQueueX;
  const waiting = view.goods.reduce((a, g) => a + g.waiting, 0);
  const carts = Math.min(3, Math.ceil(waiting / 80));
  return (
    <group onClick={(e) => (e.stopPropagation(), onOpen('goods'))}>
      {Array.from({ length: carts }, (_, i) => (
        <group key={i} position={[x - 0.4 + i * 0.75, 0, -1.2]}>
          {[-0.25, 0.25].map((dx) =>
            [-0.3, 0.3].map((dz) => (
              <mesh key={`${dx}${dz}`} position={[dx, 0.85, dz]} material={M.steel} castShadow>
                <boxGeometry args={[0.03, 1.6, 0.03]} />
              </mesh>
            )),
          )}
          {[0.25, 0.55, 0.85, 1.15, 1.45].map((y) => (
            <group key={y} position={[0, y, 0]}>
              <mesh material={M.steelLight}>
                <boxGeometry args={[0.52, 0.02, 0.62]} />
              </mesh>
              {[-0.15, 0.0, 0.15].map((dz) => (
                <mesh key={dz} position={[0, 0.04, dz * 1.4]} material={M.dough} scale={[1, 0.55, 0.7]}>
                  <sphereGeometry args={[0.09, 10, 8]} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
      {waiting > 0 && <Tag position={[x + 0.35, 2.0, -1.2]} title="Ждёт упаковки" value={fmtMass(waiting)} onClick={() => onOpen('goods')} />}
    </group>
  );
}

function DockPlate({ x }: { x: number }) {
  const stripes = useMemo(() => {
    const t = makeStripeTexture();
    t.repeat.set(4, 1);
    return t;
  }, []);
  return (
    <group position={[x, 0, FRONT_Z]}>
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

/** Машина задом к рампе: зад кузова у переднего края цеха, кабина — от цеха. */
function DockedTruck({ x, onClick, ...props }: { x: number; onClick?: () => void } & TruckProps) {
  return (
    <group position={[x, 0, FRONT_Z + 0.5]} onClick={(e) => (e.stopPropagation(), onClick?.())}>
      <Truck {...props} />
    </group>
  );
}

const VEHICLE_LABEL: Record<VehicleRow['status'], string> = { at_dock: 'у рампы', loading: 'погрузка', en_route: 'в рейсе' };

function ShippingDocks({ config, view, onOpen, showLabels }: { config: SiteConfig; view: SupplyView; onOpen: Open; showLabels: boolean }) {
  const xs = config.supply!.layout.shippingDockXs;
  const color = config.site.brand?.color ?? '#B71F3E';
  const tz = config.site.timezone;
  const [hover, setHover] = useState<string | null>(null);
  return (
    <group>
      {view.vehicles.map((v, i) => {
        const x = xs[i] ?? xs[xs.length - 1]! + i * 2.8;
        const present = v.status !== 'en_route';
        const when = v.status === 'en_route' ? `вернётся ${fmtTime(v.trip!.returnAt, tz)}` : v.status === 'loading' ? `выезд ${fmtTime(v.trip!.departAt, tz)}` : v.next ? `следующий рейс ${fmtTime(v.next.departAt, tz)}` : 'рейсов нет';
        return (
          <group key={v.vehicle.id} onPointerOver={(e) => (e.stopPropagation(), setHover(v.vehicle.id))} onPointerOut={() => setHover(null)}>
            <DockPlate x={x} />
            {present && <DockedTruck x={x} brand={config.site.brand?.name ?? 'Bakery'} tagline={config.site.brand?.tagline} color={color} plate={v.vehicle.plate} highlighted={hover === v.vehicle.id} onClick={() => onOpen('trips')} />}
            {!present && (
              <mesh position={[x, 0.02, FRONT_Z + 3]} rotation={[-Math.PI / 2, 0, 0]} onClick={(e) => (e.stopPropagation(), onOpen('trips'))}>
                <planeGeometry args={[2.3, 5]} />
                <meshBasicMaterial color="#2f7bff" transparent opacity={hover === v.vehicle.id ? 0.12 : 0.04} depthWrite={false} />
              </mesh>
            )}
            {(showLabels || hover === v.vehicle.id) && (
              <Tag position={[x, present ? 3.35 : 0.8, FRONT_Z + (present ? 2.2 : 3)]} title={`${v.vehicle.name} · ${VEHICLE_LABEL[v.status]}`} value={when} onClick={() => onOpen('trips')} />
            )}
          </group>
        );
      })}
      {!showLabels && !hover && (
        <Tag
          position={[(xs[0]! + xs[xs.length - 1]!) / 2, 3.6, FRONT_Z + 2.2]}
          title="Отгрузка"
          value={`у рампы ${view.vehicles.filter((v) => v.status === 'at_dock').length} · погрузка ${view.vehicles.filter((v) => v.status === 'loading').length} · в рейсе ${view.vehicles.filter((v) => v.status === 'en_route').length}`}
          onClick={() => onOpen('trips')}
        />
      )}
    </group>
  );
}

function ReceivingDock({ config, view, now, onOpen }: { config: SiteConfig; view: SupplyView; now: number; onOpen: Open }) {
  const x = config.supply!.layout.receivingDockX;
  const tz = config.site.timezone;
  // машина поставщика стоит у рампы за 15 мин до и 45 мин после поставки
  const deliveries = view.raw.flatMap((r) => [r.lastDelivery, r.nextDelivery].filter((t): t is number => t !== null).map((t) => ({ t, name: r.material.name })));
  const atDock = deliveries.find((d) => d.t > now - 45 * 60_000 && d.t < now + 15 * 60_000);
  const next = deliveries.filter((d) => d.t > now).sort((a, b) => a.t - b.t)[0];
  const today = localParts(now, tz).date;
  return (
    <group>
      <DockPlate x={x} />
      {/* весы на полу у ворот приёмки */}
      <mesh position={[x, 0.03, FRONT_Z - 1.4]} material={M.steelDark} receiveShadow>
        <boxGeometry args={[1.4, 0.05, 1.4]} />
      </mesh>
      {atDock && <DockedTruck x={x} color="#7c8a7b" plate="01 X 555 SA" onClick={() => onOpen('raw')} />}
      <Tag
        position={[x, atDock ? 3.35 : 0.8, FRONT_Z + (atDock ? 2.2 : 3)]}
        title={atDock ? `Приёмка: ${atDock.name.split(' ')[0]}` : 'Приёмка сырья'}
        value={atDock ? 'разгрузка' : next ? `${next.name.split(' ')[0]} · ${localParts(next.t, tz).date === today ? '' : 'завтра '}${fmtTime(next.t, tz)}` : 'поставок нет'}
        onClick={() => onOpen('raw')}
      />
    </group>
  );
}

export const SupplyScene = memo(function SupplyScene({ config, onOpen, showLabels }: { config: SiteConfig; onOpen: Open; showLabels: boolean }) {
  const snap = useSupply();
  const view = useMemo(() => (snap ? supplyView(snap, config, SupplySim.localMidnight(snap.now, config.site.timezone)) : null), [snap, config]);
  if (!config.supply || !view || !snap) return null;
  return (
    <group>
      <DryRacks config={config} view={view} onOpen={onOpen} showLabels={showLabels} />
      <GoodsRacks config={config} view={view} onOpen={onOpen} />
      <PackingQueue config={config} view={view} onOpen={onOpen} />
      <ReceivingDock config={config} view={view} now={snap.now} onOpen={onOpen} />
      <ShippingDocks config={config} view={view} onOpen={onOpen} showLabels={showLabels} />
    </group>
  );
});
