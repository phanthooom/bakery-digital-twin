import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Html, RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Select } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { GasState, SiteConfig } from '@bakery/shared';
import { useGas } from '../data/store';
import { fmtNum } from '../ui/format';
import { STATUS_COLOR } from '../ui/statusMeta';
import { WarnIcon } from '../ui/StatusIcon';
import { SPECS } from './machines';
import { M } from './materials';
import { MergeStatic } from './MergeStatic';
import { StatusRing } from './StatusRing';

/**
 * Ввод газа у щита: счётчик с кранами на стене, сигнализатор загазованности под потолочным лотком
 * и жёлтый газопровод вдоль задней стены к печам с опусками и кранами у каждой.
 */
const PIPE_R = 0.028;
const PIPE_Y = 2.55; // ниже кабельного лотка
const WALL_GAP = 0.14; // стояк и счётчик — у стены между колоннами
const MAIN_GAP = 0.52; // магистраль — перед колоннами задней стены (они выступают на 0,4 м)

const pipeMat = new THREE.MeshStandardMaterial({ color: '#f2c200', roughness: 0.45, metalness: 0.2 });
const meterMat = new THREE.MeshStandardMaterial({ color: '#b9bec3', roughness: 0.4, metalness: 0.5 });
const dialMat = new THREE.MeshStandardMaterial({ color: '#111417', roughness: 0.2 });
const valveMat = new THREE.MeshStandardMaterial({ color: '#c8242b', roughness: 0.5 });
const detMat = new THREE.MeshStandardMaterial({ color: '#f4f5f6', roughness: 0.6 });

const LEVEL_STATUS = { ok: 'running', warning: 'idle', critical: 'alarm', offline: 'offline' } as const;

/** Труба между двумя точками. */
function Pipe({ a, b, r = PIPE_R }: { a: [number, number, number]; b: [number, number, number]; r?: number }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const d = vb.clone().sub(va);
    return { pos: va.add(vb).multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), len: d.length() };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} material={pipeMat} castShadow>
      <cylinderGeometry args={[r, r, len, 10]} />
    </mesh>
  );
}

/** Шаровой кран: муфта и красная ручка-бабочка. */
function Valve({ at, along = 'y' }: { at: [number, number, number]; along?: 'x' | 'y' | 'z' }) {
  const rot: [number, number, number] = along === 'y' ? [0, 0, 0] : along === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
  return (
    <group position={at}>
      <mesh rotation={rot} material={M.steel}>
        <cylinderGeometry args={[PIPE_R * 1.7, PIPE_R * 1.7, 0.09, 12]} />
      </mesh>
      <mesh position={[0, 0, 0.07]} material={valveMat}>
        <boxGeometry args={[0.16, 0.025, 0.02]} />
      </mesh>
    </group>
  );
}

/** Индикатор сигнализатора: зелёный — норма, жёлтый — порог 1, красный мигает — порог 2. */
function DetectorLed({ level }: { level: GasState['level'] }) {
  const ref = useRef<THREE.MeshStandardMaterial>(null);
  const color = level === 'critical' ? '#ff2a2a' : level === 'warning' ? '#ffb300' : level === 'offline' ? '#6b7076' : '#19c24a';
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.emissiveIntensity = level === 'critical' ? (Math.sin(clock.elapsedTime * 10) > 0 ? 3 : 0.2) : level === 'offline' ? 0 : 1.4;
  });
  return (
    <mesh position={[0, 0.03, 0.045]}>
      <sphereGeometry args={[0.018, 12, 8]} />
      <meshStandardMaterial ref={ref} color={color} emissive={color} toneMapped={false} />
    </mesh>
  );
}

/** Неподвижная часть: ввод, краны, магистраль и опуски к печам (склеиваются, не перерисовываются с данными). */
const GasPipes = memo(function GasPipes({ config }: { config: SiteConfig }) {
  const gas = config.gas!;
  const wallZ = -config.site.hall.depth / 2 + WALL_GAP;
  const mainZ = -config.site.hall.depth / 2 + MAIN_GAP;
  const ovens = config.equipment.filter((e) => e.gasM3h);
  const { x } = gas.meter.position;
  const lastX = Math.max(x, ...ovens.map((o) => o.position.x + 0.45));
  return (
    <MergeStatic>
      {/* ввод из-под пола, кран, счётчик, выход вверх к магистрали */}
      <Pipe a={[x - 0.12, 0, wallZ]} b={[x - 0.12, 1.25, wallZ]} />
      <Valve at={[x - 0.12, 0.95, wallZ]} />
      <Pipe a={[x + 0.12, 1.75, wallZ]} b={[x + 0.12, PIPE_Y, wallZ]} />
      <Valve at={[x + 0.12, 2.05, wallZ]} />
      {/* магистраль вдоль стены к печам */}
      <Pipe a={[x + 0.12, PIPE_Y, wallZ]} b={[x + 0.12, PIPE_Y, mainZ]} />
      <Pipe a={[x + 0.12, PIPE_Y, mainZ]} b={[lastX, PIPE_Y, mainZ]} />
      {ovens.map((o) => {
        const ox = o.position.x + 0.45;
        const back = o.position.z - (SPECS[o.kind]?.depth ?? 1.6) / 2;
        return (
          <group key={o.id}>
            <Pipe a={[ox, PIPE_Y, mainZ]} b={[ox, 1.9, mainZ]} />
            <Pipe a={[ox, 1.9, mainZ]} b={[ox, 1.9, back]} />
            <Valve at={[ox, 2.2, mainZ]} />
          </group>
        );
      })}
    </MergeStatic>
  );
});

export const GasMeter = memo(function GasMeter({ config, selected, onSelect, showLabel }: { config: SiteConfig; selected: boolean; onSelect: () => void; showLabel: boolean }) {
  const g = useGas();
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!hover) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hover]);
  const gas = config.gas;
  const wallZ = -config.site.hall.depth / 2 + WALL_GAP;
  if (!gas) return null;
  const { x } = gas.meter.position;
  const level = g?.level ?? 'offline';
  const alert = level === 'warning' || level === 'critical';
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect();
  };

  return (
    <group>
      <GasPipes config={config} />

      <Select enabled={selected || hover}>
        <group onClick={click} onPointerOver={(e) => (e.stopPropagation(), setHover(true))} onPointerOut={() => setHover(false)}>
          {/* счётчик: корпус, окно счётного механизма, патрубки */}
          <group position={[x, 1.5, wallZ + 0.05]}>
            <RoundedBox args={[0.36, 0.42, 0.26]} radius={0.03} material={meterMat} castShadow />
            <mesh position={[0, 0.07, 0.131]} material={dialMat}>
              <planeGeometry args={[0.2, 0.06]} />
            </mesh>
            <mesh position={[0, -0.08, 0.131]}>
              <planeGeometry args={[0.24, 0.12]} />
              <meshStandardMaterial color="#e8eaec" roughness={0.6} />
            </mesh>
            {[-0.12, 0.12].map((dx) => (
              <mesh key={dx} position={[dx, dx < 0 ? -0.26 : 0.26, -0.05]} material={pipeMat}>
                <cylinderGeometry args={[PIPE_R * 1.3, PIPE_R * 1.3, 0.12, 10]} />
              </mesh>
            ))}
          </group>
          {/* сигнализатор загазованности — метан легче воздуха, ставят высоко */}
          {gas.detector && (
            <group position={[x + 0.55, 3.3, wallZ - 0.06]}>
              <RoundedBox args={[0.16, 0.2, 0.08]} radius={0.015} material={detMat} castShadow />
              <DetectorLed level={level} />
            </group>
          )}
        </group>
      </Select>

      <group position={[x + 0.2, 0, wallZ + 0.6]}>
        <StatusRing status={LEVEL_STATUS[level]} color={STATUS_COLOR[LEVEL_STATUS[level]]} radius={0.55} highlighted={selected || hover} />
      </group>

      {(showLabel || hover || alert) && !selected && (
        <Html position={[x + 0.2, 2.25, wallZ + 0.2]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`scene-tag${alert ? ' is-hovered' : ''}`}>
            {alert && <WarnIcon level={level} />}
            <span className="scene-tag-name">{level === 'critical' ? 'Утечка газа' : 'Газ'}</span>
            <span className="scene-tag-value">{g?.lastReading ? `${fmtNum(g.lastReading.flowM3h, 2)} м³/ч` : 'нет связи'}</span>
          </div>
        </Html>
      )}
    </group>
  );
});
