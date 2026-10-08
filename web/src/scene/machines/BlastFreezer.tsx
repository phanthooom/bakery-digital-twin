import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type * as THREE from 'three';
import { M } from '../materials';
import { makeGrilleTexture } from '../textures';
import { Knob, Screen } from './parts';
import type { BodyProps } from './specs';

/** Шкаф шоковой заморозки: высокий корпус с глухой дверью, компрессорный агрегат на крыше. */
export function BlastFreezer({ live }: BodyProps) {
  const fan = useRef<THREE.Mesh>(null);
  const grille = useMemo(() => makeGrilleTexture(), []);
  const on = live.status === 'running' || live.status === 'alarm';
  useFrame((_, dt) => {
    if (fan.current && on) fan.current.rotation.z += dt * 10;
  });
  return (
    <group>
      <RoundedBox args={[1.0, 2.0, 1.05]} radius={0.04} position={[0, 1.0, 0]} material={M.steelLight} castShadow receiveShadow />
      {/* дверь с уплотнителем */}
      <mesh position={[0, 0.95, 0.53]} material={M.steel}>
        <boxGeometry args={[0.9, 1.6, 0.04]} />
      </mesh>
      <mesh position={[0.36, 0.95, 0.57]} material={M.chrome}>
        <boxGeometry args={[0.04, 0.6, 0.05]} />
      </mesh>
      {/* иней по краю двери, когда идёт заморозка */}
      <mesh position={[0, 1.76, 0.552]}>
        <boxGeometry args={[0.9, 0.025, 0.01]} />
        <meshStandardMaterial color={on ? '#e8f4ff' : '#c9cdd1'} emissive={on ? '#bfe0ff' : '#000'} emissiveIntensity={on ? 0.4 : 0} />
      </mesh>
      <group position={[0, 1.86, 0.53]}>
        <mesh material={M.black}>
          <boxGeometry args={[0.9, 0.2, 0.02]} />
        </mesh>
        <Screen live={live} width={0.22} height={0.11} position={[-0.25, 0, 0.012]} />
        <Knob color="#3fbf4a" glow={on} position={[0.05, 0, 0.012]} r={0.016} />
        <Knob color="#8fd3ff" glow={on} position={[0.12, 0, 0.012]} r={0.016} />
      </group>
      {/* агрегат на крыше */}
      <RoundedBox args={[0.8, 0.32, 0.8]} radius={0.04} position={[0.05, 2.17, -0.05]} material={M.steel} castShadow />
      <mesh ref={fan} position={[0.05, 2.17, 0.356]}>
        <circleGeometry args={[0.13, 32]} />
        <meshStandardMaterial map={grille} metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
  );
}
