import { RoundedBox } from '@react-three/drei';
import { M } from '../materials';
import { Screen } from './parts';
import type { BodyProps } from './specs';

/** Запасная форма для неизвестного kind. */
export function Generic({ live }: BodyProps) {
  return (
    <group>
      <RoundedBox args={[1, 1.2, 0.8]} radius={0.05} position={[0, 0.6, 0]} material={M.steelLight} castShadow receiveShadow />
      <Screen live={live} width={0.2} height={0.1} position={[0, 0.9, 0.405]} />
    </group>
  );
}
