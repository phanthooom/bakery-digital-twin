import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { FloorRect, SiteConfig } from '@bakery/shared';
import { M } from './materials';
import { MergeStatic } from './MergeStatic';
import { FloorLabel } from './Hall';

const H_RAIL = 1.1; // высота перил, м
const Y_ELEV = 3.2; // отметка верха перекрытия 2-го этажа, м
const T_DECK = 0.22; // толщина перекрытия
const railYellow = new THREE.MeshStandardMaterial({ color: '#f2c200', roughness: 0.45, metalness: 0.3 });
const railBlack = new THREE.MeshStandardMaterial({ color: '#2a2d30', roughness: 0.5, metalness: 0.4 });
const glassControl = new THREE.MeshStandardMaterial({
  color: '#aed8f2',
  roughness: 0.08,
  metalness: 0.15,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const sightGlassMat = new THREE.MeshStandardMaterial({
  color: '#d6edff',
  roughness: 0.1,
  metalness: 0.2,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/** Промышленное защитное ограждение (перила с леерами и стойками). */
function Railing({ a, b, openStart = false, openEnd = false }: { a: [number, number]; b: [number, number]; openStart?: boolean; openEnd?: boolean }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.2) return null;
  const ang = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  const postsCount = Math.max(2, Math.round(len / 1.4) + 1);
  const posts = Array.from({ length: postsCount }, (_, i) => (len / (postsCount - 1)) * i);

  return (
    <group position={[a[0], Y_ELEV, a[1]]} rotation={[0, ang, 0]}>
      {/* верхний поручень (сигнальный желтый) */}
      <mesh position={[len / 2, H_RAIL, 0]} material={railYellow} castShadow>
        <boxGeometry args={[len, 0.045, 0.045]} />
      </mesh>
      {/* средний леер безопасности */}
      <mesh position={[len / 2, H_RAIL * 0.55, 0]} material={railBlack}>
        <boxGeometry args={[len, 0.03, 0.03]} />
      </mesh>
      {/* плинтус/бортик безопасности у пола */}
      <mesh position={[len / 2, 0.08, 0]} material={railYellow}>
        <boxGeometry args={[len, 0.14, 0.02]} />
      </mesh>
      {/* вертикальные стойки */}
      {posts.map((x, i) => {
        if ((i === 0 && openStart) || (i === postsCount - 1 && openEnd)) return null;
        return (
          <mesh key={i} position={[x, H_RAIL / 2, 0]} material={railBlack} castShadow>
            <boxGeometry args={[0.04, H_RAIL, 0.04]} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Маршевая стальная лестница с отметки 0 до Y_ELEV. */
function Staircase({ from, to, width = 1.1 }: { from: [number, number]; to: [number, number]; width?: number }) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const ang = -Math.atan2(dz, dx);
  const steps = 15;
  const stepH = Y_ELEV / steps;
  const stepL = len / steps;

  return (
    <group position={[from[0], 0, from[1]]} rotation={[0, ang, 0]}>
      {/* ступени */}
      {Array.from({ length: steps }, (_, i) => (
        <group key={i} position={[i * stepL + stepL / 2, (i + 1) * stepH - stepH / 2, 0]}>
          <mesh material={M.steel} castShadow receiveShadow>
            <boxGeometry args={[stepL + 0.04, 0.04, width]} />
          </mesh>
          <mesh position={[-stepL / 2, -stepH / 2 + 0.02, 0]} material={M.steelDark}>
            <boxGeometry args={[0.02, stepH, width]} />
          </mesh>
        </group>
      ))}

      {/* боковые наклонные косоуры и перила лестницы */}
      {[-width / 2, width / 2].map((z, idx) => (
        <group key={idx} position={[len / 2, Y_ELEV / 2, z]}>
          <mesh rotation={[0, 0, Math.atan2(Y_ELEV, len)]} material={M.steelDark} castShadow>
            <boxGeometry args={[Math.hypot(len, Y_ELEV), 0.16, 0.03]} />
          </mesh>
          <mesh position={[0, H_RAIL, 0]} rotation={[0, 0, Math.atan2(Y_ELEV, len)]} material={railYellow} castShadow>
            <boxGeometry args={[Math.hypot(len, Y_ELEV) + 0.2, 0.04, 0.04]} />
          </mesh>
          {[0.2, 0.5, 0.8].map((f) => (
            <mesh key={f} position={[(f - 0.5) * len, (f - 0.5) * Y_ELEV + H_RAIL / 2, 0]} material={railBlack}>
              <boxGeometry args={[0.04, H_RAIL, 0.04]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Настил отдельной площадки 2-го этажа. */
function Deck({ zone, hasPerimeterRails = true, id }: { zone: FloorRect; hasPerimeterRails?: boolean; id?: string }) {
  const w = zone.x1 - zone.x0;
  const d = zone.z1 - zone.z0;
  const cx = (zone.x0 + zone.x1) / 2;
  const cz = (zone.z0 + zone.z1) / 2;

  const cols: [number, number][] = [
    [zone.x0 + 0.2, zone.z0 + 0.2],
    [zone.x1 - 0.2, zone.z0 + 0.2],
    [zone.x0 + 0.2, zone.z1 - 0.2],
    [zone.x1 - 0.2, zone.z1 - 0.2],
  ];

  return (
    <group>
      <MergeStatic>
        {cols.map(([x, z], i) => (
          <mesh key={i} position={[x, (Y_ELEV - T_DECK) / 2, z]} material={M.steelDark} castShadow receiveShadow>
            <boxGeometry args={[0.22, Y_ELEV - T_DECK, 0.22]} />
          </mesh>
        ))}

        <mesh position={[cx, Y_ELEV - T_DECK / 2, cz]} material={M.steelDark} castShadow>
          <boxGeometry args={[w, T_DECK * 0.7, d]} />
        </mesh>

        <mesh position={[cx, Y_ELEV - 0.02, cz]} material={M.steel} receiveShadow>
          <boxGeometry args={[w, 0.04, d]} />
        </mesh>
      </MergeStatic>

      {hasPerimeterRails && (
        <>
          <Railing a={[zone.x0, zone.z0]} b={[zone.x1, zone.z0]} />
          {id === 'deck-silos' ? (
            <Railing a={[zone.x1, zone.z0]} b={[zone.x1, -10.5]} />
          ) : (
            <Railing a={[zone.x1, zone.z0]} b={[zone.x1, zone.z1]} />
          )}
          <Railing a={[zone.x1, zone.z1]} b={[zone.x0, zone.z1]} />
          <Railing a={[zone.x0, zone.z1]} b={[zone.x0, zone.z0]} />
        </>
      )}
    </group>
  );
}

/** Фигурка дежурного оператора-технолога за пультом SCADA. */
function TechnologistOperator({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* тело в белом рабочем халате */}
      <mesh position={[0, 0.95, 0]} material={M.wallPanel} castShadow>
        <cylinderGeometry args={[0.18, 0.16, 0.65, 12]} />
      </mesh>
      {/* голова и защитная шапочка/каска */}
      <mesh position={[0, 1.4, 0]} material={M.steelLight}>
        <sphereGeometry args={[0.11, 16, 12]} />
      </mesh>
      <mesh position={[0, 1.46, 0]} material={M.window}>
        <sphereGeometry args={[0.115, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
      </mesh>
      {/* руки на пульте управления */}
      <mesh position={[-0.22, 0.92, -0.15]} rotation={[0.6, 0, 0]} material={M.wallPanel}>
        <cylinderGeometry args={[0.04, 0.04, 0.4, 8]} />
      </mesh>
      <mesh position={[0.22, 0.92, -0.15]} rotation={[0.6, 0, 0]} material={M.wallPanel}>
        <cylinderGeometry args={[0.04, 0.04, 0.4, 8]} />
      </mesh>
      {/* брюки/обувь */}
      {[-0.08, 0.08].map((dx) => (
        <mesh key={dx} position={[dx, 0.35, 0]} material={M.steelDark}>
          <cylinderGeometry args={[0.06, 0.055, 0.7, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/** Диспетчерская SCADA / операторская над бытовыми помещениями. */
function ControlRoom({ zone }: { zone: FloorRect }) {
  const w = zone.x1 - zone.x0;
  const d = zone.z1 - zone.z0;
  const cx = (zone.x0 + zone.x1) / 2;
  const cz = (zone.z0 + zone.z1) / 2;
  const roomH = 2.5;

  return (
    <group>
      <MergeStatic>
        {/* задняя и боковые стены кабинета */}
        <mesh position={[cx, Y_ELEV + roomH / 2, zone.z1 - 0.06]} material={M.wallPanel}>
          <boxGeometry args={[w, roomH, 0.12]} />
        </mesh>
        <mesh position={[zone.x0 + 0.06, Y_ELEV + roomH / 2, cz]} material={M.wallPanel}>
          <boxGeometry args={[0.12, roomH, d]} />
        </mesh>
        <mesh position={[zone.x1 - 0.06, Y_ELEV + roomH / 2, cz]} material={M.wallPanel}>
          <boxGeometry args={[0.12, roomH, d]} />
        </mesh>

        {/* потолок диспетчерской */}
        <mesh position={[cx, Y_ELEV + roomH, cz]} material={M.steelDark}>
          <boxGeometry args={[w, 0.1, d]} />
        </mesh>

        {/* стол операторов SCADA с мониторами */}
        <group position={[cx, Y_ELEV, zone.z0 + 2.2]}>
          <mesh position={[0, 0.74, 0]} material={M.steel}>
            <boxGeometry args={[3.2, 0.05, 1.1]} />
          </mesh>
          {[-1.4, 1.4].map((x) => (
            <mesh key={x} position={[x, 0.36, 0]} material={M.steelDark}>
              <boxGeometry args={[0.08, 0.72, 0.9]} />
            </mesh>
          ))}
          {/* 3 стойки мониторов */}
          {[-0.9, 0, 0.9].map((mx) => (
            <group key={mx} position={[mx, 0.78, -0.15]}>
              <mesh position={[0, 0.3, 0]} material={M.black}>
                <boxGeometry args={[0.7, 0.45, 0.04]} />
              </mesh>
              <mesh position={[0, 0.1, 0]} material={M.steelDark}>
                <cylinderGeometry args={[0.03, 0.03, 0.2, 10]} />
              </mesh>
            </group>
          ))}
        </group>

        {/* серверные шкафы 19" SCADA в углу */}
        {[-1.2, -0.4].map((dx) => (
          <group key={dx} position={[zone.x1 - 1.2 + dx, Y_ELEV, zone.z1 - 0.7]}>
            <mesh position={[0, 1.0, 0]} material={M.black} castShadow>
              <boxGeometry args={[0.65, 2.0, 0.8]} />
            </mesh>
            <mesh position={[0, 1.0, -0.41]} material={M.steelDark}>
              <boxGeometry args={[0.55, 1.85, 0.02]} />
            </mesh>
          </group>
        ))}
      </MergeStatic>

      {/* фигурка дежурного оператора за пультом */}
      <TechnologistOperator position={[cx, Y_ELEV, zone.z0 + 2.75]} />

      {/* панорамный стеклянный витраж с видом вниз на цех */}
      <group position={[cx, Y_ELEV + roomH / 2, zone.z0 + 0.05]}>
        <mesh material={glassControl}>
          <planeGeometry args={[w - 0.2, roomH - 0.1]} />
        </mesh>
        {/* металлокаркас витража */}
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} position={[-w / 2 + 0.1 + (i * (w - 0.2)) / 4, 0, 0]} material={M.steelDark}>
            <boxGeometry args={[0.06, roomH, 0.06]} />
          </mesh>
        ))}
      </group>

      {/* экраны SCADA с яркой мнемосхемой и графиками */}
      <mesh position={[cx - 0.9, Y_ELEV + 1.08, zone.z0 + 2.03]}>
        <planeGeometry args={[0.66, 0.41]} />
        <meshStandardMaterial color="#0b2545" emissive="#1d5c96" emissiveIntensity={0.8} roughness={0.2} toneMapped={false} />
      </mesh>
      <mesh position={[cx, Y_ELEV + 1.08, zone.z0 + 2.03]}>
        <planeGeometry args={[0.66, 0.41]} />
        <meshStandardMaterial color="#1a3a2a" emissive="#26a269" emissiveIntensity={0.9} roughness={0.2} toneMapped={false} />
      </mesh>
      <mesh position={[cx + 0.9, Y_ELEV + 1.08, zone.z0 + 2.03]}>
        <planeGeometry args={[0.66, 0.41]} />
        <meshStandardMaterial color="#40200b" emissive="#c67817" emissiveIntensity={0.8} roughness={0.2} toneMapped={false} />
      </mesh>

      {/* светодиодные индикаторы серверной стойки */}
      <mesh position={[zone.x1 - 1.6, Y_ELEV + 1.4, zone.z1 - 1.12]}>
        <planeGeometry args={[0.4, 0.8]} />
        <meshStandardMaterial color="#00ff66" emissive="#00ff66" emissiveIntensity={0.9} roughness={0.1} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Смотровой мостик (Catwalk) между площадками с перилами. */
function Catwalk({ points, width = 1.2 }: { points: [number, number][]; width?: number }) {
  if (points.length < 2) return null;

  return (
    <group>
      {points.slice(1).map((b, i) => {
        const a = points[i]!;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ang = -Math.atan2(b[1] - a[1], b[0] - a[0]);
        const midX = (a[0] + b[0]) / 2;
        const midZ = (a[1] + b[1]) / 2;

        return (
          <group key={i} position={[midX, Y_ELEV, midZ]} rotation={[0, ang, 0]}>
            <mesh position={[0, -0.02, 0]} material={M.steel} receiveShadow>
              <boxGeometry args={[len + 0.1, 0.04, width]} />
            </mesh>
            {[-width / 2, width / 2].map((z, idx) => (
              <mesh key={idx} position={[0, -0.08, z]} material={M.steelDark} castShadow>
                <boxGeometry args={[len + 0.1, 0.14, 0.04]} />
              </mesh>
            ))}
            <group position={[-len / 2, 0, width / 2]}>
              <Railing a={[0, 0]} b={[len, 0]} />
            </group>
            <group position={[-len / 2, 0, -width / 2]}>
              <Railing a={[0, 0]} b={[len, 0]} />
            </group>
          </group>
        );
      })}
    </group>
  );
}

/** Динамический поток муки по прозрачному участку смотрового стекла пневмопровода. */
function FlourFlow({ active = false }: { active?: boolean }) {
  const beadsRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!beadsRef.current) return;
    const speed = active ? 2.5 : 0.4;
    const time = state.clock.elapsedTime * speed;
    beadsRef.current.children.forEach((mesh, idx) => {
      const offset = (idx / 6 + time) % 1;
      mesh.position.y = 2.05 - offset * 0.35;
      mesh.scale.setScalar(0.015 + Math.sin(offset * Math.PI) * 0.012);
    });
  });

  return (
    <group ref={beadsRef}>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} material={M.dough}>
          <sphereGeometry args={[1, 8, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/** Трубы пневмотранспорта муки от силосов мезонина вниз в тестомесы цеха. */
function FlourPipes({ activeFlourTransfer = false }: { activeFlourTransfer?: boolean }) {
  return (
    <group>
      {/* Спуск от Силоса №1 (Мука в/с) к Тестомесу 1 (mixer-1) */}
      <group position={[-23.0, 0, -12.75]}>
        {/* верхний вертикальный участок из конуса силоса */}
        <mesh position={[0, 2.5, 0]} material={M.chrome} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 1.4, 16]} />
        </mesh>
        {/* фланец и пневмозаслонка */}
        <mesh position={[0, 2.3, 0]} material={M.steelDark}>
          <cylinderGeometry args={[0.13, 0.13, 0.12, 16]} />
        </mesh>
        <mesh position={[0.11, 2.3, 0]}>
          <sphereGeometry args={[0.03, 10, 8]} />
          <meshStandardMaterial
            color={activeFlourTransfer ? '#00ff66' : '#888888'}
            emissive={activeFlourTransfer ? '#00ff66' : '#222222'}
            emissiveIntensity={activeFlourTransfer ? 1.0 : 0.1}
          />
        </mesh>

        {/* смотровое стекло (Sight Glass) */}
        <mesh position={[0, 1.9, 0]} material={sightGlassMat}>
          <cylinderGeometry args={[0.082, 0.082, 0.4, 16]} />
        </mesh>
        {/* динамические частицы муки в стекле */}
        <FlourFlow active={activeFlourTransfer} />

        {/* нижний наклонный участок прямо в дежу mixer-1 */}
        <mesh position={[0, 1.15, -1.3]} rotation={[0.42, 0, 0]} material={M.chrome} castShadow>
          <cylinderGeometry args={[0.075, 0.075, 2.2, 16]} />
        </mesh>
        {/* выпускной патрубок / тканевый рукав над дежой */}
        <mesh position={[0, 0.72, -2.55]} material={M.sack}>
          <cylinderGeometry args={[0.16, 0.12, 0.4, 16]} />
        </mesh>
      </group>

      {/* Спуск от Силоса №2 (Мука 1/с) к Тестомесу 2 (mixer-2) */}
      <group position={[-19.75, 0, -12.75]}>
        <mesh position={[0, 2.5, 0]} material={M.chrome} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 1.4, 16]} />
        </mesh>
        <mesh position={[0, 2.3, 0]} material={M.steelDark}>
          <cylinderGeometry args={[0.13, 0.13, 0.12, 16]} />
        </mesh>
        <mesh position={[0, 1.9, 0]} material={sightGlassMat}>
          <cylinderGeometry args={[0.082, 0.082, 0.4, 16]} />
        </mesh>
        <mesh position={[0, 1.15, -1.3]} rotation={[0.42, 0, 0]} material={M.chrome} castShadow>
          <cylinderGeometry args={[0.075, 0.075, 2.2, 16]} />
        </mesh>
        <mesh position={[0, 0.72, -2.55]} material={M.sack}>
          <cylinderGeometry args={[0.16, 0.12, 0.4, 16]} />
        </mesh>
      </group>

      {/* Спуск от Силоса №3 (Мука ржаная) в коллектор */}
      <group position={[-16.5, 0, -12.75]}>
        <mesh position={[0, 2.3, 0]} material={M.chrome} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 1.8, 16]} />
        </mesh>
        <mesh position={[-1.6, 2.2, -0.6]} rotation={[0, 0, Math.PI / 2]} material={M.chrome} castShadow>
          <cylinderGeometry args={[0.065, 0.065, 3.2, 16]} />
        </mesh>
        <mesh position={[-3.2, 1.5, -1.95]} rotation={[0.42, 0, 0]} material={M.chrome}>
          <cylinderGeometry args={[0.065, 0.065, 1.8, 16]} />
        </mesh>
      </group>
    </group>
  );
}

/** Воздуховоды рекуперации тепла от печей к установке ПВУ на мезонине. */
function HeatRecoveryDucts() {
  return (
    <group>
      <group position={[9.2, 0, -14.2]}>
        <mesh position={[0, 3.1, 0.5]} rotation={[0.2, 0, 0]} material={M.pipe} castShadow>
          <cylinderGeometry args={[0.13, 0.13, 1.2, 20]} />
        </mesh>
        <mesh position={[1.1, 3.6, 1.6]} rotation={[0, 0, Math.PI / 2]} material={M.pipe}>
          <cylinderGeometry args={[0.14, 0.14, 2.4, 20]} />
        </mesh>
      </group>

      <group position={[13.6, 0, -14.2]}>
        <mesh position={[0, 3.1, 0.5]} rotation={[0.2, 0, 0]} material={M.pipe} castShadow>
          <cylinderGeometry args={[0.13, 0.13, 1.2, 20]} />
        </mesh>
        <mesh position={[-1.1, 3.6, 1.6]} rotation={[0, 0, Math.PI / 2]} material={M.pipe}>
          <cylinderGeometry args={[0.14, 0.14, 2.4, 20]} />
        </mesh>
      </group>
    </group>
  );
}

export interface MezzanineProps {
  config: SiteConfig;
  floorFilter?: 'all' | 1 | 2;
  activeFlourTransfer?: boolean;
}

/** 3D-конструкция 2-го этажа (мезонина): перекрытия, лестницы, диспетчерская, мостики, трубы. */
export const Mezzanine = memo(function Mezzanine({ config, floorFilter = 'all', activeFlourTransfer = false }: MezzanineProps) {
  const mez = config.mezzanine;
  if (!mez || floorFilter === 1) return null;

  const controlDeck = mez.decks.find((d) => d.id === 'deck-control');
  const otherDecks = mez.decks.filter((d) => d.id !== 'deck-control');

  return (
    <group>
      {/* площадки перекрытия */}
      {otherDecks.map((d) => (
        <group key={d.id}>
          <Deck zone={d.zone} id={d.id} />
          <FloorLabel text={d.name.toUpperCase()} x={d.zone.x0 + 0.5} z={d.zone.z1 - 0.6} height={0.36} color="#606468" />
        </group>
      ))}

      {/* площадка диспетчерской SCADA (АБК) */}
      {controlDeck && (
        <group>
          <Deck zone={controlDeck.zone} hasPerimeterRails={false} />
          <ControlRoom zone={controlDeck.zone} />
          <FloorLabel text="02 ДИСПЕТЧЕРСКАЯ SCADA" x={controlDeck.zone.x0 + 0.5} z={controlDeck.zone.z0 + 0.8} height={0.34} color="#3b6998" />
        </group>
      )}

      {/* лестничные марши с 1-го этажа на 2-й */}
      {mez.stairs.map((st) => (
        <Staircase key={st.id} from={st.from} to={st.to} width={st.width} />
      ))}

      {/* смотровой переходной мостик (Catwalk) */}
      {mez.catwalk && <Catwalk points={mez.catwalk.points} width={mez.catwalk.width} />}

      {/* технологические коммуникации: спуск муки и рекуперация тепла */}
      <FlourPipes activeFlourTransfer={activeFlourTransfer} />
      <HeatRecoveryDucts />
    </group>
  );
});
