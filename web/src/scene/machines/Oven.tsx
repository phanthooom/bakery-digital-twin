import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { M } from '../materials';
import { Knob, Screen } from './parts';
import type { BodyProps } from './specs';

const PUFFS = 8;

/** Пар из вытяжки — только когда печь работает. */
function Steam({ active, y }: { active: boolean; y: number }) {
  const group = useRef<THREE.Group>(null);
  const seeds = useRef(Array.from({ length: PUFFS }, (_, i) => ({ phase: i / PUFFS, dx: Math.random() - 0.5, dz: Math.random() - 0.5 })));
  const strength = useRef(0);
  useFrame((state, dt) => {
    strength.current = THREE.MathUtils.damp(strength.current, active ? 1 : 0, 1.5, dt);
    const t = state.clock.elapsedTime * 0.35;
    group.current?.children.forEach((m, i) => {
      const s = seeds.current[i]!;
      const p = (t + s.phase) % 1;
      m.position.set(s.dx * 0.25 * p, y + p * 1.4, s.dz * 0.25 * p);
      m.scale.setScalar(0.08 + p * 0.28);
      ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.sin(p * Math.PI) * 0.35 * strength.current;
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: PUFFS }, (_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Ротационная печь: корпус, дверь с окном, оранжевая панель с экраном, вытяжка с паром. */
export function Oven({ live }: BodyProps) {
  const heating = live.status === 'running' || live.status === 'alarm';
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((_, dt) => {
    if (glow.current) glow.current.emissiveIntensity = THREE.MathUtils.damp(glow.current.emissiveIntensity, heating ? 0.6 + live.load * 1.6 : 0.05, 2, dt);
  });
  return (
    <group>
      <RoundedBox args={[1.55, 2.45, 1.6]} radius={0.05} position={[0, 1.225, 0]} material={M.steelLight} castShadow receiveShadow />
      {/* дверь */}
      <group position={[-0.17, 1.15, 0.81]}>
        <mesh material={M.steel}>
          <boxGeometry args={[1.1, 2.05, 0.04]} />
        </mesh>
        <mesh position={[0, 0.05, 0.025]} material={M.black}>
          <boxGeometry args={[0.22, 1.4, 0.01]} />
        </mesh>
        <mesh position={[0, 0.05, 0.031]}>
          <boxGeometry args={[0.17, 1.33, 0.005]} />
          <meshStandardMaterial ref={glow} color="#3a2a1c" emissive="#ff7a1a" emissiveIntensity={0.05} toneMapped={false} />
        </mesh>
        <mesh position={[0.42, 0, 0.06]} material={M.chrome}>
          <cylinderGeometry args={[0.018, 0.018, 0.5, 10]} />
        </mesh>
      </group>
      {/* оранжевая панель управления */}
      <group position={[0.6, 1.2, 0.81]}>
        <mesh material={M.orange}>
          <boxGeometry args={[0.3, 2.05, 0.03]} />
        </mesh>
        <Screen live={live} width={0.2} height={0.1} position={[0, 0.35, 0.02]} />
        <Knob color="#d9dde1" position={[-0.06, 0.18, 0.02]} />
        <Knob color="#3fbf4a" glow={heating} position={[0.06, 0.18, 0.02]} />
        <Knob color="#d63a32" r={0.03} position={[0, -0.45, 0.02]} />
      </group>
      {/* вытяжка */}
      <mesh position={[-0.35, 2.75, -0.3]} material={M.pipe} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.6, 20]} />
      </mesh>
      <mesh position={[-0.35, 3.08, -0.3]} material={M.pipe}>
        <coneGeometry args={[0.22, 0.12, 20]} />
      </mesh>
      <group position={[-0.35, 0, -0.3]}>
        <Steam active={heating} y={3.1} />
      </group>
    </group>
  );
}
