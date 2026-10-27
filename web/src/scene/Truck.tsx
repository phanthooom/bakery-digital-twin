import { memo, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { drawEmblem } from '../ui/brandEmblem';
import { GltfModel } from './GltfModel';
import { MergeStatic } from './MergeStatic';
import { M } from './materials';
import { makeGrilleTexture } from './textures';

/**
 * Фургон-рефрижератор (или машина поставщика) в стиле станков: скруглённые формы,
 * кабина с наклонным стеклом, фары, зеркала, колёса с дисками, задние двери с запорами,
 * холодильный агрегат и фирменная ливрея по борту.
 * Локальные координаты: зад кузова в z = 0 (к рампе), кабина — к +z, ширина по x.
 * cab="semi" — кабина и колёса Tesla Semi из GLB (tesla-semi-van.glb, «Tesla semi truck» by iZnoGouD,
 * CC BY 4.0; собирается scripts/build-tesla-semi.mjs под размеры будки ниже), будка — своя.
 */

const W = 2.1; // ширина кузова
const BODY_L = 3.5;
// будка стоит на подрамнике выше колёс
const BODY_Y0 = 0.98;
const BODY_H = 2.1;
const CAB_Z0 = BODY_L + 0.06;
const CAB_W = 2.0;
const WHEEL_R = 0.42;
/** Колёса по длине: заднее под будкой, переднее под кабиной. */
const REAR_WHEEL_Z = 0.95;
const FRONT_WHEEL_LOCAL = 0.95; // от начала кабины
const ARCH_R = 0.53;
/** Кабина Semi: задняя ось под будкой и длина кабины — как в scripts/build-tesla-semi.mjs. */
const SEMI_VAN_URL = '/models/tesla-semi-van.glb';
const SEMI_REAR_AXLE_Z = 1.1;
const SEMI_CAB_L = 3.05;
useGLTF.preload(SEMI_VAN_URL);

/** Будка фургона: ширина, пол (y), высота, длина; зад — в z = 0. Внутренний объём — для раскладки лотков. */
export const VAN_BODY = { width: W, floorY: BODY_Y0, height: BODY_H, length: BODY_L, wall: 0.05 } as const;

/** Длина машины от заднего торца будки до переда кабины, м. */
export const TRUCK_LENGTH = { classic: CAB_Z0 + 1.68, semi: CAB_Z0 + SEMI_CAB_L } as const;

const tireMat = new THREE.MeshStandardMaterial({ color: '#1d1f21', roughness: 0.92 });
const rimInner = new THREE.MeshStandardMaterial({ color: '#8f959b', roughness: 0.35, metalness: 0.7 });
const linerMat = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.95, side: THREE.DoubleSide });
const paint = new THREE.MeshStandardMaterial({ color: '#f7f7f5', roughness: 0.35, metalness: 0.15 });
const tarpMat = new THREE.MeshStandardMaterial({ color: '#7f8d7e', roughness: 0.95 });
const tarpRib = new THREE.MeshStandardMaterial({ color: '#6c796b', roughness: 0.9 });
const supplierPaint = new THREE.MeshStandardMaterial({ color: '#6f8090', roughness: 0.4, metalness: 0.25 });
const glassMat = new THREE.MeshStandardMaterial({ color: '#1f2a33', roughness: 0.08, metalness: 0.6, side: THREE.DoubleSide });
const trimMat = new THREE.MeshStandardMaterial({ color: '#2b2e31', roughness: 0.6 });
const plasticMat = new THREE.MeshStandardMaterial({ color: '#3a3e42', roughness: 0.75 });
const rimMat = new THREE.MeshStandardMaterial({ color: '#c9cdd1', roughness: 0.3, metalness: 0.8 });
const headMat = new THREE.MeshStandardMaterial({ color: '#fffdf2', emissive: '#fff4d6', emissiveIntensity: 0.6, roughness: 0.15 });
const amberMat = new THREE.MeshStandardMaterial({ color: '#f2a03d', emissive: '#f2a03d', emissiveIntensity: 0.35, roughness: 0.3 });
const tailMat = new THREE.MeshStandardMaterial({ color: '#c8242b', emissive: '#a5141b', emissiveIntensity: 0.45, roughness: 0.3 });
const seamMat = new THREE.MeshStandardMaterial({ color: '#c4c6c6', roughness: 0.6 });
/** Пол будки — рифлёный алюминий. */
const floorMat = new THREE.MeshStandardMaterial({ color: '#9aa0a4', roughness: 0.55, metalness: 0.4 });
/** Толщина стенок будки. */
const WALL = 0.05;

/** Боковой профиль кабины (z вперёд, y вверх): крыша, наклонное лобовое, короткий капот. */
const CAB_PROFILE: [number, number][] = (() => {
  const top: [number, number][] = [[0, 0.58], [0, 2.42], [0.62, 2.42], [1.12, 1.58], [1.5, 1.44], [1.6, 1.22], [1.6, 0.58]];
  // вырез арки переднего колеса снизу (от переда к заду)
  const a0 = Math.asin((0.58 - WHEEL_R) / ARCH_R);
  const arch: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const t = a0 + ((Math.PI - 2 * a0) * i) / 16;
    arch.push([FRONT_WHEEL_LOCAL + ARCH_R * Math.cos(t), WHEEL_R + ARCH_R * Math.sin(t)]);
  }
  return [...top, ...arch];
})();

function useCabGeometry() {
  return useMemo(() => {
    const s = new THREE.Shape();
    CAB_PROFILE.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: CAB_W - 0.16, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 4, curveSegments: 6 });
    // (u, v, w) → x = −w, y = v, z = u; центр по ширине
    g.rotateY(-Math.PI / 2);
    g.translate((CAB_W - 0.16) / 2, 0, 0);
    g.computeVertexNormals();
    return g;
  }, []);
}

/** Плоский многоугольник в плоскости (z, y) — окно на боку кабины. */
function sideGeometry(pts: [number, number][]) {
  const s = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateY(-Math.PI / 2);
  return g;
}

/** Лобовое стекло вдоль наклона профиля, чуть впереди поверхности. */
function windshieldGeometry() {
  const [z1, y1] = [0.66, 2.36];
  const [z2, y2] = [1.08, 1.64];
  const d = new THREE.Vector2(z2 - z1, y2 - y1).normalize();
  const n = new THREE.Vector2(-d.y, d.x).multiplyScalar(0.09); // наружу (вперёд-вверх)
  const hw = CAB_W / 2 - 0.12;
  const v = [
    [-hw, y1 + n.y, z1 + n.x], [hw, y1 + n.y, z1 + n.x], [hw, y2 + n.y, z2 + n.x], [-hw, y2 + n.y, z2 + n.x],
  ].flat();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  g.computeVertexNormals();
  return g;
}

function plateTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 112;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 512, 112);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 104);
  ctx.fillStyle = '#111';
  ctx.font = '700 70px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const [region, ...rest] = text.split(' ');
  ctx.fillText(region ?? '', 24, 60);
  ctx.fillRect(118, 10, 5, 92);
  ctx.fillText(rest.join(' '), 140, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Ливрея борта: белый кузов, фирменная волна снизу, эмблема, название и слоган.
 * Рисуется в логических единицах высотой 880; aspect — отношение длины борта к высоте,
 * px — высота текстуры в пикселях, center — блок с названием по центру борта (длинный прицеп).
 */
function liveryTexture(brand: string, tagline: string, color: string, mirror: boolean, { aspect = 1400 / 880, px = 880, center = false } = {}) {
  const w = Math.round(880 * aspect);
  const k = px / 880;
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = px;
  const ctx = c.getContext('2d')!;
  ctx.scale(k, k);
  ctx.fillStyle = '#f7f7f5';
  ctx.fillRect(0, 0, w, 880);
  ctx.save();
  if (mirror) {
    // левый борт: кабина слева — волна зеркально, текст читается как обычно
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.scale(w / 1400, 1); // волна растягивается по длине борта
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 880);
  ctx.lineTo(0, 560);
  ctx.bezierCurveTo(420, 470, 900, 640, 1400, 420);
  ctx.lineTo(1400, 880);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.moveTo(0, 520);
  ctx.bezierCurveTo(420, 430, 900, 600, 1400, 380);
  ctx.lineTo(1400, 398);
  ctx.bezierCurveTo(900, 620, 420, 450, 0, 540);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // эмблема и надписи — всегда слева направо; блок шириной 1400 — у кабины или по центру
  ctx.translate(center ? (w - 1400) / 2 : mirror ? w - 1400 : 0, 0);
  const ex = mirror ? 1080 : 120;
  const emb = document.createElement('canvas');
  emb.width = emb.height = 256;
  drawEmblem(emb.getContext('2d')!, 256, { bg: color, ring: '#ffd9a0', grain: '#fff3df' });
  ctx.drawImage(emb, ex, 90, 200, 200);
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.font = '800 150px "Segoe UI", system-ui, sans-serif';
  const tx = mirror ? 90 : 360;
  ctx.fillText(brand, tx, 245, 920);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'italic 500 92px "Segoe Script", "Brush Script MT", cursive';
  ctx.fillText(tagline, mirror ? 120 : 640, 780, 700);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Фирменная ливрея на оба борта: плоскости по бокам кузова (x = right и x = −left),
 * центр борта (y, z), размер length × height. Ориентация — как у Truck: кабина к +z.
 */
export function BrandLivery({ brand, tagline, color, right, left, y, z, length, height, px, center }: { brand: string; tagline: string; color: string; right: number; left: number; y: number; z: number; length: number; height: number; px?: number; center?: boolean }) {
  const [tr, tl] = useMemo(() => {
    const opts = { aspect: length / height, px, center };
    return [liveryTexture(brand, tagline, color, false, opts), liveryTexture(brand, tagline, color, true, opts)];
  }, [brand, tagline, color, length, height, px, center]);
  return (
    <>
      {[1, -1].map((s) => (
        <mesh key={s} position={[s > 0 ? right : -left, y, z]} rotation={[0, s * (Math.PI / 2), 0]}>
          <planeGeometry args={[length, height]} />
          <meshStandardMaterial map={s > 0 ? tr : tl} roughness={0.4} metalness={0.05} />
        </mesh>
      ))}
    </>
  );
}

/** Колесо: шина со скруглённой боковиной, стальной диск с выемкой, ступица и 6 гаек — снаружи. */
function Wheel({ z, side }: { z: number; side: 1 | -1 }) {
  const lugs = Array.from({ length: 6 }, (_, i) => (i / 6) * Math.PI * 2);
  return (
    <group position={[side * (W / 2 - 0.2), WHEEL_R, z]}>
      <mesh rotation={[0, 0, Math.PI / 2]} material={tireMat} castShadow>
        <cylinderGeometry args={[WHEEL_R - 0.02, WHEEL_R - 0.02, 0.26, 40]} />
      </mesh>
      {[-1, 1].map((f) => (
        <mesh key={f} position={[f * 0.115, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={tireMat}>
          <torusGeometry args={[WHEEL_R - 0.06, 0.055, 12, 40]} />
        </mesh>
      ))}
      <group position={[side * 0.145, 0, 0]} rotation={[0, side * (Math.PI / 2), 0]}>
        <mesh material={rimMat}>
          <ringGeometry args={[0.15, 0.25, 36]} />
        </mesh>
        <mesh position={[0, 0, -0.025]} material={rimInner}>
          <circleGeometry args={[0.16, 32]} />
        </mesh>
        <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]} material={M.chrome}>
          <cylinderGeometry args={[0.065, 0.075, 0.04, 16]} />
        </mesh>
        {lugs.map((a) => (
          <mesh key={a} position={[Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0.0]} rotation={[Math.PI / 2, 0, 0]} material={M.chrome}>
            <cylinderGeometry args={[0.014, 0.014, 0.03, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Тёмный подкрылок арки переднего колеса (внутренняя поверхность выреза). */
function ArchLiner() {
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(ARCH_R - 0.01, ARCH_R - 0.01, CAB_W - 0.04, 24, 1, true, 0, Math.PI);
    g.rotateZ(Math.PI / 2);
    return g;
  }, []);
  return <mesh geometry={geo} position={[0, WHEEL_R, CAB_Z0 + FRONT_WHEEL_LOCAL]} material={linerMat} />;
}

/** Заднее крыло над колесом и брызговик за ним. */
function RearFender({ side }: { side: 1 | -1 }) {
  return (
    <group position={[side * (W / 2 - 0.2), 0, REAR_WHEEL_Z]}>
      <mesh position={[0, WHEEL_R * 2 + 0.08, 0]} material={trimMat} castShadow>
        <boxGeometry args={[0.34, 0.04, 1.05]} />
      </mesh>
      {[-1, 1].map((e) => (
        <mesh key={e} position={[0, WHEEL_R * 2 - 0.02, e * 0.5]} rotation={[e * 0.6, 0, 0]} material={trimMat}>
          <boxGeometry args={[0.34, 0.2, 0.03]} />
        </mesh>
      ))}
      <mesh position={[0, 0.34, -0.52]} material={M.rubber}>
        <boxGeometry args={[0.32, 0.46, 0.02]} />
      </mesh>
    </group>
  );
}

export interface TruckProps {
  /** Название фирмы на борту; не задано — машина поставщика (тент, без ливреи). */
  brand?: string;
  tagline?: string;
  color: string;
  plate: string;
  /** Кабина: своя процедурная или Tesla Semi (GLB; пока грузится — процедурная). */
  cab?: 'classic' | 'semi';
  /** Идёт ли погрузка заказа (мигает маячок) */
  loading?: boolean;
  /** Двери будки: 0 — закрыты, 1 — распахнуты к бортам. Ref читается в каждом кадре, без перерисовки React. */
  doorRef?: MutableRefObject<number>;
}

/**
 * Задние распашные двери на петлях: створки поворачиваются наружу и складываются к бортам (на 270°).
 * Петли — по краям проёма (x = ±hingeX), зад кузова — z = 0. Створки поворачиваются сами (useFrame), поэтому
 * они вне MergeStatic кузова; детали каждой створки склеены внутри неё самой.
 */
export function RearDoors({ doorRef, hingeX, y0, height, material }: { doorRef?: MutableRefObject<number>; hingeX: number; y0: number; height: number; material: THREE.Material }) {
  const right = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  useFrame(() => {
    const d = doorRef?.current ?? 0;
    if (right.current) right.current.rotation.y = -d * 1.5 * Math.PI;
    if (left.current) left.current.rotation.y = d * 1.5 * Math.PI;
  });
  const leafW = hingeX - 0.01;
  return (
    <>
      {([1, -1] as const).map((s) => (
        <group key={s} ref={s > 0 ? right : left} position={[s * hingeX, y0 + height / 2, -0.03]}>
          {/* створка поворачивается целиком, её детали склеены в 3 меша по материалу */}
          <MergeStatic>
            <mesh position={[-s * (leafW / 2), 0, 0]} material={material} castShadow>
              <boxGeometry args={[leafW, height - 0.04, 0.04]} />
            </mesh>
            {/* запорные штанги и ручки — снаружи (−z у закрытой створки) */}
            {[0.28, 0.72].map((k) => (
              <mesh key={k} position={[-s * leafW * k, 0, -0.035]} material={M.chrome}>
                <cylinderGeometry args={[0.018, 0.018, height - 0.25, 8]} />
              </mesh>
            ))}
            <mesh position={[-s * leafW * 0.5, -0.1, -0.04]} material={trimMat}>
              <boxGeometry args={[0.18, 0.05, 0.04]} />
            </mesh>
            {/* петли */}
            {[-0.36, 0, 0.36].map((k) => (
              <mesh key={k} position={[0, k * height, -0.02]} material={trimMat}>
                <boxGeometry args={[0.06, 0.12, 0.06]} />
              </mesh>
            ))}
          </MergeStatic>
        </group>
      ))}
    </>
  );
}

export const Truck = memo(function Truck({ brand, tagline = '', color, plate, cab: cabKind = 'classic', loading, doorRef }: TruckProps) {
  const semi = cabKind === 'semi';
  const cab = useCabGeometry();
  const windshield = useMemo(() => windshieldGeometry(), []);
  const sideWin = useMemo(() => sideGeometry([[0.12, 1.62], [0.12, 2.26], [0.58, 2.26], [0.98, 1.62]]), []);
  const plateTex = useMemo(() => plateTexture(plate), [plate]);
  const grille = useMemo(() => makeGrilleTexture(), []);
  const emblem = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    drawEmblem(c.getContext('2d')!, 256, { bg: color, ring: '#ffd9a0', grain: '#fff3df' });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [color]);
  const cabMat = brand ? paint : supplierPaint;
  const total = TRUCK_LENGTH[cabKind];
  // боковая защита — от задних колёс до передних (у Semi — до кабины)
  const guardZ0 = (semi ? SEMI_REAR_AXLE_Z : REAR_WHEEL_Z) + 0.55;
  const guardZ1 = semi ? CAB_Z0 - 0.05 : CAB_Z0 + FRONT_WHEEL_LOCAL - 0.6;

  // процедурная кабина и колёса; для Semi — запасной вариант, пока GLB не загрузился
  const classicCab = (
    <>
        {/* кабина */}
        <group position={[0, 0, CAB_Z0]}>
          <mesh geometry={cab} material={cabMat} castShadow receiveShadow />
          <mesh geometry={windshield} material={glassMat} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh geometry={sideWin} position={[s * (CAB_W / 2 + 0.002), 0, 0]} material={glassMat} />
              {/* шов двери и ручка */}
              <mesh position={[s * (CAB_W / 2 + 0.003), 1.3, 1.02]} material={trimMat}>
                <boxGeometry args={[0.01, 1.3, 0.02]} />
              </mesh>
              <mesh position={[s * (CAB_W / 2 + 0.02), 1.42, 0.25]} material={trimMat}>
                <boxGeometry args={[0.03, 0.04, 0.18]} />
              </mesh>
              {/* зеркало */}
              <mesh position={[s * (CAB_W / 2 + 0.14), 1.8, 1.0]} material={trimMat}>
                <boxGeometry args={[0.24, 0.03, 0.03]} />
              </mesh>
              <RoundedBox args={[0.08, 0.3, 0.18]} radius={0.03} position={[s * (CAB_W / 2 + 0.27), 1.8, 1.0]} material={plasticMat} castShadow />
              {/* фирменная полоса по низу кабины */}
              {brand && (
                <mesh position={[s * (CAB_W / 2 + 0.004), 0.88, 0.8]} rotation={[0, s * (Math.PI / 2), 0]}>
                  <planeGeometry args={[1.6, 0.12]} />
                  <meshStandardMaterial color={color} roughness={0.5} />
                </mesh>
              )}
            </group>
          ))}
          {/* перед: решётка, эмблема, фары, поворотники, бампер, номер */}
          <group position={[0, 0, 1.69]}>
            <RoundedBox args={[1.2, 0.34, 0.04]} radius={0.04} position={[0, 0.98, 0]} material={trimMat} />
            {[-1.5, -0.5, 0.5, 1.5].map((k) => (
              <mesh key={k} position={[0, 0.98 + k * 0.06, 0.022]} material={plasticMat}>
                <boxGeometry args={[1.1, 0.02, 0.01]} />
              </mesh>
            ))}
            {brand && (
              <mesh position={[0, 0.98, 0.03]}>
                <circleGeometry args={[0.13, 28]} />
                <meshBasicMaterial map={emblem} toneMapped={false} />
              </mesh>
            )}
            {[-1, 1].map((s) => (
              <group key={s}>
                <RoundedBox args={[0.3, 0.16, 0.05]} radius={0.04} position={[s * 0.8, 1.02, 0]} material={headMat} />
                <mesh position={[s * 0.8, 0.9, 0.01]} material={amberMat}>
                  <boxGeometry args={[0.24, 0.05, 0.03]} />
                </mesh>
              </group>
            ))}
            <RoundedBox args={[CAB_W + 0.06, 0.24, 0.16]} radius={0.06} position={[0, 0.66, 0.02]} material={plasticMat} castShadow />
            <mesh position={[0, 0.66, 0.105]}>
              <planeGeometry args={[0.52, 0.11]} />
              <meshBasicMaterial map={plateTex} />
            </mesh>
          </group>
        </group>

        {/* колёса */}
        {[REAR_WHEEL_Z, CAB_Z0 + FRONT_WHEEL_LOCAL].map((z) => [1, -1].map((s) => <Wheel key={`${z}${s}`} z={z} side={s as 1 | -1} />))}
        <ArchLiner />
        <RearFender side={1} />
        <RearFender side={-1} />
    </>
  );

  return (
    <group>
      {/* неподвижная машина: меши склеиваются по материалу; GLB-кабина — снаружи (она грузится позже) */}
      <MergeStatic>
        {/* рама, подножки, защитные боковые брусья */}
        <mesh position={[0, 0.5, total / 2]} material={trimMat} castShadow>
          <boxGeometry args={[W - 0.5, 0.2, total - 0.1]} />
        </mesh>
        {/* подрамник под будкой и поперечины */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.52, 0.8, BODY_L / 2]} material={trimMat} castShadow>
            <boxGeometry args={[0.12, 0.34, BODY_L - 0.1]} />
          </mesh>
        ))}
        {[0.3, 1.6, 2.4, 3.3].map((z) => (
          <mesh key={z} position={[0, 0.9, z]} material={trimMat}>
            <boxGeometry args={[W - 0.1, 0.12, 0.1]} />
          </mesh>
        ))}
        {/* боковая защита между колёсами */}
        {[-1, 1].map((s) =>
          [0.56, 0.78].map((y) => (
            <mesh key={`${s}${y}`} position={[s * (W / 2 - 0.05), y, (guardZ0 + guardZ1) / 2]} material={rimMat}>
              <boxGeometry args={[0.04, 0.07, guardZ1 - guardZ0]} />
            </mesh>
          )),
        )}

        {/* кузов — полый, открыт сзади: борта, крыша, пол и передняя стенка; внутри видно груз */}
        {[-1, 1].map((sx) => (
          <mesh key={`wall${sx}`} position={[sx * (W / 2 - WALL / 2), BODY_Y0 + BODY_H / 2, BODY_L / 2]} material={brand ? paint : tarpMat} castShadow receiveShadow>
            <boxGeometry args={[WALL, BODY_H, BODY_L]} />
          </mesh>
        ))}
        <mesh position={[0, BODY_Y0 + BODY_H - WALL / 2, BODY_L / 2]} material={brand ? paint : tarpMat} castShadow receiveShadow>
          <boxGeometry args={[W, WALL, BODY_L]} />
        </mesh>
        <mesh position={[0, BODY_Y0 + WALL / 2, BODY_L / 2]} material={floorMat} receiveShadow>
          <boxGeometry args={[W, WALL, BODY_L]} />
        </mesh>
        <mesh position={[0, BODY_Y0 + BODY_H / 2, BODY_L - WALL / 2]} material={brand ? paint : tarpMat} castShadow receiveShadow>
          <boxGeometry args={[W, BODY_H, WALL]} />
        </mesh>
        {/* рамка проёма */}
        {[-1, 1].map((sx) => (
          <mesh key={`jamb${sx}`} position={[sx * (W / 2 - 0.03), BODY_Y0 + BODY_H / 2, 0.02]} material={seamMat}>
            <boxGeometry args={[0.07, BODY_H, 0.05]} />
          </mesh>
        ))}
        <mesh position={[0, BODY_Y0 + BODY_H - 0.035, 0.02]} material={seamMat}>
          <boxGeometry args={[W, 0.07, 0.05]} />
        </mesh>
        <mesh position={[0, BODY_Y0 + 0.03, 0.02]} material={trimMat}>
          <boxGeometry args={[W, 0.08, 0.06]} />
        </mesh>
        {brand ? (
          <>
            <BrandLivery brand={brand} tagline={tagline} color={color} right={W / 2 + 0.004} left={W / 2 + 0.004} y={BODY_Y0 + BODY_H / 2} z={BODY_L / 2} length={BODY_L - 0.1} height={BODY_H - 0.1} />
            {/* угловые профили кузова */}
            {[-1, 1].map((sx) =>
              [0.03, BODY_L - 0.03].map((z) => (
                <mesh key={`${sx}${z}`} position={[sx * (W / 2 - 0.01), BODY_Y0 + BODY_H / 2, z]} material={seamMat}>
                  <boxGeometry args={[0.05, BODY_H, 0.05]} />
                </mesh>
              )),
            )}
            {/* холодильный агрегат на передней стенке будки (у Semi её закрывает обтекатель кабины) */}
            {!semi && <group position={[0, BODY_Y0 + BODY_H - 0.38, BODY_L + 0.2]}>
              <RoundedBox args={[1.5, 0.62, 0.36]} radius={0.08} material={M.steelLight} castShadow />
              {[-0.38, 0.38].map((x) => (
                <mesh key={x} position={[x, 0, 0.185]}>
                  <circleGeometry args={[0.22, 28]} />
                  <meshStandardMaterial map={grille} roughness={0.6} />
                </mesh>
              ))}
            </group>}
            {/* габаритные огни на крыше */}
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * (W / 2 - 0.12), BODY_Y0 + BODY_H + 0.03, BODY_L - 0.12]} material={amberMat}>
                <boxGeometry args={[0.14, 0.05, 0.08]} />
              </mesh>
            ))}
          </>
        ) : (
          // тент: рёбра каркаса
          Array.from({ length: 6 }, (_, i) => (
            <mesh key={i} position={[0, BODY_Y0 + BODY_H / 2, 0.3 + i * ((BODY_L - 0.6) / 5)]} material={tarpRib}>
              <boxGeometry args={[W + 0.02, BODY_H + 0.02, 0.06]} />
            </mesh>
          ))
        )}

        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (W / 2 - 0.22), 0.62, -0.02]} material={tailMat}>
            <boxGeometry args={[0.32, 0.14, 0.06]} />
          </mesh>
        ))}
        <mesh position={[0, 0.46, -0.05]} material={trimMat} castShadow>
          <boxGeometry args={[W - 0.2, 0.12, 0.1]} />
        </mesh>
        {/* задний номер смотрит назад (−z), иначе читается зеркально */}
        <mesh position={[0, 0.66, -0.04]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.52, 0.11]} />
          <meshBasicMaterial map={plateTex} />
        </mesh>

        {!semi && classicCab}
      </MergeStatic>
      {semi && <GltfModel url={SEMI_VAN_URL} keepOrigin fallback={classicCab} />}
      <RearDoors doorRef={doorRef} hingeX={W / 2 + 0.03} y0={BODY_Y0} height={BODY_H} material={brand ? paint : tarpMat} />

      {loading && (
        <group position={[0, BODY_Y0 + BODY_H + 0.1, 1.8]}>
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[0.09, 0.11, 0.18, 16]} />
            <meshStandardMaterial emissive="#f59e0b" emissiveIntensity={2.5} color="#f59e0b" toneMapped={false} />
          </mesh>
        </group>
      )}

    </group>
  );
});
