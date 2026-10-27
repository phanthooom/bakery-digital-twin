import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SiteConfig } from '@bakery/shared';
import { M } from './materials';
import { MergeStatic } from './MergeStatic';

/**
 * Промышленная система освещения цеха, грузового двора и ночной смены:
 * 1. Асфальтовая площадка грузового двора перед рампами (принимает реальные тени от Tesla Semi и фургонов).
 * 2. Подвесные купольные светильники High-Bay LED (1-й этаж, под антресолью и 2-й этаж) с объёмными конусами света.
 * 3. Фасадные прожекторы рамп приёмки/отгрузки и 3D-светофоры доков.
 * 4. Плавная интерполяция дневного/ночного освещения и теневых каскадов (60 FPS).
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
  emissiveIntensity: 3.2,
  roughness: 0.1,
  toneMapped: false,
});
const trafficGreen = new THREE.MeshStandardMaterial({
  color: '#10b981',
  emissive: '#10b981',
  emissiveIntensity: 2.4,
  toneMapped: false,
});
const trafficRed = new THREE.MeshStandardMaterial({
  color: '#ef4444',
  emissive: '#ef4444',
  emissiveIntensity: 2.4,
  toneMapped: false,
});
const lanePaint = new THREE.MeshStandardMaterial({
  color: '#e5e7eb',
  roughness: 0.75,
});
const safetyYellowPaint = new THREE.MeshStandardMaterial({
  color: '#facc15',
  roughness: 0.65,
});

/** Градиентная текстура для объёмного конуса света (Volumetric Light Cone). */
function useLightConeTexture(): THREE.Texture {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, 'rgba(225, 240, 255, 0.42)');
    g.addColorStop(0.35, 'rgba(210, 232, 255, 0.16)');
    g.addColorStop(0.75, 'rgba(200, 225, 255, 0.04)');
    g.addColorStop(1.0, 'rgba(200, 225, 255, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

/** Текстура мягкого светового пятна на полу / асфальте. */
function useFloorPoolTexture(): THREE.Texture {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0.0, 'rgba(235, 245, 255, 0.32)');
    g.addColorStop(0.5, 'rgba(210, 230, 255, 0.12)');
    g.addColorStop(1.0, 'rgba(200, 225, 255, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

export interface SceneLightsProps {
  config: SiteConfig;
  isNight: boolean;
  isMobile?: boolean;
  floorFilter?: 'all' | 1 | 2;
}

/**
 * Динамическая система глобального света, теней (Shadow Maps) и фона сцены.
 * Плавно интерполирует дневной и ночной режимы в useFrame без скачков.
 */
export function SceneLights({ config, isNight, isMobile = false, floorFilter = 'all' }: SceneLightsProps) {
  const mapSize: [number, number] = isMobile ? [1024, 1024] : [2048, 2048];
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const ambRef = useRef<THREE.AmbientLight>(null);
  const mainDirRef = useRef<THREE.DirectionalLight>(null);
  const fillDirRef = useRef<THREE.DirectionalLight>(null);
  const yardDirRef = useRef<THREE.DirectionalLight>(null);

  const bgDay = useMemo(() => new THREE.Color('#ecebe7'), []);
  const bgNight = useMemo(() => new THREE.Color('#0c121e'), []);
  const skyDay = useMemo(() => new THREE.Color('#ffffff'), []);
  const skyNight = useMemo(() => new THREE.Color('#1e3a5f'), []);
  const gndDay = useMemo(() => new THREE.Color('#b9b4a8'), []);
  const gndNight = useMemo(() => new THREE.Color('#090d16'), []);
  const sunDay = useMemo(() => new THREE.Color('#fffaf0'), []);
  const moonNight = useMemo(() => new THREE.Color('#8ab4f8'), []);

  useFrame((state, dt) => {
    const t = isNight ? 1 : 0;
    const speed = 3.5;

    // Плавная смена фона сцены
    if (state.scene.background instanceof THREE.Color) {
      state.scene.background.lerp(isNight ? bgNight : bgDay, Math.min(1, dt * speed));
    }

    if (hemiRef.current) {
      hemiRef.current.color.lerp(isNight ? skyNight : skyDay, Math.min(1, dt * speed));
      hemiRef.current.groundColor.lerp(isNight ? gndNight : gndDay, Math.min(1, dt * speed));
      hemiRef.current.intensity = THREE.MathUtils.damp(hemiRef.current.intensity, isNight ? 0.32 : 1.15, speed, dt);
    }

    if (ambRef.current) {
      ambRef.current.intensity = THREE.MathUtils.damp(ambRef.current.intensity, isNight ? 0.14 : 0.25, speed, dt);
    }

    if (mainDirRef.current) {
      mainDirRef.current.color.lerp(isNight ? moonNight : sunDay, Math.min(1, dt * speed));
      mainDirRef.current.intensity = THREE.MathUtils.damp(mainDirRef.current.intensity, isNight ? 0.65 : 1.9, speed, dt);
      mainDirRef.current.position.x = THREE.MathUtils.damp(mainDirRef.current.position.x, isNight ? -14 : 9, speed, dt);
      mainDirRef.current.position.y = THREE.MathUtils.damp(mainDirRef.current.position.y, isNight ? 22 : 18, speed, dt);
      mainDirRef.current.position.z = THREE.MathUtils.damp(mainDirRef.current.position.z, isNight ? 18 : 12, speed, dt);
    }

    if (fillDirRef.current) {
      fillDirRef.current.intensity = THREE.MathUtils.damp(fillDirRef.current.intensity, isNight ? 0.18 : 0.45, speed, dt);
    }

    if (yardDirRef.current) {
      yardDirRef.current.intensity = THREE.MathUtils.damp(yardDirRef.current.intensity, t * 1.15, speed, dt);
    }
  });

  const { width: W, depth: D, height: H } = config.site.hall;
  const frontZ = D / 2;

  // Координаты подвесных купольных прожекторов High-Bay LED 1-го этажа
  const highBaysFloor1: [number, number, number][] = useMemo(
    () => [
      [-18.0, H - 0.12, -2.5], // Склад сырья и комплектация
      [-8.5, H - 0.12, -10.5], // Формовка и конвейер
      [-8.5, H - 0.12, 2.5], // Проход цеха
      [2.5, H - 0.12, -10.5], // Расстойка и печи
      [11.5, H - 0.12, -10.5], // Зона выпечки и шоковой заморозки
      [11.5, H - 0.12, 2.5], // Упаковка и остывание
      [20.0, H - 0.12, 1.5], // Склад готовой продукции и холодильники
      [-18.0, H - 0.12, 11.5], // Зона приёмки сырья
      [18.0, H - 0.12, 11.5], // Зона экспедиции и отгрузки
    ],
    [H],
  );

  // Светильники под перекрытием антресоли 2-го этажа (освещают тестомесы и сырьевую камеру)
  const underMezzanineLights: [number, number, number][] = useMemo(
    () => [
      [-21.5, 2.95, -14.2], // Над тестомесами mixer-1 и mixer-2
      [-14.5, 2.95, -14.2], // Над льдогенератором и сырьевой камерой
    ],
    [],
  );

  // Светильники 2-го этажа (над силосами и ПВУ)
  const mezzanineHighBays: [number, number, number][] = useMemo(
    () => [
      [-19.75, H + 2.1, -12.75], // Над силосным парком
      [11.4, H + 1.4, -14.2], // Над установкой ПВУ
    ],
    [H],
  );

  // Уличные фасадные прожекторы над рампами приёмки и отгрузки
  const facadeFloods: [number, number][] = useMemo(
    () => [
      [-20.0, frontZ], // Над рампой приёмки (Tesla Semi)
      [-14.5, frontZ],
      [14.2, frontZ], // Над рампами отгрузки (фургоны)
      [19.8, frontZ],
    ],
    [frontZ],
  );

  const coneTex = useLightConeTexture();
  const poolTex = useFloorPoolTexture();

  // Асфальтовая площадка грузового двора перед цехом (принимает тени от фургонов и Tesla Semi!)
  const yardDepth = 18.5;
  const yardCenterZ = frontZ + yardDepth / 2;

  const docks = config.supply?.layout.shippingDocks ?? [];
  const recX = config.supply?.layout.receivingDock.x ?? -20;

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

      {/* Направленный прожекторный свет с крыши цеха на грузовой двор в ночную смену */}
      <directionalLight
        ref={yardDirRef}
        position={[0, 14, frontZ - 2]}
        color="#ffe8b8"
        intensity={0}
      />

      {/* Асфальтовая площадка двора перед рампами с разметкой парковочных слотов и тенями */}
      <group>
        <MergeStatic>
          {/* Полотно асфальта двора */}
          <mesh position={[0, -0.02, yardCenterZ]} receiveShadow>
            <boxGeometry args={[W + 1.2, 0.04, yardDepth]} />
            <meshStandardMaterial color={isNight ? '#1b2028' : '#bab8b1'} roughness={0.88} metalness={0.05} />
          </mesh>
          {/* Жёлтая полоса безопасности вдоль края рампы */}
          <mesh position={[0, 0.004, frontZ + 0.18]} rotation={[-Math.PI / 2, 0, 0]} material={safetyYellowPaint} receiveShadow>
            <planeGeometry args={[W, 0.18]} />
          </mesh>
          {/* Разметка парковочного коридора тягача приёмки (Tesla Semi) */}
          {[-1.55, 1.55].map((dx) => (
            <mesh key={`rec-${dx}`} position={[recX + dx, 0.004, frontZ + 8.2]} rotation={[-Math.PI / 2, 0, 0]} material={lanePaint} receiveShadow>
              <planeGeometry args={[0.12, 14.5]} />
            </mesh>
          ))}
          {/* Разметка парковочных слотов фургонов отгрузки */}
          {docks.flatMap((d, idx) =>
            [-1.3, 1.3].map((dx) => (
              <mesh key={`dock-${idx}-${dx}`} position={[d.x + dx, 0.004, frontZ + 4.5]} rotation={[-Math.PI / 2, 0, 0]} material={lanePaint} receiveShadow>
                <planeGeometry args={[0.1, 7.2]} />
              </mesh>
            )),
          )}
        </MergeStatic>
      </group>

      {/* Корпуса промышленных светильников High-Bay LED (статическая геометрия) */}
      <MergeStatic>
        {highBaysFloor1.map(([x, y, z], i) => (
          <group key={`hb1-${i}`} position={[x, y, z]}>
            {/* Тросовый подвес */}
            <mesh position={[0, 0.18, 0]} material={fixtureRim}>
              <cylinderGeometry args={[0.02, 0.02, 0.36, 8]} />
            </mesh>
            {/* Радиатор и купол рефлектора */}
            <mesh position={[0, -0.04, 0]} material={fixtureDark} castShadow>
              <cylinderGeometry args={[0.18, 0.42, 0.22, 20]} />
            </mesh>
            <mesh position={[0, -0.15, 0]} material={fixtureRim}>
              <torusGeometry args={[0.42, 0.02, 8, 24]} />
            </mesh>
          </group>
        ))}

        {underMezzanineLights.map(([x, y, z], i) => (
          <group key={`um-${i}`} position={[x, y, z]}>
            <mesh material={fixtureDark}>
              <boxGeometry args={[1.4, 0.06, 0.24]} />
            </mesh>
          </group>
        ))}

        {floorFilter !== 1 &&
          mezzanineHighBays.map(([x, y, z], i) => (
            <group key={`hb2-${i}`} position={[x, y, z]}>
              <mesh position={[0, -0.04, 0]} material={fixtureDark}>
                <cylinderGeometry args={[0.16, 0.36, 0.2, 18]} />
              </mesh>
            </group>
          ))}

        {/* Кронштейны уличных прожекторов над рампами */}
        {facadeFloods.map(([x, z], i) => (
          <group key={`fl-${i}`} position={[x, H - 0.25, z + 0.22]}>
            <mesh position={[0, 0.06, -0.1]} material={fixtureDark}>
              <boxGeometry args={[0.08, 0.08, 0.24]} />
            </mesh>
            <mesh rotation={[0.45, 0, 0]} material={fixtureDark} castShadow>
              <boxGeometry args={[0.42, 0.24, 0.14]} />
            </mesh>
          </group>
        ))}

        {/* Светофоры рамп на фасаде (приёмка и отгрузка) */}
        {[recX, ...docks.map((d) => d.x)].map((dx, i) => (
          <group key={`tl-${i}`} position={[dx - 1.45, 2.2, frontZ + 0.06]}>
            <mesh material={fixtureDark}>
              <boxGeometry args={[0.16, 0.38, 0.1]} />
            </mesh>
            <mesh position={[0, 0.08, 0.055]} material={trafficRed}>
              <circleGeometry args={[0.045, 16]} />
            </mesh>
            <mesh position={[0, -0.08, 0.055]} material={trafficGreen}>
              <circleGeometry args={[0.045, 16]} />
            </mesh>
          </group>
        ))}
      </MergeStatic>

      {/* Излучающие LED-матрицы светильников */}
      {highBaysFloor1.map(([x, y, z], i) => (
        <mesh key={`led1-${i}`} position={[x, y - 0.152, z]} rotation={[Math.PI / 2, 0, 0]} material={isNight ? ledEmitterOn : ledEmitterOff}>
          <circleGeometry args={[0.38, 20]} />
        </mesh>
      ))}
      {underMezzanineLights.map(([x, y, z], i) => (
        <mesh key={`led-um-${i}`} position={[x, y - 0.032, z]} rotation={[Math.PI / 2, 0, 0]} material={isNight ? ledEmitterOn : ledEmitterOff}>
          <planeGeometry args={[1.32, 0.18]} />
        </mesh>
      ))}
      {facadeFloods.map(([x, z], i) => (
        <mesh key={`led-fl-${i}`} position={[x, H - 0.28, z + 0.28]} rotation={[0.45, 0, 0]} material={isNight ? floodEmitterOn : ledEmitterOff}>
          <planeGeometry args={[0.36, 0.18]} />
        </mesh>
      ))}

      {/* Ночные объёмные конусы света (Volumetric Light Cones) и физические источники света */}
      {isNight && (
        <group>
          {highBaysFloor1.map(([x, y, z], i) => (
            <group key={`cone1-${i}`} position={[x, y - 0.16, z]}>
              {/* Объёмный конус света от потолка до пола */}
              <mesh position={[0, -2.1, 0]}>
                <coneGeometry args={[2.8, 4.2, 24, 1, true]} />
                <meshBasicMaterial
                  map={coneTex}
                  transparent
                  opacity={0.42}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </mesh>
              {/* Мягкое световое пятно на полу под прожектором */}
              <mesh position={[0, -(y - 0.175), 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[6.8, 6.8]} />
                <meshBasicMaterial
                  map={poolTex}
                  transparent
                  opacity={0.55}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </mesh>
              {/* Реальный физический источник света для бликов на нержавейке (через один для 60 FPS на мобильных) */}
              {(!isMobile || i % 2 === 0) && (
                <pointLight position={[0, -0.35, 0]} color="#eef6ff" intensity={14} distance={15} decay={1.8} />
              )}
            </group>
          ))}

          {/* Подсветка под антресолью 2-го этажа (тестомесы и сырьевая зона) */}
          {underMezzanineLights.map(([x, y, z], i) => (
            <group key={`um-light-${i}`} position={[x, y - 0.1, z]}>
              <pointLight color="#fff4dc" intensity={10} distance={9} decay={1.8} />
              <mesh position={[0, -(y - 0.115), 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[4.5, 4.5]} />
                <meshBasicMaterial map={poolTex} transparent opacity={0.48} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
              </mesh>
            </group>
          ))}

          {/* Подсветка 2-го этажа (силосы, диспетчерская SCADA и ПВУ) */}
          {floorFilter !== 1 && (
            <>
              <pointLight position={[-19.75, H + 1.8, -12.75]} color="#dbeafe" intensity={16} distance={14} decay={1.8} />
              <pointLight position={[11.4, H + 1.2, -14.2]} color="#dbeafe" intensity={12} distance={12} decay={1.8} />
              {/* Изумрудно-синее свечение из панорамного окна диспетчерской SCADA */}
              <pointLight position={[0.2, 4.6, -13.2]} color="#38bdf8" intensity={10} distance={11} decay={1.8} />
            </>
          )}

          {/* Уличные конусы прожекторов над рампами приёмки и отгрузки */}
          {facadeFloods.map(([x, z], i) => (
            <group key={`fl-cone-${i}`} position={[x, H - 0.3, z + 0.3]}>
              <mesh position={[0, -2.0, 2.2]} rotation={[0.72, 0, 0]}>
                <coneGeometry args={[3.2, 5.6, 24, 1, true]} />
                <meshBasicMaterial
                  map={coneTex}
                  color="#fde68a"
                  transparent
                  opacity={0.38}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </mesh>
              <mesh position={[0, -(H - 0.315), 3.6]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[8.5, 8.5]} />
                <meshBasicMaterial
                  map={poolTex}
                  color="#fef08a"
                  transparent
                  opacity={0.45}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </mesh>
              {(!isMobile || i % 2 === 0) && (
                <pointLight position={[0, -0.5, 2.5]} color="#fde68a" intensity={16} distance={18} decay={1.7} />
              )}
            </group>
          ))}
        </group>
      )}
    </>
  );
}

/**
 * Ночные фары дальнего/ближнего света, объёмные лучи и габаритные огни для грузовиков (Truck и Tesla Semi).
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
  const coneTex = useLightConeTexture();
  const poolTex = useFloorPoolTexture();
  const xOff = width * 0.38;

  return (
    <group>
      {/* Яркие ксеноновые/LED фары кабины */}
      {[-xOff, xOff].map((x) => (
        <group key={x} position={[x, headlightY, frontZ]}>
          <mesh>
            <boxGeometry args={[0.28, 0.14, 0.04]} />
            <meshStandardMaterial color="#ffffff" emissive="#e0f2fe" emissiveIntensity={3.6} toneMapped={false} />
          </mesh>
          {/* Объёмный луч фары вперёд по двору */}
          <mesh position={[0, -0.38, 3.2]} rotation={[-Math.PI / 2 - 0.11, 0, 0]}>
            <coneGeometry args={[1.35, 6.4, 20, 1, true]} />
            <meshBasicMaterial
              map={coneTex}
              color="#e0f2fe"
              transparent
              opacity={0.42}
              depthWrite={false}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {/* Световое пятно от фар на асфальте перед кабиной */}
      <mesh position={[0, 0.018, frontZ + 3.8]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.4, 7.5]} />
        <meshBasicMaterial
          map={poolTex}
          color="#e0f2fe"
          transparent
          opacity={0.58}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* Оранжевые автопоездные огни на крыше и красные задние габариты у рампы */}
      {[-width * 0.42, 0, width * 0.42].map((x, idx) => (
        <mesh key={`roof-${idx}`} position={[x, roofY, isSemiTrailer ? 11.2 : frontZ - 1.2]}>
          <boxGeometry args={[0.14, 0.06, 0.08]} />
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={2.8} toneMapped={false} />
        </mesh>
      ))}
      {[-width * 0.42, width * 0.42].map((x, idx) => (
        <mesh key={`tail-${idx}`} position={[x, 0.65, 0.05]}>
          <boxGeometry args={[0.3, 0.12, 0.06]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={3.0} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
});
