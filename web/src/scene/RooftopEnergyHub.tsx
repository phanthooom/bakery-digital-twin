import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SiteConfig } from '@bakery/shared';
import { M } from './materials';
import { MergeStatic } from './MergeStatic';
import { FloorLabel } from './Hall';

const Y_ELEV_4 = 9.6; // Отметка кровли 4-го этажа, м
const T_ROOF = 0.25;

const solarPanelMat = new THREE.MeshStandardMaterial({
  color: '#0d223a',
  roughness: 0.15,
  metalness: 0.85,
});
const solarFrameMat = new THREE.MeshStandardMaterial({ color: '#889098', roughness: 0.4, metalness: 0.6 });
const dguGreen = new THREE.MeshStandardMaterial({ color: '#2e4c38', roughness: 0.5, metalness: 0.3 });
const parapetMat = new THREE.MeshStandardMaterial({ color: '#cfd2d6', roughness: 0.6, metalness: 0.1 });
const skylightGlass = new THREE.MeshStandardMaterial({
  color: '#e2f4ff',
  roughness: 0.08,
  metalness: 0.2,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
  side: THREE.DoubleSide,
});

export interface RooftopEnergyHubProps {
  config: SiteConfig;
  floorFilter?: 'all' | 1 | 2 | 3 | 4;
  yOffset?: number; // Смещение для режима Exploded View
  isNight?: boolean;
  explodedView?: boolean;
}

export const RooftopEnergyHub = memo(function RooftopEnergyHub({
  config,
  floorFilter = 'all',
  yOffset = 0,
  isNight = false,
  explodedView = false,
}: RooftopEnergyHubProps) {
  const beaconRef = useRef<THREE.PointLight>(null);

  // Пульсация красного авиационного маяка ЗОМ на мачте метеостанции
  useFrame((state) => {
    if (beaconRef.current && isNight) {
      const pulse = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 4.0);
      beaconRef.current.intensity = 1.0 + 3.0 * Math.pow(pulse, 3);
    }
  });

  if (floorFilter !== 'all' && floorFilter !== 4) return null;
  if (floorFilter === 'all' && !explodedView) return null;

  const { width: W, depth: D } = config.site.hall;
  const halfW = W / 2;
  const halfD = D / 2;

  return (
    <group position={[0, yOffset, 0]}>
      {/* Статические конструкции кровли (плита, парапет, фермы СЭС, чиллеры, ДГУ, фонари) */}
      <MergeStatic>
        {/* Кровельная плита на всю ширину и глубину здания (54 × 35 м) */}
        <mesh position={[0, Y_ELEV_4 - T_ROOF / 2, 0]} material={M.floor}>
          <boxGeometry args={[W, T_ROOF, D]} />
        </mesh>

        {/* Защитные парапеты по периметру кровли (высота 0.9 м) */}
        {/* Задний парапет (z = -halfD) */}
        <mesh position={[0, Y_ELEV_4 + 0.45, -halfD]} material={parapetMat}>
          <boxGeometry args={[W, 0.9, 0.3]} />
        </mesh>
        {/* Передний парапет (z = +halfD) */}
        <mesh position={[0, Y_ELEV_4 + 0.45, halfD]} material={parapetMat}>
          <boxGeometry args={[W, 0.9, 0.3]} />
        </mesh>
        {/* Левый парапет (x = -halfW) */}
        <mesh position={[-halfW, Y_ELEV_4 + 0.45, 0]} material={parapetMat}>
          <boxGeometry args={[0.3, 0.9, D]} />
        </mesh>
        {/* Правый парапет (x = +halfW) */}
        <mesh position={[halfW, Y_ELEV_4 + 0.45, 0]} material={parapetMat}>
          <boxGeometry args={[0.3, 0.9, D]} />
        </mesh>

        {/* ── 1. Солнечная электростанция (СЭС / Rooftop Solar PV) ── */}
        {/* Ряды панелей, ориентированных на юг под углом 15° (x от -20 до -2, z от -10 до +10) */}
        {[-8, -3, 2, 7].map((rowZ) => (
          [-19, -15, -11, -7].map((colX) => (
            <group key={`pv-${colX}-${rowZ}`} position={[colX, Y_ELEV_4 + 0.4, rowZ]} rotation={[0.26, 0, 0]}>
              {/* Фотоэлектрический модуль 2.2 × 1.1 м */}
              <mesh position={[0, 0, 0]} material={solarPanelMat}>
                <boxGeometry args={[3.4, 0.04, 1.8]} />
              </mesh>
              {/* Алюминиевая опорная стойка */}
              <mesh position={[0, -0.3, -0.6]} material={solarFrameMat}>
                <boxGeometry args={[3.2, 0.6, 0.06]} />
              </mesh>
            </group>
          ))
        ))}

        {/* Опорный железобетонный фундамент под сухие градирни ДК-1 / ДК-2 */}
        <mesh position={[-6.5, Y_ELEV_4 + 0.1, -9.0]} material={parapetMat}>
          <boxGeometry args={[4.8, 0.2, 3.0]} />
        </mesh>

        {/* ── 3. Зенитные световые пирамидальные фонари (Skylights) ── */}
        {[-3, 4, 11].map((sx, i) => (
          <group key={`sky-${i}`} position={[sx, Y_ELEV_4, 2]}>
            <mesh position={[0, 0.6, 0]} material={skylightGlass} rotation={[0, Math.PI / 4, 0]}>
              <coneGeometry args={[1.6, 1.2, 4]} />
            </mesh>
            <mesh position={[0, 0.1, 0]} material={parapetMat}>
              <boxGeometry args={[2.4, 0.2, 2.4]} />
            </mesh>
          </group>
        ))}

        {/* ── 4. Опорный фундамент и кабельный ввод резервного ДГУ 250 кВА (x = +16.0, z = -8.0) ── */}
        <mesh position={[16.0, Y_ELEV_4 + 0.1, -8.0]} material={parapetMat}>
          <boxGeometry args={[5.0, 0.2, 2.8]} />
        </mesh>

        {/* ── 5. Метеостанция цеха (мачта 4.5 м, x = -21, z = 12) ── */}
        <group position={[-21, Y_ELEV_4, 12]}>
          {/* Трубчатая мачта */}
          <mesh position={[0, 2.25, 0]} material={solarFrameMat}>
            <cylinderGeometry args={[0.06, 0.08, 4.5, 12]} />
          </mesh>
          {/* Траверса с датчиками (анемометр и пиранометр) */}
          <mesh position={[0, 4.3, 0]} material={M.steel}>
            <boxGeometry args={[0.8, 0.04, 0.04]} />
          </mesh>
        </group>
      </MergeStatic>

      {/* Красный маяк авиационной безопасности (ЗОМ) на верхушке метеомачты */}
      {isNight && (
        <group position={[-21, Y_ELEV_4 + 4.6, 12]}>
          <mesh>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshBasicMaterial color="#ff1744" />
          </mesh>
          <pointLight ref={beaconRef} color="#ff1744" distance={25} decay={2} />
        </group>
      )}

      {/* Информационные 3D-подписи кровли */}
      <FloorLabel
        text="08.4 КРОВЕЛЬНАЯ СОЛНЕЧНАЯ ЭЛЕКТРОСТАНЦИЯ (СЭС 60 кВт)"
        x={-13}
        y={Y_ELEV_4 + 0.013}
        z={-11.5}
        height={0.34}
        color="#fbc02d"
      />
      <FloorLabel
        text="08.5 ДРАЙКУЛЕРЫ ОХЛАЖДЕНИЯ ДК-1 / ДК-2"
        x={-6.5}
        y={Y_ELEV_4 + 0.013}
        z={-6.5}
        height={0.34}
        color="#0288d1"
      />
      <FloorLabel
        text="08.6 РЕЗЕРВНЫЙ ДГУ CUMMINS 250 кВА С АВР"
        x={16}
        y={Y_ELEV_4 + 0.013}
        z={-5.0}
        height={0.34}
        color="#388e3c"
      />
    </group>
  );
});
