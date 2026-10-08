import { RoundedBox } from '@react-three/drei';
import { M } from '../materials';
import { Knob, Screen } from './parts';
import type { BodyProps } from './specs';

/** Расстоечный шкаф: высокий корпус, две стеклянные двери, видны тележки с противнями. */
export function Proofer({ live }: BodyProps) {
  const warm = live.status === 'running' || live.status === 'alarm';
  return (
    <group>
      <RoundedBox args={[1.5, 2.2, 1.05]} radius={0.04} position={[0, 1.1, 0]} material={M.steelLight} castShadow receiveShadow />
      {[-0.36, 0.36].map((x) => (
        <group key={x} position={[x, 1.08, 0.53]}>
          <mesh material={M.steel}>
            <boxGeometry args={[0.66, 1.9, 0.03]} />
          </mesh>
          <mesh position={[0, 0.05, 0.018]} material={M.glass}>
            <boxGeometry args={[0.54, 1.6, 0.01]} />
          </mesh>
          {/* противни за стеклом */}
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} position={[0, -0.68 + i * 0.17, 0.005]}>
              <boxGeometry args={[0.5, 0.012, 0.01]} />
              <meshStandardMaterial color={warm ? '#e8c48a' : '#9aa0a6'} emissive={warm ? '#ffb15c' : '#000'} emissiveIntensity={warm ? 0.25 : 0} />
            </mesh>
          ))}
          <mesh position={[x < 0 ? 0.27 : -0.27, 0, 0.05]} material={M.chrome}>
            <cylinderGeometry args={[0.015, 0.015, 0.5, 10]} />
          </mesh>
        </group>
      ))}
      <Screen live={live} width={0.24} height={0.12} position={[-0.45, 2.08, 0.53]} />
      <Knob color="#3fbf4a" glow={warm} position={[-0.22, 2.08, 0.54]} r={0.018} />
    </group>
  );
}
