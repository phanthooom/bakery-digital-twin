import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { M } from '../materials';
import { Screen } from './parts';
import type { BodyProps } from './specs';

/**
 * Приточно-вытяжная установка с пластинчатым рекуператором тепла (HVAC):
 * секционный корпус из сэндвич-панелей, воздуховоды притока и вытяжки,
 * смотровые иллюминаторы и шкаф автоматики.
 */
export function Hvac({ live }: BodyProps) {
  const fanRef = useRef<THREE.Group>(null);
  const active = live.status === 'running' || live.status === 'alarm';

  useFrame((_, dt) => {
    if (fanRef.current && active) {
      fanRef.current.rotation.z += dt * (4 + live.load * 8);
    }
  });

  return (
    <group>
      {/* опорная рама */}
      <mesh position={[0, 0.08, 0]} material={M.steelDark} castShadow>
        <boxGeometry args={[3.0, 0.16, 1.8]} />
      </mesh>

      {/* основной корпус установки (3 секции: фильтрация, рекуператор, вентиляторы) */}
      <RoundedBox args={[2.9, 1.5, 1.7]} radius={0.04} position={[0, 0.9, 0]} material={M.steelLight} castShadow receiveShadow />

      {/* секция пластинчатого рекуператора тепла в центре */}
      <mesh position={[0, 0.9, 0.86]} material={M.chrome}>
        <boxGeometry args={[0.9, 1.2, 0.04]} />
      </mesh>

      {/* смотровой иллюминатор вентиляторной секции */}
      <mesh position={[0.85, 0.95, 0.86]} rotation={[Math.PI / 2, 0, 0]} material={M.steelDark}>
        <cylinderGeometry args={[0.22, 0.22, 0.04, 24]} />
      </mesh>
      <mesh position={[0.85, 0.95, 0.88]}>
        <circleGeometry args={[0.18, 24]} />
        <meshStandardMaterial color="#1a3249" roughness={0.1} metalness={0.2} transparent opacity={0.4} />
      </mesh>

      {/* вращающаяся крыльчатка вентилятора за стеклом */}
      <group ref={fanRef} position={[0.85, 0.95, 0.8]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]} material={M.steelDark}>
            <boxGeometry args={[0.32, 0.06, 0.02]} />
          </mesh>
        ))}
      </group>

      {/* патрубки воздуховодов на торцах и крыше */}
      {/* приток и вытяжка */}
      <group position={[-1.55, 1.0, -0.35]} rotation={[0, 0, Math.PI / 2]}>
        <mesh material={M.pipe} castShadow>
          <cylinderGeometry args={[0.32, 0.32, 0.35, 24]} />
        </mesh>
      </group>
      <group position={[-1.55, 1.0, 0.35]} rotation={[0, 0, Math.PI / 2]}>
        <mesh material={M.pipe} castShadow>
          <cylinderGeometry args={[0.32, 0.32, 0.35, 24]} />
        </mesh>
      </group>

      {/* выброс и забор на крыше */}
      <group position={[0.4, 1.8, 0]}>
        <mesh material={M.pipe} castShadow>
          <cylinderGeometry args={[0.36, 0.36, 0.4, 24]} />
        </mesh>
      </group>

      {/* щит автоматики и дисплей рекуперации */}
      <group position={[-0.85, 0.9, 0.86]}>
        <RoundedBox args={[0.55, 0.8, 0.1]} radius={0.02} material={M.steel}>
          <Screen live={live} width={0.34} height={0.2} position={[0, 0.15, 0.055]} />
          <mesh position={[-0.12, -0.15, 0.055]} material={M.black}>
            <boxGeometry args={[0.08, 0.08, 0.02]} />
          </mesh>
          <mesh position={[0.12, -0.15, 0.055]} material={M.orange}>
            <boxGeometry args={[0.08, 0.08, 0.02]} />
          </mesh>
        </RoundedBox>
      </group>
    </group>
  );
}
