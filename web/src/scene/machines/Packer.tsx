import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type * as THREE from 'three';
import { M } from '../materials';
import { Knob, Legs, Screen } from './parts';
import type { BodyProps } from './specs';

const LEN = 2.8;
const PACKS = 6;

/** Горизонтальная упаковочная машина flow-pack: подающий транспортёр, рулон плёнки, губки запайки, выход пакетов. */
export function Packer({ live }: BodyProps) {
  const items = useRef<THREE.Group>(null);
  const roll = useRef<THREE.Mesh>(null);
  const offset = useRef(0);
  useFrame((_, dt) => {
    const running = live.status === 'running' || live.status === 'alarm';
    if (running) {
      offset.current = (offset.current + dt * 0.35 * Math.max(0.4, live.load)) % (LEN / PACKS);
      if (roll.current) roll.current.rotation.x += dt * 2.2;
    }
    items.current?.children.forEach((b, i) => {
      const x = -LEN / 2 + 0.15 + (((i * LEN) / PACKS + offset.current) % (LEN - 0.3));
      b.position.x = x;
      // после губок (x > 0.2) булка уже в пакете
      b.scale.set(x > 0.2 ? 1.25 : 1, x > 0.2 ? 0.9 : 1, x > 0.2 ? 1.25 : 1);
    });
  });
  return (
    <group>
      {[-1, 0, 1].map((k) => (
        <group key={k} position={[k * (LEN / 2 - 0.25), 0, 0]}>
          <Legs w={0.34} d={0.55} h={0.78} caster={false} />
        </group>
      ))}
      <mesh position={[0, 0.82, 0]} material={M.steel} castShadow receiveShadow>
        <boxGeometry args={[LEN, 0.1, 0.62]} />
      </mesh>
      <mesh position={[0, 0.875, 0]} material={M.black} receiveShadow>
        <boxGeometry args={[LEN - 0.1, 0.012, 0.42]} />
      </mesh>
      {/* корпус с губками запайки */}
      <RoundedBox args={[0.7, 0.62, 0.72]} radius={0.05} position={[0.25, 1.17, 0]} material={M.steelLight} castShadow receiveShadow />
      <mesh position={[0.25, 1.0, 0.365]} material={M.glass}>
        <planeGeometry args={[0.5, 0.22]} />
      </mesh>
      {/* рулон плёнки сверху */}
      <mesh position={[-0.15, 1.62, 0]} rotation={[0, 0, Math.PI / 2]} material={M.steelDark}>
        <cylinderGeometry args={[0.02, 0.02, 0.62, 10]} />
      </mesh>
      <mesh ref={roll} position={[-0.15, 1.62, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 0.5, 24]} />
        <meshStandardMaterial color="#d8e6f3" roughness={0.25} metalness={0.1} transparent opacity={0.9} />
      </mesh>
      {/* пульт */}
      <group position={[0.75, 1.15, 0.3]}>
        <Screen live={live} width={0.16} height={0.1} position={[0, 0.05, 0.06]} />
        <Knob position={[0.12, -0.08, 0.06]} glow={live.status === 'running'} />
      </group>
      <group ref={items}>
        {Array.from({ length: PACKS }, (_, i) => (
          <mesh key={i} position={[0, 0.93, 0]} scale={[1, 1, 1]} castShadow>
            <boxGeometry args={[0.22, 0.09, 0.12]} />
            <meshStandardMaterial color="#d9b47a" roughness={0.8} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
