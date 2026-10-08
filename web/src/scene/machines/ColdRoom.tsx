import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { M } from '../materials';
import { makeGrilleTexture } from '../textures';
import { Knob, Screen } from './parts';
import type { BodyProps } from './specs';

const panel = new THREE.MeshStandardMaterial({ color: '#f1f2f0', roughness: 0.7 });
const seam = new THREE.MeshStandardMaterial({ color: '#c9ccc9', roughness: 0.8 });

/** Морозильная камера хранения: «сэндвич»-панели, распашная дверь, моноблок на стене. */
export function ColdRoom({ live }: BodyProps) {
  const fan = useRef<THREE.Mesh>(null);
  const grille = useMemo(() => makeGrilleTexture(), []);
  const on = live.status === 'running' || live.status === 'alarm';
  useFrame((_, dt) => {
    if (fan.current && on) fan.current.rotation.z += dt * 8;
  });
  const W = 2.7;
  const H = 2.5;
  const Dp = 2.0;
  return (
    <group>
      <mesh position={[0, H / 2, 0]} material={panel} castShadow receiveShadow>
        <boxGeometry args={[W, H, Dp]} />
      </mesh>
      {/* швы панелей */}
      {[-0.9, -0.3, 0.3, 0.9].map((x) => (
        <mesh key={x} position={[x, H / 2, Dp / 2 + 0.003]} material={seam}>
          <boxGeometry args={[0.012, H, 0.004]} />
        </mesh>
      ))}
      {/* дверь */}
      <group position={[-0.35, 0, Dp / 2 + 0.03]}>
        <mesh position={[0, 1.0, 0]} material={M.steelLight} castShadow>
          <boxGeometry args={[1.0, 2.0, 0.06]} />
        </mesh>
        <mesh position={[0.38, 1.05, 0.06]} material={M.black}>
          <boxGeometry args={[0.06, 0.32, 0.06]} />
        </mesh>
        {[0.25, 1.75].map((y) => (
          <mesh key={y} position={[-0.52, y, 0]} material={M.steelDark}>
            <boxGeometry args={[0.05, 0.18, 0.08]} />
          </mesh>
        ))}
      </group>
      {/* пульт термостата */}
      <group position={[0.75, 1.55, Dp / 2 + 0.01]}>
        <mesh material={M.black}>
          <boxGeometry args={[0.36, 0.2, 0.02]} />
        </mesh>
        <Screen live={live} width={0.22} height={0.11} position={[-0.04, 0, 0.012]} />
        <Knob color="#3fbf4a" glow={on} position={[0.13, 0.04, 0.012]} r={0.014} />
      </group>
      {/* моноблок на крыше */}
      <RoundedBox args={[1.1, 0.42, 0.7]} radius={0.04} position={[0.5, H + 0.21, -0.4]} material={M.steel} castShadow />
      <mesh ref={fan} position={[0.5, H + 0.21, -0.044]}>
        <circleGeometry args={[0.16, 32]} />
        <meshStandardMaterial map={grille} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.06, Dp / 2 + 0.25]} rotation={[-Math.PI / 2, 0, 0]} material={M.rubber}>
        <planeGeometry args={[1.1, 0.5]} />
      </mesh>
    </group>
  );
}
