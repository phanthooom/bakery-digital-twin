import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MachineStatus } from '@bakery/shared';

/** Кольцо на полу под станком: цвет статуса; при аварии расходится волной. */
export function StatusRing({ status, color, radius, highlighted }: { status: MachineStatus; color: string; radius: number; highlighted: boolean }) {
  const wave = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const m = wave.current;
    if (!m) return;
    if (status !== 'alarm') {
      if (m.visible) m.visible = false;
      return;
    }
    const p = (state.clock.elapsedTime * 0.7) % 1;
    m.visible = true;
    m.scale.setScalar(1 + p * 0.6);
    (m.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.5;
  });
  return (
    <group position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[radius - 0.035, radius, 64]} />
        <meshBasicMaterial color={color} transparent opacity={highlighted ? 0.95 : status === 'offline' ? 0.35 : 0.6} depthWrite={false} />
      </mesh>
      <mesh>
        <circleGeometry args={[radius - 0.035, 64]} />
        <meshBasicMaterial color={color} transparent opacity={highlighted ? 0.1 : 0.05} depthWrite={false} />
      </mesh>
      <mesh ref={wave}>
        <ringGeometry args={[radius - 0.02, radius + 0.02, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
