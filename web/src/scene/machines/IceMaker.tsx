import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type * as THREE from 'three';
import { M } from '../materials';
import { makeGrilleTexture } from '../textures';
import { Knob, Screen } from './parts';
import type { BodyProps } from './specs';

/** Льдогенератор: корпус с вентилятором конденсатора, бункер для льда сверху. */
export function IceMaker({ live }: BodyProps) {
  const fan = useRef<THREE.Mesh>(null);
  const grille = useMemo(() => makeGrilleTexture(), []);
  useFrame((_, dt) => {
    if (fan.current && (live.status === 'running' || live.status === 'alarm')) fan.current.rotation.z += dt * 9;
  });
  return (
    <group>
      <RoundedBox args={[0.8, 0.85, 0.7]} radius={0.05} position={[0, 0.425, 0]} material={M.steelLight} castShadow receiveShadow />
      <RoundedBox args={[0.7, 0.32, 0.62]} radius={0.05} position={[-0.02, 1.02, -0.02]} material={M.steel} castShadow />
      {/* решётка вентилятора сбоку */}
      <mesh ref={fan} position={[0.405, 0.45, 0]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.24, 40]} />
        <meshStandardMaterial map={grille} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0.4, 0.45, 0]} rotation={[0, Math.PI / 2, 0]} material={M.steelDark}>
        <torusGeometry args={[0.25, 0.018, 10, 40]} />
      </mesh>
      <group position={[0, 0.68, 0.355]}>
        <mesh material={M.black}>
          <boxGeometry args={[0.42, 0.13, 0.01]} />
        </mesh>
        <Screen live={live} width={0.18} height={0.09} position={[-0.08, 0, 0.008]} />
        <Knob color="#3fbf4a" glow={live.status === 'running'} r={0.015} position={[0.1, 0.02, 0.01]} />
        <Knob color="#c9cdd1" r={0.015} position={[0.15, 0.02, 0.01]} />
      </group>
    </group>
  );
}
