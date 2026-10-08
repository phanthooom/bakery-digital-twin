import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type * as THREE from 'three';
import { M } from '../materials';
import { Knob, Screen } from './parts';
import type { BodyProps } from './specs';

/** Спиральный тестомес: основание, дежа, колонна с головой и спиралью. */
export function Mixer({ live }: BodyProps) {
  const hook = useRef<THREE.Group>(null);
  const bowl = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const speed = live.status === 'running' || live.status === 'alarm' ? 2 + live.load * 8 : 0;
    if (hook.current) hook.current.rotation.y += dt * speed;
    if (bowl.current) bowl.current.rotation.y -= dt * speed * 0.15;
  });
  return (
    <group>
      <RoundedBox args={[1.0, 0.72, 1.15]} radius={0.06} smoothness={4} position={[0, 0.36, 0]} material={M.steel} castShadow receiveShadow />
      {/* дежа */}
      <group ref={bowl} position={[0, 0.72, 0.1]}>
        <mesh material={M.chromeDouble} castShadow>
          <cylinderGeometry args={[0.44, 0.36, 0.5, 40, 1, true]} />
        </mesh>
        <mesh position={[0, 0.25, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.chrome}>
          <torusGeometry args={[0.44, 0.022, 10, 48]} />
        </mesh>
        <mesh position={[0, 0.08, 0]} material={M.dough}>
          <cylinderGeometry args={[0.39, 0.37, 0.12, 32]} />
        </mesh>
      </group>
      {/* колонна и голова */}
      <RoundedBox args={[0.42, 0.75, 0.3]} radius={0.04} position={[0, 1.08, -0.42]} material={M.steel} castShadow />
      <RoundedBox args={[0.5, 0.26, 0.85]} radius={0.06} position={[0, 1.47, -0.1]} material={M.steelLight} castShadow />
      <group ref={hook} position={[0, 1.1, 0.12]}>
        <mesh material={M.chrome}>
          <cylinderGeometry args={[0.03, 0.03, 0.55, 10]} />
        </mesh>
        <mesh position={[0.08, -0.12, 0]} rotation={[0, 0, 0.5]} material={M.chrome}>
          <torusGeometry args={[0.1, 0.018, 8, 24, Math.PI * 1.5]} />
        </mesh>
      </group>
      {/* пульт */}
      <group position={[-0.15, 1.08, -0.265]}>
        <Screen live={live} width={0.2} height={0.1} position={[0, 0.12, 0]} />
        <Knob color="#3fbf4a" glow={live.status === 'running'} position={[-0.03, -0.02, 0.01]} />
        <Knob color="#d63a32" position={[0.04, -0.02, 0.01]} />
      </group>
    </group>
  );
}
