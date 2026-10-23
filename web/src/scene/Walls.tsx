import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SiteConfig } from '@bakery/shared';
import { M } from './materials';
import { MergeStatic } from './MergeStatic';

/**
 * Четыре стены корпуса с окнами (проёмы, рама, импосты, отлив, стекло с небом) и воротами под рампы.
 * Стена, за которой стоит камера, плавно опускается до цоколя — цех виден снаружи с любой стороны,
 * изнутри все стены на месте.
 */

const T = 0.25; // толщина стены
const PLINTH = 0.3; // высота опущенной стены (цоколь), м
const WIN_Y: [number, number] = [3.0, 4.8];
const BAY = 4; // шаг окон и пилястр
const GATE = { w: 3.4, h: 3.9 };
const DOOR = { w: 1.3, h: 2.2 };
const DADO = 1.2; // окрашенная панель по низу стены изнутри

type Side = 'back' | 'front' | 'left' | 'right';
interface Opening {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const frameMat = new THREE.MeshStandardMaterial({ color: '#5d6368', metalness: 0.55, roughness: 0.38 });
const sillMat = new THREE.MeshStandardMaterial({ color: '#c9ccce', metalness: 0.3, roughness: 0.5 });
const shutterMat = new THREE.MeshStandardMaterial({ color: '#9aa1a7', metalness: 0.5, roughness: 0.45 });
const gateFrameMat = new THREE.MeshStandardMaterial({ color: '#f2c200', roughness: 0.55 });

/** Стекло: небо в окне — светлое у горизонта, голубее кверху; без пересвета (не попадает в свечение). */
function useGlass() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#9fc2dc');
    g.addColorStop(0.55, '#c9dceb');
    g.addColorStop(1, '#e9eff3');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.15, side: THREE.DoubleSide });
  }, []);
}

/** Сплошные куски стены вокруг проёмов: режем на вертикальные полосы по краям проёмов. */
function wallPieces(L: number, H: number, openings: Opening[]): Opening[] {
  const xs = [...new Set([-L / 2, L / 2, ...openings.flatMap((o) => [o.x0, o.x1])])].filter((x) => x >= -L / 2 && x <= L / 2).sort((a, b) => a - b);
  const out: Opening[] = [];
  for (let i = 1; i < xs.length; i++) {
    const x0 = xs[i - 1]!;
    const x1 = xs[i]!;
    if (x1 - x0 < 1e-6) continue;
    const cut = openings.filter((o) => o.x0 < x1 - 1e-6 && o.x1 > x0 + 1e-6).sort((a, b) => a.y0 - b.y0);
    let y = 0;
    for (const o of cut) {
      if (o.y0 > y + 1e-6) out.push({ x0, x1, y0: y, y1: o.y0 });
      y = Math.max(y, o.y1);
    }
    if (y < H - 1e-6) out.push({ x0, x1, y0: y, y1: H });
  }
  return out;
}

/** Окно в проёме: рама по контуру, импосты, переплёт, стекло посередине толщины стены, отлив снаружи и изнутри. */
function Window({ o, glass }: { o: Opening; glass: THREE.Material }) {
  const w = o.x1 - o.x0;
  const h = o.y1 - o.y0;
  const cx = (o.x0 + o.x1) / 2;
  const cy = (o.y0 + o.y1) / 2;
  const F = 0.07;
  const D = T + 0.03;
  const mullions = Math.max(1, Math.round(w / 1.2));
  return (
    <group position={[cx, cy, 0]}>
      <mesh material={glass}>
        <planeGeometry args={[w, h]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`v${s}`} position={[(s * (w - F)) / 2, 0, 0]} material={frameMat} castShadow>
          <boxGeometry args={[F, h, D]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`h${s}`} position={[0, (s * (h - F)) / 2, 0]} material={frameMat}>
          <boxGeometry args={[w, F, D]} />
        </mesh>
      ))}
      {Array.from({ length: mullions - 1 }, (_, i) => (
        <mesh key={`m${i}`} position={[-w / 2 + (w / mullions) * (i + 1), 0, 0]} material={frameMat}>
          <boxGeometry args={[0.05, h, 0.09]} />
        </mesh>
      ))}
      {/* фрамуга: верхний ярус переплёта */}
      <mesh position={[0, h / 2 - h * 0.3, 0]} material={frameMat}>
        <boxGeometry args={[w, 0.05, 0.09]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`s${s}`} position={[0, -h / 2 - 0.03, (s * (T + 0.08)) / 2]} material={sillMat}>
          <boxGeometry args={[w + 0.1, 0.04, 0.12]} />
        </mesh>
      ))}
    </group>
  );
}

/** Ворота под рампу: обрамление жёлтым, поднятая рулонная штора — короб над проёмом изнутри, направляющие. */
function Gate({ o }: { o: Opening }) {
  const w = o.x1 - o.x0;
  const cx = (o.x0 + o.x1) / 2;
  return (
    <group position={[cx, 0, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (w + 0.12)) / 2, o.y1 / 2, 0]} material={gateFrameMat}>
          <boxGeometry args={[0.12, o.y1, T + 0.04]} />
        </mesh>
      ))}
      <mesh position={[0, o.y1 + 0.06, 0]} material={gateFrameMat}>
        <boxGeometry args={[w + 0.36, 0.12, T + 0.04]} />
      </mesh>
      <mesh position={[0, o.y1 + 0.3, T / 2 + 0.22]} rotation={[0, 0, Math.PI / 2]} material={shutterMat} castShadow>
        <cylinderGeometry args={[0.22, 0.22, w + 0.1, 16]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`g${s}`} position={[(s * w) / 2, o.y1 / 2, T / 2 + 0.06]} material={shutterMat}>
          <boxGeometry args={[0.06, o.y1, 0.08]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Стена вдоль локальной оси x длиной L (центр в 0), внутрь цеха — локальная +z.
 * Опускается до цоколя, когда камера по ту сторону стены (cut).
 */
function Wall({ side, L, H, gates = [], doors = [], pilasters = false, extras, half }: { side: Side; L: number; H: number; gates?: number[]; doors?: number[]; pilasters?: boolean; extras?: ReactNode; half: { W: number; D: number } }) {
  const glass = useGlass();
  const ref = useRef<THREE.Group>(null);
  const glazing = useRef<THREE.Group>(null);
  const k = useRef(0);

  const { pieces, windows, gateOps, doorOps, dado, bays } = useMemo(() => {
    const gateOps = gates.map((x) => ({ x0: x - GATE.w / 2, x1: x + GATE.w / 2, y0: 0, y1: GATE.h }));
    const doorOps = doors.map((x) => ({ x0: x - DOOR.w / 2, x1: x + DOOR.w / 2, y0: 0, y1: DOOR.h }));
    const n = Math.max(1, Math.round(L / BAY));
    const bay = L / n;
    const bays = Array.from({ length: n + 1 }, (_, i) => -L / 2 + i * bay);
    const windows: Opening[] = [];
    for (let i = 0; i < n; i++) {
      const cx = -L / 2 + bay * (i + 0.5);
      const w = bay - 1.1;
      const o = { x0: cx - w / 2, x1: cx + w / 2, y0: WIN_Y[0], y1: Math.min(WIN_Y[1], H - 0.6) };
      if (![...gateOps, ...doorOps].some((g) => o.x0 < g.x1 + 0.4 && o.x1 > g.x0 - 0.4 && g.y1 > o.y0 - 0.3)) windows.push(o);
    }
    const low = [...gateOps, ...doorOps].sort((a, b) => a.x0 - b.x0);
    const dado: [number, number][] = [];
    let x = -L / 2 + T;
    for (const o of low) {
      if (o.x0 > x) dado.push([x, o.x0]);
      x = Math.max(x, o.x1);
    }
    if (x < L / 2 - T) dado.push([x, L / 2 - T]);
    return { pieces: wallPieces(L, H, [...windows, ...gateOps, ...doorOps]), windows, gateOps, doorOps, dado, bays };
  }, [L, H, gates, doors]);

  useFrame(({ camera }, dt) => {
    const c = camera.position;
    const m = 0.3;
    const out = side === 'back' ? c.z < -half.D - m : side === 'front' ? c.z > half.D + m : side === 'left' ? c.x < -half.W - m : c.x > half.W + m;
    const next = k.current + ((out ? 1 : 0) - k.current) * Math.min(1, dt * 6);
    if (Math.abs(next - k.current) < 1e-4 && ref.current?.userData.k === next) return;
    k.current = next;
    if (ref.current) {
      ref.current.scale.y = 1 - next * (1 - PLINTH / H);
      ref.current.userData.k = next;
    }
    if (glazing.current) glazing.current.visible = next < 0.5;
  });

  return (
    <group ref={ref}>
      <MergeStatic>
        {pieces.map((p, i) => (
          <mesh key={i} position={[(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 0]} material={M.wall} castShadow receiveShadow>
            <boxGeometry args={[p.x1 - p.x0, p.y1 - p.y0, T]} />
          </mesh>
        ))}
        {dado.map(([a, b]) => (
          <mesh key={a} position={[(a + b) / 2, DADO / 2, T / 2 + 0.01]} material={M.wallPanel}>
            <boxGeometry args={[b - a, DADO, 0.02]} />
          </mesh>
        ))}
        {pilasters &&
          bays.slice(1, -1).map((x) => (
            <mesh key={x} position={[x, H / 2, T / 2 + 0.2]} material={M.column} castShadow receiveShadow>
              <boxGeometry args={[0.4, H, 0.4]} />
            </mesh>
          ))}
        {gateOps.map((o) => (
          <Gate key={o.x0} o={o} />
        ))}
        {doorOps.map((o) => (
          <group key={o.x0} position={[(o.x0 + o.x1) / 2, 0, 0]}>
            <mesh position={[0, DOOR.h / 2, 0]} material={M.steelLight}>
              <boxGeometry args={[DOOR.w - 0.06, DOOR.h - 0.04, 0.05]} />
            </mesh>
            <mesh position={[0.45, 1.05, 0.05]} material={M.chrome}>
              <boxGeometry args={[0.18, 0.04, 0.03]} />
            </mesh>
          </group>
        ))}
        {extras}
      </MergeStatic>
      <group ref={glazing}>
        <MergeStatic>
          {windows.map((o) => (
            <Window key={o.x0} o={o} glass={glass} />
          ))}
        </MergeStatic>
      </group>
    </group>
  );
}

export function Walls({ config }: { config: SiteConfig }) {
  const { width: W, depth: D, height: H } = config.site.hall;
  const half = { W: W / 2, D: D / 2 };
  const layout = config.supply?.layout;
  // ворота — напротив рамп (стена к двору — передняя, z+); локальная ось x передней стены смотрит в −x
  const gates = useMemo(() => (layout ? [layout.receivingDock.x, ...layout.shippingDocks.map((d) => d.x)].map((x) => -x) : []), [layout]);
  const sideDoor = useMemo(() => [-(D / 2 - 3)], [D]);
  // вход персонала — напротив бытовых помещений
  const frontDoors = useMemo(() => (config.areas ?? []).filter((a) => a.kind === 'amenities').map((a) => -(a.zone.x0 + a.zone.x1) / 2), [config.areas]);
  return (
    <group>
      <group position={[0, 0, -D / 2 - T / 2]}>
        <Wall
          side="back"
          L={W + 2 * T}
          H={H}
          pilasters
          half={half}
          extras={[3.45, 3.7].map((y, i) => (
            <mesh key={y} position={[0, y, T / 2 + 0.55 + i * 0.22]} rotation={[0, 0, Math.PI / 2]} material={M.pipe} castShadow>
              <cylinderGeometry args={[0.07 - i * 0.02, 0.07 - i * 0.02, W, 16]} />
            </mesh>
          ))}
        />
      </group>
      <group position={[0, 0, D / 2 + T / 2]} rotation={[0, Math.PI, 0]}>
        <Wall side="front" L={W + 2 * T} H={H} gates={gates} doors={frontDoors} half={half} />
      </group>
      <group position={[-W / 2 - T / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <Wall side="left" L={D} H={H} doors={sideDoor} half={half} />
      </group>
      <group position={[W / 2 + T / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <Wall side="right" L={D} H={H} half={half} />
      </group>
    </group>
  );
}

/** Задняя стена срезана (камера за ней) — для вывески на её кромке. */
export function backWallCut(camera: THREE.Camera, depth: number): boolean {
  return camera.position.z < -depth / 2 - 0.3;
}
