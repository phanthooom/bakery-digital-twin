import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { M } from '../materials';
import { Legs, Screen } from './parts';
import type { BodyProps } from './specs';

const LEN = 3.0;
const BALLS = 7;

/** Ленточный конвейер с пресс-головой и кусками теста, которые едут при работе. */
export function Conveyor({ live }: BodyProps) {
  const balls = useRef<THREE.Group>(null);
  const offset = useRef(0);
  useFrame((_, dt) => {
    const running = live.status === 'running' || live.status === 'alarm';
    if (running) offset.current = (offset.current + dt * 0.25 * Math.max(0.3, live.load)) % (LEN / BALLS);
    balls.current?.children.forEach((b, i) => {
      b.position.x = -LEN / 2 + 0.15 + ((i * LEN) / BALLS + offset.current) % (LEN - 0.3);
    });
  });
  return (
    <group>
      {[-1, 0, 1].map((k) => (
        <group key={k} position={[k * (LEN / 2 - 0.25), 0, 0]}>
          <Legs w={0.3} d={0.5} h={0.8} caster={false} />
        </group>
      ))}
      {/* рама и лента */}
      <mesh position={[0, 0.83, 0]} material={M.steel} castShadow receiveShadow>
        <boxGeometry args={[LEN, 0.08, 0.6]} />
      </mesh>
      <mesh position={[0, 0.875, 0]} material={M.belt} receiveShadow>
        <boxGeometry args={[LEN - 0.1, 0.012, 0.5]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * LEN) / 2, 0.83, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.steelDark}>
          <cylinderGeometry args={[0.05, 0.05, 0.6, 16]} />
        </mesh>
      ))}
      <group ref={balls}>
        {Array.from({ length: BALLS }, (_, i) => (
          <mesh key={i} position={[0, 0.915, 0]} scale={[1, 0.7, 1]} material={M.dough} castShadow>
            <sphereGeometry args={[0.055, 14, 10]} />
          </mesh>
        ))}
      </group>
      {/* пресс-голова */}
      <group position={[0.35, 0, 0]}>
        <mesh position={[0, 1.08, -0.28]} material={M.steel}>
          <boxGeometry args={[0.08, 0.45, 0.06]} />
        </mesh>
        <mesh position={[0, 1.28, -0.05]} material={M.steel} castShadow>
          <boxGeometry args={[0.3, 0.18, 0.5]} />
        </mesh>
        <mesh position={[0, 1.12, 0]} material={M.black}>
          <cylinderGeometry args={[0.07, 0.07, 0.16, 20]} />
        </mesh>
      </group>
      <Screen live={live} width={0.14} height={0.07} position={[-1.1, 0.83, 0.305]} />
    </group>
  );
}
