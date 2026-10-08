import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ThreeElements } from '@react-three/fiber';
import type { MachineStatus } from '@bakery/shared';
import { M } from './materials';

/** Цвета свечения ламп — физические (ярче статусной палитры интерфейса), поэтому отдельно. */
const LAMPS = [
  { status: 'alarm' as const, color: '#ff2a2a', baseColor: new THREE.Color('#ff2a2a').multiplyScalar(0.45), y: 0.36 },
  { status: 'idle' as const, color: '#ffb000', baseColor: new THREE.Color('#ffb000').multiplyScalar(0.45), y: 0.27 },
  { status: 'running' as const, color: '#2bff3a', baseColor: new THREE.Color('#2bff3a').multiplyScalar(0.45), y: 0.18 },
];

/**
 * Сигнальная колонна (светофор): зелёный — работает, жёлтый — простой,
 * красный — авария/аномалия (мигает), все погашены — нет связи.
 */
export function SignalTower({ status, ...rest }: { status: MachineStatus } & ThreeElements['group']) {
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame((state, dt) => {
    const blink = status === 'alarm' ? (Math.sin(state.clock.elapsedTime * Math.PI * 2) > -0.2 ? 1 : 0.15) : 1;
    LAMPS.forEach((l, i) => {
      const m = mats.current[i];
      if (!m) return;
      const on = l.status === status;
      const target = on ? 2.4 * blink : 0;
      m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, target, 12, dt);
      m.opacity = on ? 0.95 : 0.55;
    });
  });
  return (
    <group {...rest}>
      <mesh position={[0, 0.012, 0]} material={M.black}>
        <cylinderGeometry args={[0.06, 0.07, 0.024, 20]} />
      </mesh>
      <mesh position={[0, 0.07, 0]} material={M.chrome}>
        <cylinderGeometry args={[0.012, 0.012, 0.11, 10]} />
      </mesh>
      {LAMPS.map((l, i) => (
        <mesh key={l.status} position={[0, l.y, 0]}>
          <cylinderGeometry args={[0.042, 0.042, 0.085, 24]} />
          <meshStandardMaterial
            ref={(m) => {
              mats.current[i] = m;
            }}
            color={l.baseColor}
            emissive={l.color}
            emissiveIntensity={0}
            roughness={0.25}
            transparent
            toneMapped={false}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.415, 0]} material={M.black}>
        <cylinderGeometry args={[0.044, 0.044, 0.025, 20]} />
      </mesh>
    </group>
  );
}
