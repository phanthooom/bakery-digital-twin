import { memo } from 'react';
import * as THREE from 'three';
import type { SiteConfig } from '@bakery/shared';
import { M } from './materials';
import { MergeStatic } from './MergeStatic';
import { FloorLabel } from './Hall';

const Y_ELEV_3 = 6.4; // Отметка перекрытия 3-го этажа, м
const T_DECK = 0.22;
const H_RAIL = 1.1;

const railYellow = new THREE.MeshStandardMaterial({ color: '#f2c200', roughness: 0.45, metalness: 0.3 });
const railBlack = new THREE.MeshStandardMaterial({ color: '#2a2d30', roughness: 0.5, metalness: 0.4 });
const labGlass = new THREE.MeshStandardMaterial({
  color: '#cde8f6',
  roughness: 0.05,
  metalness: 0.1,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const labFloorMat = new THREE.MeshStandardMaterial({ color: '#eef2f5', roughness: 0.3, metalness: 0.05 });
const hvacSilver = new THREE.MeshStandardMaterial({ color: '#c4c8cc', roughness: 0.35, metalness: 0.7 });
const chillerBlue = new THREE.MeshStandardMaterial({ color: '#1565c0', roughness: 0.4, metalness: 0.5 });
const pipeInsulatedBlue = new THREE.MeshStandardMaterial({ color: '#1e88e5', roughness: 0.3, metalness: 0.2 });
const heatOrange = new THREE.MeshStandardMaterial({ color: '#ff6f00', roughness: 0.35, metalness: 0.4 });

export interface MultistoryHvacLabProps {
  config: SiteConfig;
  floorFilter?: 'all' | 1 | 2 | 3 | 4;
  yOffset?: number; // Смещение для режима Exploded View
  isNight?: boolean;
}

export const MultistoryHvacLab = memo(function MultistoryHvacLab({
  floorFilter = 'all',
  yOffset = 0,
  isNight = false,
}: MultistoryHvacLabProps) {
  if (floorFilter !== 'all' && floorFilter !== 3) return null;

  const y = Y_ELEV_3 + yOffset;

  return (
    <group position={[0, yOffset, 0]}>
      {/* Статические конструкции 3-го этажа (перекрытие, колонны, оборудование, лаборатория) */}
      <MergeStatic>
        {/* Основное перекрытие 3-го этажа (x от -22 до +22, z от -14 до +8) */}
        <mesh position={[0, Y_ELEV_3 - T_DECK / 2, -3]} material={M.floor}>
          <boxGeometry args={[44, T_DECK, 22]} />
        </mesh>

        {/* Чистый эпоксидный пол зоны лаборатории (x от -20 до -10, z от -2 до +7) */}
        <mesh position={[-15, Y_ELEV_3 + 0.005, 2.5]} material={labFloorMat}>
          <boxGeometry args={[10, 0.01, 9]} />
        </mesh>

        {/* Стальные колонны поддержки 3-го этажа от 2-го этажа (+3.2 м до +6.4 м) */}
        {[-18, -6, 6, 18].map((cx) => (
          [-12, -2, 6].map((cz) => (
            <mesh key={`col3-${cx}-${cz}`} position={[cx, (Y_ELEV_3 + 3.2) / 2, cz]} material={M.column}>
              <boxGeometry args={[0.35, 3.2, 0.35]} />
            </mesh>
          ))
        ))}

        {/* Ограждения периметра перекрытия 3-го этажа */}
        {/* Передний край (z = +8) */}
        <mesh position={[0, Y_ELEV_3 + H_RAIL, 8]} material={railYellow}>
          <boxGeometry args={[44, 0.045, 0.045]} />
        </mesh>
        <mesh position={[0, Y_ELEV_3 + H_RAIL * 0.55, 8]} material={railBlack}>
          <boxGeometry args={[44, 0.03, 0.03]} />
        </mesh>
        <mesh position={[0, Y_ELEV_3 + 0.08, 8]} material={railYellow}>
          <boxGeometry args={[44, 0.14, 0.02]} />
        </mesh>

        {/* ── 1. Венткомплекс AHU-1 с рекуператором тепла (x = +6.5, z = -10.5) ── */}
        <group position={[6.5, Y_ELEV_3, -10.5]}>
          {/* Корпус центрального кондиционера AHU */}
          <mesh position={[0, 1.4, 0]} material={hvacSilver}>
            <boxGeometry args={[5.2, 2.4, 2.8]} />
          </mesh>
          {/* Секция рекуператора тепла уходящих газов печей (оранжевая индикация утилизации) */}
          <mesh position={[1.4, 1.4, 0]} material={heatOrange}>
            <boxGeometry args={[1.8, 2.1, 2.6]} />
          </mesh>
          {/* Вытяжные вентиляционные короба вниз к печам 1-го этажа */}
          <mesh position={[1.4, -1.6, 0]} material={hvacSilver}>
            <boxGeometry args={[1.2, 3.2, 1.2]} />
          </mesh>
        </group>

        {/* ── 2. Чиллерная станция ледяной воды +2 °C (x = -6.5, z = -10.5) ── */}
        <group position={[-6.5, Y_ELEV_3, -10.5]}>
          {/* Рама и корпус водоохладителя */}
          <mesh position={[0, 1.2, 0]} material={chillerBlue}>
            <boxGeometry args={[4.4, 2.0, 2.6]} />
          </mesh>
          {/* Буферные цилиндрические баки-аккумуляторы ледяной воды (+2 °C) */}
          <mesh position={[-1.4, 1.4, 0]} material={pipeInsulatedBlue}>
            <cylinderGeometry args={[0.7, 0.7, 2.4, 24]} />
          </mesh>
          <mesh position={[-0.1, 1.4, 0]} material={pipeInsulatedBlue}>
            <cylinderGeometry args={[0.7, 0.7, 2.4, 24]} />
          </mesh>
          {/* Сдвоенная насосная группа Grundfos Hydro MPC */}
          <mesh position={[1.4, 0.6, 0.6]} material={M.steelDark}>
            <boxGeometry args={[0.9, 0.9, 0.9]} />
          </mesh>
          <mesh position={[1.4, 0.6, -0.6]} material={M.steelDark}>
            <boxGeometry args={[0.9, 0.9, 0.9]} />
          </mesh>
        </group>

        {/* ── 3. Производственная лаборатория QC Lab (x от -20 до -10, z от -2 до +7) ── */}
        <group position={[-15, Y_ELEV_3, 2.5]}>
          {/* Перегородки из стекла и анодированного алюминия */}
          <mesh position={[0, 1.4, -4.5]} material={labGlass}>
            <boxGeometry args={[10, 2.8, 0.06]} />
          </mesh>
          <mesh position={[5, 1.4, 0]} material={labGlass}>
            <boxGeometry args={[0.06, 2.8, 9]} />
          </mesh>
          {/* Алюминиевый каркас остекления */}
          <mesh position={[0, 2.8, -4.5]} material={M.steel}>
            <boxGeometry args={[10, 0.08, 0.08]} />
          </mesh>
          <mesh position={[5, 2.8, 0]} material={M.steel}>
            <boxGeometry args={[0.08, 2.8, 0.08]} />
          </mesh>

          {/* Лабораторные столы и оборудование */}
          {/* Стол с аналитическими весами и сушильным шкафом СЭШ-3М */}
          <mesh position={[-3.5, 0.45, -3.2]} material={M.steel}>
            <boxGeometry args={[2.4, 0.9, 1.0]} />
          </mesh>
          <mesh position={[-3.5, 1.15, -3.2]} material={M.steelLight}>
            <boxGeometry args={[0.6, 0.5, 0.5]} />
          </mesh>

          {/* Стол фаринографа Брабендера */}
          <mesh position={[2.5, 0.45, -3.2]} material={M.steel}>
            <boxGeometry args={[2.4, 0.9, 1.0]} />
          </mesh>
          <mesh position={[2.5, 1.2, -3.2]} material={chillerBlue}>
            <boxGeometry args={[0.9, 0.6, 0.6]} />
          </mesh>

          {/* Центральный островной стол для контроля выпечки */}
          <mesh position={[0, 0.45, 0.5]} material={M.steel}>
            <boxGeometry args={[3.2, 0.9, 1.4]} />
          </mesh>
        </group>
      </MergeStatic>

      {/* Мягкий люминесцентный свет лаборатории при ночной смене */}
      {isNight && (
        <pointLight position={[-15, Y_ELEV_3 + 2.4, 2.5]} color="#d6f0ff" intensity={1.8} distance={12} decay={2} />
      )}

      {/* Информационные 3D-подписи зон */}
      <FloorLabel
        text="08.1 ВЕНТКОМПЛЕКС AHU-1 · РЕКУПЕРАЦИЯ ТЕПЛА"
        x={6.5}
        y={Y_ELEV_3 + 0.013}
        z={-7.5}
        height={0.34}
        color="#e65100"
      />
      <FloorLabel
        text="08.2 ЧИЛЛЕРНАЯ СТАНЦИЯ (+2 °C ЛЕДЯНАЯ ВОДА)"
        x={-6.5}
        y={Y_ELEV_3 + 0.013}
        z={-7.5}
        height={0.34}
        color="#1565c0"
      />
      <FloorLabel
        text="08.3 ПРОИЗВОДСТВЕННАЯ QC ЛАБОРАТОРИЯ (ГОСТ 26574)"
        x={-15}
        y={Y_ELEV_3 + 0.013}
        z={7.5}
        height={0.34}
        color="#2e7d32"
      />
    </group>
  );
});
