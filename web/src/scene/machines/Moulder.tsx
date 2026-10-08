import { RoundedBox } from '@react-three/drei';
import { M } from '../materials';
import { Knob, Legs, Screen } from './parts';
import type { BodyProps } from './specs';

/** Тестоокруглитель/формовщик: рама на колёсах, корпус, бункер-воронка. */
export function Moulder({ live }: BodyProps) {
  return (
    <group>
      <Legs w={0.8} d={0.7} h={0.55} />
      <RoundedBox args={[0.85, 0.5, 0.75]} radius={0.05} position={[0, 0.8, 0]} material={M.steelLight} castShadow receiveShadow />
      {/* воронка */}
      <mesh position={[0, 1.27, 0]} rotation={[0, Math.PI / 4, 0]} material={M.steelDouble} castShadow>
        <cylinderGeometry args={[0.36, 0.14, 0.42, 4, 1, true]} />
      </mesh>
      <mesh position={[0, 1.24, 0]} material={M.dough}>
        <sphereGeometry args={[0.12, 16, 12]} />
      </mesh>
      {/* окно выгрузки и фирменная табличка (без логотипа) */}
      <mesh position={[0, 0.72, 0.38]} material={M.black}>
        <boxGeometry args={[0.5, 0.22, 0.01]} />
      </mesh>
      <mesh position={[-0.2, 0.95, 0.38]} material={M.red}>
        <boxGeometry args={[0.24, 0.07, 0.01]} />
      </mesh>
      <Screen live={live} width={0.14} height={0.07} position={[0.24, 0.95, 0.385]} />
      <Knob color="#3fbf4a" glow={live.status === 'running'} r={0.014} position={[0.33, 0.72, 0.385]} />
    </group>
  );
}
