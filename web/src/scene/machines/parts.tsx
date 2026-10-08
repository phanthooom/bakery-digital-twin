import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeElements } from '@react-three/fiber';
import { M } from '../materials';
import { drawScreen } from '../textures';
import { fmtKw } from '../../ui/format';
import { STATUS_LABEL } from '../../ui/statusMeta';
import type { MachineLive } from './specs';

/** Опоры из нержавейки с колёсиками. */
export function Legs({ w, d, h, caster = true }: { w: number; d: number; h: number; caster?: boolean }) {
  const r = 0.025;
  const pts: [number, number][] = [
    [-w / 2 + 0.04, -d / 2 + 0.04],
    [w / 2 - 0.04, -d / 2 + 0.04],
    [-w / 2 + 0.04, d / 2 - 0.04],
    [w / 2 - 0.04, d / 2 - 0.04],
  ];
  const off = caster ? 0.06 : 0;
  return (
    <group>
      {pts.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, off + (h - off) / 2, 0]} material={M.chrome} castShadow>
            <cylinderGeometry args={[r, r, h - off, 10]} />
          </mesh>
          {caster && (
            <mesh position={[0, 0.035, 0]} material={M.rubber} castShadow>
              <sphereGeometry args={[0.035, 10, 8]} />
            </mesh>
          )}
        </group>
      ))}
      {/* продольные перемычки */}
      {[-d / 2 + 0.04, d / 2 - 0.04].map((z, i) => (
        <mesh key={`x${i}`} position={[0, h * 0.35, z]} rotation={[0, 0, Math.PI / 2]} material={M.chrome}>
          <cylinderGeometry args={[r * 0.8, r * 0.8, w - 0.08, 8]} />
        </mesh>
      ))}
      {[-w / 2 + 0.04, w / 2 - 0.04].map((x, i) => (
        <mesh key={`z${i}`} position={[x, h * 0.35, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.chrome}>
          <cylinderGeometry args={[r * 0.8, r * 0.8, d - 0.08, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/** Экран станка: статус, мощность, полоса % от номинала. */
export function Screen({ live, width = 0.3, height = 0.15, ...rest }: { live: MachineLive; width?: number; height?: number } & ThreeElements['group']) {
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { canvas: c, texture: t };
  }, []);
  const kw = fmtKw(live.powerKw);
  useEffect(() => {
    drawScreen(canvas, { label: STATUS_LABEL[live.status], value: live.status === 'offline' ? '—' : kw, unit: 'кВт', pct: live.load * 100, color: live.statusColor });
    texture.needsUpdate = true;
  }, [canvas, texture, kw, live.status, live.load, live.statusColor]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group {...rest}>
      <mesh material={M.black}>
        <boxGeometry args={[width + 0.03, height + 0.03, 0.012]} />
      </mesh>
      <mesh position={[0, 0, 0.007]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Кнопка/индикатор на пульте. */
export function Knob({ color = '#3fbf4a', glow = false, r = 0.022, ...rest }: { color?: string; glow?: boolean; r?: number } & ThreeElements['mesh']) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} {...rest}>
      <cylinderGeometry args={[r, r, 0.02, 16]} />
      <meshStandardMaterial color={color} emissive={glow ? color : '#000000'} emissiveIntensity={glow ? 1.2 : 0} roughness={0.4} />
    </mesh>
  );
}
