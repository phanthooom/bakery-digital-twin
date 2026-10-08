import { useMemo } from 'react';
import { Line, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { EquipmentConfig, SiteConfig, StageConfig } from '@bakery/shared';
import { M } from './materials';
import { makeLabelTexture, makeStripeTexture } from './textures';

/** Линия потока и подписи этапов идут по полу перед станками. */
const FLOW_Z = 0.55;
const LABEL_Z = 1.25;
const ZONE_Z: [number, number] = [-4.45, -0.85];

function FloorLabel({ text, x, z, height = 0.62, color = '#3d3d3a' }: { text: string; x: number; z: number; height?: number; color?: string }) {
  const { texture, aspect } = useMemo(() => makeLabelTexture(text, { fontSize: 110, weight: 650, color, letterSpacing: 10 }), [text, color]);
  // x — левый край подписи
  return (
    <mesh position={[x + (height * aspect) / 2, 0.013, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function StageZone({ stage }: { stage: StageConfig }) {
  const x0 = stage.xFrom + 0.25;
  const x1 = stage.xTo - 0.25;
  const [z0, z1] = ZONE_Z;
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
  return <Line points={pts} color="#4a4a46" lineWidth={1.6} />;
}

function FlowLine({ stages, xFrom, xTo }: { stages: StageConfig[]; xFrom: number; xTo: number }) {
  const chevrons = stages.slice(1).map((s) => s.xFrom - 0.25);
  return (
    <group>
      <Line points={[[xFrom, 0.012, FLOW_Z], [xTo, 0.012, FLOW_Z]]} color="#c79a2a" lineWidth={2} />
      {[...chevrons, xTo].map((x) => (
        <Line
          key={x}
          points={[[x - 0.22, 0.012, FLOW_Z - 0.14], [x, 0.012, FLOW_Z], [x - 0.22, 0.012, FLOW_Z + 0.14]]}
          color="#c79a2a"
          lineWidth={2}
        />
      ))}
    </group>
  );
}

function Windows({ length, y0, y1, along }: { length: number; y0: number; y1: number; along: 'x' | 'z' }) {
  const bays = Math.round(length / 4);
  const bay = length / bays;
  const h = y1 - y0;
  return (
    <group>
      {Array.from({ length: bays }, (_, i) => {
        const c = -length / 2 + bay * (i + 0.5);
        const panes = 4;
        return (
          <group key={i} position={along === 'x' ? [c, (y0 + y1) / 2, 0] : [0, (y0 + y1) / 2, c]} rotation={along === 'z' ? [0, Math.PI / 2, 0] : [0, 0, 0]}>
            <mesh material={M.frame}>
              <boxGeometry args={[bay - 0.9, h + 0.08, 0.04]} />
            </mesh>
            {Array.from({ length: panes }, (_, k) => {
              const pw = (bay - 0.9 - 0.04 * (panes + 1)) / panes;
              return (
                <mesh key={k} position={[-(bay - 0.9) / 2 + 0.04 + pw / 2 + k * (pw + 0.04), 0, 0.025]} material={M.window}>
                  <planeGeometry args={[pw, h - 0.08]} />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

/** Цех: пол, стены с окнами, колонны, трубы и кабель-канал, зоны этапов и подписи. */
export function Hall({ config }: { config: SiteConfig }) {
  const { width: W, depth: D, height: H } = config.site.hall;
  const stripes = useMemo(() => {
    const t = makeStripeTexture();
    t.repeat.set(3, 1);
    return t;
  }, []);
  const stages = [...config.stages].sort((a, b) => a.order - b.order);
  const xs = config.equipment.map((e) => e.position.x);
  const T = 0.25;

  return (
    <group>
      {/* пол и цоколь */}
      <mesh position={[0, -0.13, 0]} material={M.floorEdge} receiveShadow>
        <boxGeometry args={[W + 1.2, 0.2, D + 1.2]} />
      </mesh>
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.floor} receiveShadow>
        <planeGeometry args={[W, D]} />
      </mesh>

      {/* задняя стена с окнами */}
      <mesh position={[0, H / 2, -D / 2 - T / 2]} material={M.wall} receiveShadow>
        <boxGeometry args={[W + 2 * T, H, T]} />
      </mesh>
      <mesh position={[0, 0.6, -D / 2 + 0.01]} material={M.wallPanel}>
        <boxGeometry args={[W, 1.2, 0.02]} />
      </mesh>
      <group position={[0, 0, -D / 2 + 0.02]}>
        <Windows length={W} y0={3.0} y1={4.4} along="x" />
      </group>
      {/* боковые стены */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (W / 2 + T / 2), H / 2, 0]} material={M.wall} receiveShadow>
            <boxGeometry args={[T, H, D]} />
          </mesh>
          <group position={[s * (W / 2 - 0.02), 0, 0]} rotation={[0, s < 0 ? 0 : Math.PI, 0]}>
            <Windows length={D} y0={3.0} y1={4.4} along="z" />
          </group>
        </group>
      ))}
      {/* дверь в левой стене */}
      <group position={[-W / 2 + 0.03, 0, 2.0]}>
        <mesh position={[0, 1.1, 0]} material={M.frame}>
          <boxGeometry args={[0.04, 2.2, 1.3]} />
        </mesh>
        <mesh position={[0.01, 1.08, 0]} material={M.steelLight}>
          <boxGeometry args={[0.04, 2.1, 1.2]} />
        </mesh>
        <mesh position={[0.05, 1.05, 0.45]} material={M.chrome}>
          <boxGeometry args={[0.03, 0.04, 0.18]} />
        </mesh>
      </group>
      {/* передний бортик — цех открыт к зрителю, как на схеме */}
      <mesh position={[0, 0.15, D / 2 + T / 2]} material={M.wall} castShadow receiveShadow>
        <boxGeometry args={[W + 2 * T, 0.3, T]} />
      </mesh>

      {/* колонны по задней стене */}
      {Array.from({ length: Math.round(W / 4) + 1 }, (_, i) => -W / 2 + i * (W / Math.round(W / 4))).map((x) => (
        <mesh key={x} position={[x, H / 2, -D / 2 + 0.2]} material={M.column} castShadow receiveShadow>
          <boxGeometry args={[0.4, H, 0.4]} />
        </mesh>
      ))}

      {/* трубы и кабель-канал вдоль задней стены */}
      {[3.45, 3.7].map((y, i) => (
        <mesh key={y} position={[0, y, -D / 2 + 0.55 + i * 0.22]} rotation={[0, 0, Math.PI / 2]} material={M.pipe} castShadow>
          <cylinderGeometry args={[0.07 - i * 0.02, 0.07 - i * 0.02, W, 16]} />
        </mesh>
      ))}
      <mesh position={[0, 2.85, -D / 2 + 1.25]} material={M.steelDark} castShadow>
        <boxGeometry args={[W - 1, 0.05, 0.35]} />
      </mesh>
      {/* опуски питания к станкам */}
      {config.equipment.map((e: EquipmentConfig) => (
        <mesh key={e.id} position={[e.position.x - 0.15, 2.95, -D / 2 + 1.25]} material={M.steelDark}>
          <boxGeometry args={[0.06, 0.2, 0.06]} />
        </mesh>
      ))}

      {/* электрощит между формовкой и расстойкой */}
      <group position={[0.75, 0, -D / 2 + 0.35]}>
        <RoundedBox args={[0.9, 1.9, 0.35]} radius={0.03} position={[0, 0.95, 0]} material={M.steelLight} castShadow />
        {[-0.2, -0.05, 0.1].map((x, i) => (
          <mesh key={x} position={[x, 1.55, 0.18]}>
            <circleGeometry args={[0.025, 16]} />
            <meshStandardMaterial color={['#38c24a', '#38c24a', '#f2a33a'][i]} emissive={['#38c24a', '#38c24a', '#f2a33a'][i]} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0.18, 1.2, 0.18]} material={M.wall}>
          <planeGeometry args={[0.32, 0.22]} />
        </mesh>
      </group>

      {/* поддон с мешками муки у замеса */}
      <group position={[-15.0, 0, -1.45]}>
        <mesh position={[0, 0.07, 0]} material={M.wood} castShadow receiveShadow>
          <boxGeometry args={[1.0, 0.14, 0.8]} />
        </mesh>
        {[
          [-0.24, 0.24, -0.18],
          [0.24, 0.24, -0.18],
          [-0.24, 0.24, 0.18],
          [0.24, 0.24, 0.18],
          [0, 0.43, 0],
        ].map(([x, y, z], i) => (
          <RoundedBox key={i} args={[0.46, 0.18, 0.34]} radius={0.07} position={[x!, y!, z!]} material={M.sack} castShadow />
        ))}
      </group>
      {/* предупредительная разметка у формовки */}
      <mesh position={[-3.8, 0.012, -4.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 0.5]} />
        <meshStandardMaterial map={stripes} roughness={0.8} />
      </mesh>

      {/* зоны этапов, линия потока, подписи */}
      {stages.map((s) => (
        <StageZone key={s.id} stage={s} />
      ))}
      <FlowLine stages={stages} xFrom={Math.min(...xs, stages[0]!.xFrom) - 0.3} xTo={stages.at(-1)!.xTo - 0.2} />
      {stages.map((s) => (
        <FloorLabel key={s.id} text={s.label} x={s.xFrom + 0.2} z={LABEL_Z} />
      ))}
    </group>
  );
}
