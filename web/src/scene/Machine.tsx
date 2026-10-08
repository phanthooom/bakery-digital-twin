import { memo, useMemo, useState } from 'react';
import { Html } from '@react-three/drei';
import { Select } from '@react-three/postprocessing';
import type { ThreeEvent } from '@react-three/fiber';
import type { EquipmentConfig } from '@bakery/shared';
import { useEquipmentState } from '../data/store';
import { fmtKw } from '../ui/format';
import { STATUS_COLOR, STATUS_LABEL } from '../ui/statusMeta';
import { GltfModel } from './GltfModel';
import { BODIES, SPECS, type MachineLive } from './machines';
import { SignalTower } from './SignalTower';
import { StatusRing } from './StatusRing';

export interface MachineProps {
  eq: EquipmentConfig;
  selected: boolean;
  hovered: boolean;
  showLabel: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

/**
 * Станок в сцене: процедурная форма по kind или GLB по полю model,
 * сигнальная колонна, кольцо статуса, подсказка при наведении, контур при выборе.
 */
export const Machine = memo(function Machine({ eq, selected, hovered, showLabel, onHover, onSelect }: MachineProps) {
  const state = useEquipmentState(eq.id);
  const status = state?.status ?? 'offline';
  const powerKw = state?.lastReading?.powerKw ?? 0;
  const load = (state?.pctOfNominal ?? 0) / 100;
  const color = STATUS_COLOR[status];
  const live: MachineLive = useMemo(() => ({ status, powerKw, load, statusColor: color }), [status, powerKw, load, color]);

  const spec = SPECS[eq.kind] ?? SPECS.generic;
  const [glbHeight, setGlbHeight] = useState<number | null>(null);
  const Body = BODIES[eq.kind] ?? BODIES.generic;
  const body = <Body live={live} />;
  const towerPos: [number, number, number] = eq.model && glbHeight ? [0, glbHeight, 0] : spec.tower;
  const top = Math.max(spec.height, towerPos[1] + 0.45, eq.kind === 'oven' ? 3.1 : 0);

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(eq.id);
  };
  const out = () => onHover(null);
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(eq.id);
  };

  return (
    <group position={[eq.position.x, eq.position.y, eq.position.z]} rotation={[0, eq.rotationY ?? 0, 0]}>
      <Select enabled={selected || hovered}>
        <group onPointerOver={over} onPointerOut={out} onClick={click}>
          {eq.model ? <GltfModel url={eq.model} scale={eq.modelScale} onHeight={setGlbHeight} fallback={body} /> : body}
          <SignalTower position={towerPos} status={status} />
        </group>
      </Select>
      <StatusRing status={status} color={color} radius={spec.ringRadius} highlighted={selected || hovered} />
      {(showLabel || (hovered && !selected)) && (
        <Html position={[0, top + 0.25, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`scene-tag${hovered ? ' is-hovered' : ''}`}>
            <span className="dot" style={{ background: color }} aria-hidden />
            <span className="scene-tag-name">{eq.name}</span>
            <span className="scene-tag-value">{status === 'offline' ? STATUS_LABEL.offline : `${fmtKw(powerKw)} кВт`}</span>
          </div>
        </Html>
      )}
    </group>
  );
});
