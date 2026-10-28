import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SiteConfig } from '@bakery/shared';
import { MergeStatic } from './MergeStatic';

/**
 * Высокопроизводительная (60 FPS) система освещения цеха, грузового двора и ночной смены:
 * - НОЛЬ дополнительных PointLight/SpotLight в PBR-шейдерах (никакой перекомпиляции шейдеров и просадок FPS!).
 * - Всё свечение прожекторов High-Bay LED, уличных фонарей, печей и фар грузовиков реализовано через
 *   объединённые (MergeStatic) объёмные лучи (AdditiveBlending), световые пятна на полу и emissive-материалы с Bloom.
 */

const fixtureDark = new THREE.MeshStandardMaterial({ color: '#1e2229', roughness: 0.45, metalness: 0.65 });
const fixtureRim = new THREE.MeshStandardMaterial({ color: '#434a54', roughness: 0.35, metalness: 0.75 });
const ledEmitterOn = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  emissive: '#dbeafe',
  emissiveIntensity: 2.8,
  roughness: 0.1,
  toneMapped: false,
});
const ledEmitterOff = new THREE.MeshStandardMaterial({
  color: '#d4d8dd',
  emissive: '#ffffff',
  emissiveIntensity: 0.15,
  roughness: 0.3,
});
const floodEmitterOn = new THREE.MeshStandardMaterial({
  color: '#fffbeb',
  emissive: '#fde68a',
  emissiveIntensity: 3.0,
  roughness: 0.1,
  toneMapped: false,
});
const trafficGreen = new THREE.MeshStandardMaterial({
  color: '#10b981',
  emissive: '#10b981',
  emissiveIntensity: 2.2,
  toneMapped: false,
});
const trafficRed = new THREE.MeshStandardMaterial({
  color: '#ef4444',
  emissive: '#ef4444',
  emissiveIntensity: 2.2,
  toneMapped: false,
});
const lanePaint = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.75 });
const safetyYellowPaint = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.65 });
const yardAsphaltMat = new THREE.MeshStandardMaterial({ color: '#bab8b1', roughness: 0.88, metalness: 0.05 });

const headlightMat = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  emissive: '#e0f2fe',
  emissiveIntensity: 3.4,
  toneMapped: false,
});
const roofMarkerMat = new THREE.MeshStandardMaterial({
  color: '#f59e0b',
  emissive: '#f59e0b',
  emissiveIntensity: 2.6,
  toneMapped: false,
});
const tailLightMat = new THREE.MeshStandardMaterial({
  color: '#ef4444',
  emissive: '#ef4444',
  emissiveIntensity: 2.8,
  toneMapped: false,
});

// Единые текстуры и материалы для объёмных конусов света и световых пятен (создаются 1 раз)
let sharedConeMatCool: THREE.MeshBasicMaterial | null = null;
let sharedConeMatWarm: THREE.MeshBasicMaterial | null = null;
let sharedConeMatHeadlight: THREE.MeshBasicMaterial | null = null;
let sharedPoolMatCool: THREE.MeshBasicMaterial | null = null;
let sharedPoolMatWarm: THREE.MeshBasicMaterial | null = null;
let sharedPoolMatHeadlight: THREE.MeshBasicMaterial | null = null;

function getLightMaterials() {
  if (!sharedConeMatCool) {
    const c1 = document.createElement('canvas');
    c1.width = 32;
    c1.height = 128;
    const ctx1 = c1.getContext('2d')!;
    const g1 = ctx1.createLinearGradient(0, 0, 0, 128);
    g1.addColorStop(0.0, 'rgba(225, 240, 255, 0.38)');
    g1.addColorStop(0.4, 'rgba(210, 232, 255, 0.14)');
    g1.addColorStop(1.0, 'rgba(200, 225, 255, 0.0)');
    ctx1.fillStyle = g1;
    ctx1.fillRect(0, 0, 32, 128);
    const coneTex = new THREE.CanvasTexture(c1);
    coneTex.colorSpace = THREE.SRGBColorSpace;

    const c2 = document.createElement('canvas');
    c2.width = 64;
    c2.height = 64;
    const ctx2 = c2.getContext('2d')!;
    const g2 = ctx2.createRadialGradient(32, 32, 2, 32, 32, 31);
    g2.addColorStop(0.0, 'rgba(235, 245, 255, 0.34)');
    g2.addColorStop(0.5, 'rgba(210, 230, 255, 0.12)');
    g2.addColorStop(1.0, 'rgba(200, 225, 255, 0.0)');
    ctx2.fillStyle = g2;
    ctx2.fillRect(0, 0, 64, 64);
    const poolTex = new THREE.CanvasTexture(c2);
    poolTex.colorSpace = THREE.SRGBColorSpace;

    sharedConeMatCool = new THREE.MeshBasicMaterial({
      map: coneTex,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    sharedConeMatWarm = new THREE.MeshBasicMaterial({
      map: coneTex,
      color: '#fde68a',
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    sharedConeMatHeadlight = new THREE.MeshBasicMaterial({
      map: coneTex,
      color: '#e0f2fe',
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    sharedPoolMatCool = new THREE.MeshBasicMaterial({
      map: poolTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    sharedPoolMatWarm = new THREE.MeshBasicMaterial({
      map: poolTex,
      color: '#fef08a',
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    sharedPoolMatHeadlight = new THREE.MeshBasicMaterial({
      map: poolTex,
      color: '#e0f2fe',
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
  }
  return {
    coneCool: sharedConeMatCool!,
    coneWarm: sharedConeMatWarm!,
    coneHead: sharedConeMatHeadlight!,
    poolCool: sharedPoolMatCool!,
    poolWarm: sharedPoolMatWarm!,
    poolHead: sharedPoolMatHeadlight!,
  };
}

export interface SceneLightsProps {
  config: SiteConfig;
  isNight: boolean;
  isMobile?: boolean;
  floorFilter?: 'all' | 1 | 2 | 3 | 4;
}

const bgDay = new THREE.Color('#ecebe7');
const bgNight = new THREE.Color('#0c121e');
const skyDay = new THREE.Color('#ffffff');
const skyNight = new THREE.Color('#3b6998');
const gndDay = new THREE.Color('#b9b4a8');
const gndNight = new THREE.Color('#141c2b');
const sunDay = new THREE.Color('#fffaf0');
const moonNight = new THREE.Color('#9ec5ff');
const asphaltDay = new THREE.Color('#bab8b1');
const asphaltNight = new THREE.Color('#1b2028');

export const SceneLights = memo(function SceneLights({ config, isNight, isMobile = false }: SceneLightsProps) {
  const mapSize: [number, number] = isMobile ? [1024, 1024] : [2048, 2048];
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const ambRef = useRef<THREE.AmbientLight>(null);
  const mainDirRef = useRef<THREE.DirectionalLight>(null);
  const fillDirRef = useRef<THREE.DirectionalLight>(null);

  useFrame((state, dt) => {
    const k = Math.min(1, dt * 4.0);
    if (state.scene.background instanceof THREE.Color) {
      state.scene.background.lerp(isNight ? bgNight : bgDay, k);
    }
    yardAsphaltMat.color.lerp(isNight ? asphaltNight : asphaltDay, k);

    if (hemiRef.current) {
      hemiRef.current.color.lerp(isNight ? skyNight : skyDay, k);
      hemiRef.current.groundColor.lerp(isNight ? gndNight : gndDay, k);
      hemiRef.current.intensity = THREE.MathUtils.damp(hemiRef.current.intensity, isNight ? 0.62 : 1.15, 4, dt);
    }
    if (ambRef.current) {
      ambRef.current.intensity = THREE.MathUtils.damp(ambRef.current.intensity, isNight ? 0.28 : 0.25, 4, dt);
    }
    if (mainDirRef.current) {
      mainDirRef.current.color.lerp(isNight ? moonNight : sunDay, k);
      mainDirRef.current.intensity = THREE.MathUtils.damp(mainDirRef.current.intensity, isNight ? 1.05 : 1.9, 4, dt);
      mainDirRef.current.position.x = THREE.MathUtils.damp(mainDirRef.current.position.x, isNight ? -12 : 9, 4, dt);
      mainDirRef.current.position.y = THREE.MathUtils.damp(mainDirRef.current.position.y, isNight ? 21 : 18, 4, dt);
      mainDirRef.current.position.z = THREE.MathUtils.damp(mainDirRef.current.position.z, isNight ? 16 : 12, 4, dt);
    }
    if (fillDirRef.current) {
      fillDirRef.current.intensity = THREE.MathUtils.damp(fillDirRef.current.intensity, isNight ? 0.35 : 0.45, 4, dt);
    }
  });

  const { width: W, depth: D, height: H } = config.site.hall;
  const frontZ = D / 2;
  const yardDepth = 18.5;
  const yardCenterZ = frontZ + yardDepth / 2;
  const docks = config.supply?.layout.shippingDocks ?? [];
  const recX = config.supply?.layout.receivingDock.x ?? -20;

  const highBaysFloor1: [number, number, number][] = useMemo(
    () => [
      [-18.0, H - 0.12, -2.5],
      [-8.5, H - 0.12, -10.5],
      [-8.5, H - 0.12, 2.5],
      [2.5, H - 0.12, -10.5],
      [11.5, H - 0.12, -10.5],
      [11.5, H - 0.12, 2.5],
      [20.0, H - 0.12, 1.5],
      [-18.0, H - 0.12, 11.5],
      [18.0, H - 0.12, 11.5],
    ],
    [H],
  );

  const facadeFloods: [number, number][] = useMemo(
    () => [
      [-20.0, frontZ],
      [-14.5, frontZ],
      [14.2, frontZ],
      [19.8, frontZ],
    ],
    [frontZ],
  );

  const mats = useMemo(() => getLightMaterials(), []);

  return (
    <>
      <hemisphereLight ref={hemiRef} args={['#ffffff', '#b9b4a8', 1.15]} />
      <ambientLight ref={ambRef} intensity={0.25} />
      <directionalLight
        ref={mainDirRef}
        position={[9, 18, 12]}
        intensity={1.9}
        castShadow
        shadow-mapSize={mapSize}
        shadow-bias={-0.0006}
        shadow-normalBias={0.035}
        shadow-camera-left={-38}
        shadow-camera-right={38}
        shadow-camera-top={26}
        shadow-camera-bottom={-32}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />
      <directionalLight ref={fillDirRef} position={[-12, 9, 6]} intensity={0.45} />

      {/* Статическая геометрия двора, прожекторов и светофоров доков — склеена в минимум draw calls */}
      <MergeStatic>
        {/* Полотно асфальта двора (принимает реальные тени от Tesla Semi и фургонов) */}
        <mesh position={[0, -0.02, yardCenterZ]} material={yardAsphaltMat} receiveShadow>
          <boxGeometry args={[W + 1.2, 0.04, yardDepth]} />
        </mesh>
        <mesh position={[0, 0.004, frontZ + 0.18]} rotation={[-Math.PI / 2, 0, 0]} material={safetyYellowPaint} receiveShadow>
          <planeGeometry args={[W, 0.18]} />
        </mesh>
        {[-1.55, 1.55].map((dx) => (
          <mesh key={`rec-${dx}`} position={[recX + dx, 0.004, frontZ + 8.2]} rotation={[-Math.PI / 2, 0, 0]} material={lanePaint} receiveShadow>
            <planeGeometry args={[0.12, 14.5]} />
          </mesh>
        ))}
        {docks.flatMap((d, idx) =>
          [-1.3, 1.3].map((dx) => (
            <mesh key={`dock-${idx}-${dx}`} position={[d.x + dx, 0.004, frontZ + 4.5]} rotation={[-Math.PI / 2, 0, 0]} material={lanePaint} receiveShadow>
              <planeGeometry args={[0.1, 7.2]} />
            </mesh>
          )),
        )}

        {/* Корпуса купольных светильников High-Bay LED */}
        {highBaysFloor1.map(([x, y, z], i) => (
          <group key={`hb1-${i}`} position={[x, y, z]}>
            <mesh position={[0, 0.18, 0]} material={fixtureRim}>
              <cylinderGeometry args={[0.02, 0.02, 0.36, 8]} />
            </mesh>
            <mesh position={[0, -0.04, 0]} material={fixtureDark}>
              <cylinderGeometry args={[0.18, 0.42, 0.22, 14]} />
            </mesh>
          </group>
        ))}

        {/* Уличные прожекторы над рампами */}
        {facadeFloods.map(([x, z], i) => (
          <group key={`fl-${i}`} position={[x, H - 0.25, z + 0.22]}>
            <mesh rotation={[0.45, 0, 0]} material={fixtureDark}>
              <boxGeometry args={[0.42, 0.24, 0.14]} />
            </mesh>
          </group>
        ))}

        {/* Светофоры рамп на фасаде */}
        {[recX, ...docks.map((d) => d.x)].map((dx, i) => (
          <group key={`tl-${i}`} position={[dx - 1.45, 2.2, frontZ + 0.06]}>
            <mesh material={fixtureDark}>
              <boxGeometry args={[0.16, 0.38, 0.1]} />
            </mesh>
            <mesh position={[0, 0.08, 0.055]} material={trafficRed}>
              <circleGeometry args={[0.045, 12]} />
            </mesh>
            <mesh position={[0, -0.08, 0.055]} material={trafficGreen}>
              <circleGeometry args={[0.045, 12]} />
            </mesh>
          </group>
        ))}
      </MergeStatic>

      {/* Излучатели и объёмные конусы света в ночную смену (склеены через MergeStatic в 4 draw call!) */}
      {isNight && (
        <MergeStatic>
          {highBaysFloor1.map(([x, y, z], i) => (
            <group key={`night-hb-${i}`} position={[x, y - 0.16, z]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} material={ledEmitterOn}>
                <circleGeometry args={[0.38, 14]} />
              </mesh>
              <mesh position={[0, -2.1, 0]} material={mats.coneCool}>
                <coneGeometry args={[2.8, 4.2, 16, 1, true]} />
              </mesh>
              <mesh position={[0, -(y - 0.175), 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.poolCool}>
                <planeGeometry args={[6.8, 6.8]} />
              </mesh>
            </group>
          ))}

          {facadeFloods.map(([x, z], i) => (
            <group key={`night-fl-${i}`} position={[x, H - 0.3, z + 0.3]}>
              <mesh rotation={[0.45, 0, 0]} material={floodEmitterOn}>
                <planeGeometry args={[0.36, 0.18]} />
              </mesh>
              <mesh position={[0, -2.0, 2.2]} rotation={[0.72, 0, 0]} material={mats.coneWarm}>
                <coneGeometry args={[3.2, 5.6, 16, 1, true]} />
              </mesh>
              <mesh position={[0, -(H - 0.315), 3.6]} rotation={[-Math.PI / 2, 0, 0]} material={mats.poolWarm}>
                <planeGeometry args={[8.5, 8.5]} />
              </mesh>
            </group>
          ))}

          {/* Огненный отсвет на полу перед печами oven-1 и oven-2 */}
          {[9.2, 13.6].map((ox) => (
            <mesh key={`oven-glow-${ox}`} position={[ox, 0.016, -12.1]} rotation={[-Math.PI / 2, 0, 0]} material={mats.poolWarm}>
              <planeGeometry args={[3.8, 3.8]} />
            </mesh>
          ))}
        </MergeStatic>
      )}
    </>
  );
});

/**
 * Ночные фары, объёмные лучи и габаритные огни для грузовиков (без нагрузки на шейдеры).
 */
export const VehicleNightLights = memo(function VehicleNightLights({
  frontZ,
  width = 2.0,
  headlightY = 0.98,
  roofY = 3.1,
  isSemiTrailer = false,
}: {
  frontZ: number;
  width?: number;
  headlightY?: number;
  roofY?: number;
  isSemiTrailer?: boolean;
}) {
  const mats = useMemo(() => getLightMaterials(), []);
  const xOff = width * 0.38;

  return (
    <MergeStatic>
      {[-xOff, xOff].map((x) => (
        <group key={x} position={[x, headlightY, frontZ]}>
          <mesh material={headlightMat}>
            <boxGeometry args={[0.28, 0.14, 0.04]} />
          </mesh>
          <mesh position={[0, -0.38, 3.2]} rotation={[-Math.PI / 2 - 0.11, 0, 0]} material={mats.coneHead}>
            <coneGeometry args={[1.35, 6.4, 14, 1, true]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.018, frontZ + 3.8]} rotation={[-Math.PI / 2, 0, 0]} material={mats.poolHead}>
        <planeGeometry args={[4.4, 7.5]} />
      </mesh>
      {[-width * 0.42, 0, width * 0.42].map((x, idx) => (
        <mesh key={`roof-${idx}`} position={[x, roofY, isSemiTrailer ? 11.2 : frontZ - 1.2]} material={roofMarkerMat}>
          <boxGeometry args={[0.14, 0.06, 0.08]} />
        </mesh>
      ))}
      {[-width * 0.42, width * 0.42].map((x, idx) => (
        <mesh key={`tail-${idx}`} position={[x, 0.65, 0.05]} material={tailLightMat}>
          <boxGeometry args={[0.3, 0.12, 0.06]} />
        </mesh>
      ))}
    </MergeStatic>
  );
});
