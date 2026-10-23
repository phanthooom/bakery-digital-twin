import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { FloorPoint, FloorRect, SiteConfig } from '@bakery/shared';
import { M } from './materials';
import { makeLabelTexture } from './textures';
import { TRAY_Y, trayOf } from './powerRoutes';
import { MergeStatic } from './MergeStatic';
import { Walls } from './Walls';

/** Шаг стрелок на линии потока, м. */
const CHEVRON_STEP = 4;

export function FloorLabel({ text, x, z, height = 0.62, color = '#3d3d3a', align = 'left', font }: { text: string; x: number; z: number; height?: number; color?: string; align?: 'left' | 'center'; font?: string }) {
  const { texture, aspect } = useMemo(() => makeLabelTexture(text, { fontSize: 110, weight: 650, color, letterSpacing: font ? 2 : 10, font }), [text, color, font]);
  // x — левый край подписи
  return (
    <mesh position={[align === 'left' ? x + (height * aspect) / 2 : x, 0.013, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Контур зоны на полу со скруглёнными углами (отступ 0,25 м внутрь). */
export function ZoneOutline({ zone, color = '#4a4a46' }: { zone: FloorRect; color?: string }) {
  const x0 = zone.x0 + 0.25;
  const x1 = zone.x1 - 0.25;
  const z0 = zone.z0 + 0.25;
  const z1 = zone.z1 - 0.25;
  const r = 0.35;
  const pts = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(x0 + r, z0);
    shape.lineTo(x1 - r, z0);
    shape.quadraticCurveTo(x1, z0, x1, z0 + r);
    shape.lineTo(x1, z1 - r);
    shape.quadraticCurveTo(x1, z1, x1 - r, z1);
    shape.lineTo(x0 + r, z1);
    shape.quadraticCurveTo(x0, z1, x0, z1 - r);
    shape.lineTo(x0, z0 + r);
    shape.quadraticCurveTo(x0, z0, x0 + r, z0);
    return shape.getPoints(8).map((p) => new THREE.Vector3(p.x, 0.011, p.y));
  }, [x0, x1, z0, z1]);
  return <Line points={pts} color={color} lineWidth={1.6} />;
}

/** Линия потока по полу: ломаная от приёмки до отгрузки со стрелками по ходу. */
function FlowLine({ points }: { points: FloorPoint[] }) {
  const chevrons = useMemo(() => {
    const out: { x: number; z: number; a: number }[] = [];
    let carry = CHEVRON_STEP / 2;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1]!;
      const [bx, bz] = points[i]!;
      const len = Math.hypot(bx - ax, bz - az);
      const a = Math.atan2(bz - az, bx - ax);
      for (let d = carry; d < len; d += CHEVRON_STEP) out.push({ x: ax + ((bx - ax) * d) / len, z: az + ((bz - az) * d) / len, a });
      carry = CHEVRON_STEP - ((len - carry) % CHEVRON_STEP);
    }
    const [lx, lz] = points.at(-1)!;
    const [px, pz] = points.at(-2)!;
    out.push({ x: lx, z: lz, a: Math.atan2(lz - pz, lx - px) });
    return out;
  }, [points]);
  return (
    <group>
      <Line points={points.map(([x, z]) => [x, 0.012, z] as [number, number, number])} color="#c79a2a" lineWidth={2} />
      {chevrons.map((c, i) => (
        <group key={i} position={[c.x, 0.012, c.z]} rotation={[0, -c.a, 0]}>
          <Line points={[[-0.22, 0, -0.14], [0, 0, 0], [-0.22, 0, 0.14]]} color="#c79a2a" lineWidth={2} />
        </group>
      ))}
    </group>
  );
}

/** Цех: пол, стены (Walls), колонны, кабельный лоток, зоны этапов, линия потока и подписи. */
export function Hall({ config }: { config: SiteConfig }) {
  const { width: W, depth: D, height: H } = config.site.hall;
  const stages = [...config.stages].sort((a, b) => a.order - b.order);
  const tray = trayOf(config);
  const cols = config.site.hall.columns;

  return (
    <group>
      <Walls config={config} />
      <MergeStatic>
        {/* пол и цоколь */}
        <mesh position={[0, -0.13, 0]} material={M.floorEdge} receiveShadow>
          <boxGeometry args={[W + 1.2, 0.2, D + 1.2]} />
        </mesh>
        <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.floor} receiveShadow>
          <planeGeometry args={[W, D]} />
        </mesh>

        {/* кабельный лоток под потолком — по ломаной из конфига */}
        {tray.slice(1).map(([bx, bz], i) => {
          const [ax, az] = tray[i]!;
          const len = Math.hypot(bx - ax, bz - az);
          return (
            <mesh key={i} position={[(ax + bx) / 2, TRAY_Y - 0.05, (az + bz) / 2]} rotation={[0, -Math.atan2(bz - az, bx - ax), 0]} material={M.steelDark} castShadow>
              <boxGeometry args={[len + 0.35, 0.05, 0.35]} />
            </mesh>
          );
        })}
        {/* колонны внутри корпуса */}
        {cols?.xs.flatMap((x) =>
          cols.zs.map((z) => (
            <mesh key={`${x}:${z}`} position={[x, H / 2, z]} material={M.column} castShadow receiveShadow>
              <boxGeometry args={[0.4, H, 0.4]} />
            </mesh>
          )),
        )}


        {/* зоны этапов, линия потока, подписи */}
        {stages.map((s) => (
          <ZoneOutline key={s.id} zone={s.zone} />
        ))}
        {config.site.flow && config.site.flow.length >= 2 && <FlowLine points={config.site.flow} />}
        {stages.map((s) => (
          <FloorLabel key={s.id} text={s.label} x={s.zone.x0 + 0.45} z={s.zone.z1 - 0.75} />
        ))}

      </MergeStatic>
    </group>
  );
}
