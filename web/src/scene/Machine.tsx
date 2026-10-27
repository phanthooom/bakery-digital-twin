import { memo, useMemo, useState } from 'react';
import { Html } from '@react-three/drei';
import { Select } from '@react-three/postprocessing';
import type { ThreeEvent } from '@react-three/fiber';
import type { EquipmentConfig } from '@bakery/shared';
import { useEquipmentState } from '../data/store';
import { fmtKw } from '../ui/format';
import { STATUS_COLOR, STATUS_LABEL } from '../ui/statusMeta';
import { StatusIcon } from '../ui/StatusIcon';
import { GltfModel } from './GltfModel';
import { BODIES, SPECS, Steam, type MachineLive } from './machines';
import { SignalTower } from './SignalTower';
import { StatusRing } from './StatusRing';

export interface MachineProps {
  eq: EquipmentConfig;
  selected: boolean;
  hovered: boolean;
  showLabel: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  isNight?: boolean;
}

/**
 * Станок в сцене: процедурная форма по kind или GLB по полю model,
 * сигнальная колонна, кольцо статуса, подсказка при наведении, контур при выборе.
 */
export const Machine = memo(function Machine({ eq, selected, hovered, showLabel, onHover, onSelect, isNight = false }: MachineProps) {
  const state = useEquipmentState(eq.id);
  const status = state?.status ?? 'offline';
  const powerKw = state?.lastReading?.powerKw ?? 0;
  const load = (state?.pctOfNominal ?? 0) / 100;
  const color = STATUS_COLOR[status];
  const live: MachineLive = useMemo(() => ({ status, powerKw, load, statusColor: color }), [status, powerKw, load, color]);

  const spec = SPECS[eq.kind] ?? SPECS.generic;
  const [glbHeight, setGlbHeight] = useState<number | null>(null);
  const Body = BODIES[eq.kind] ?? BODIES.generic;
  const body = <Body live={live} eq={eq} />;
  const towerPos: [number, number, number] = [
    spec.tower[0],
    eq.kind === 'silo' && glbHeight ? glbHeight : spec.tower[1],
    spec.tower[2],
  ];
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

  const isHeating = status === 'running' || status === 'alarm';

  return (
    <group position={[eq.position.x, eq.position.y, eq.position.z]} rotation={[0, eq.rotationY ?? 0, 0]}>
      <Select enabled={selected || hovered}>
        <group onPointerOver={over} onPointerOut={out} onClick={click}>
          {eq.model ? (
            <GltfModel url={eq.model} scale={eq.modelScale} onHeight={setGlbHeight} live={live} fallback={body}>
              {eq.kind === 'oven' && (
                <>
                  <group position={[-0.35, 0, -0.3]}>
                    <Steam active={isHeating} y={glbHeight ?? 2.95} />
                  </group>
                  {isNight && isHeating && (
                    <pointLight position={[0, 1.15, 0.95]} color="#ff6b1a" intensity={9} distance={6.5} decay={1.8} />
                  )}
                </>
              )}
            </GltfModel>
          ) : (
            body
          )}
          <SignalTower position={towerPos} status={status} />
        </group>
      </Select>
      <StatusRing status={status} color={color} radius={spec.ringRadius} highlighted={selected || hovered} />
      {state?.lastReading?.order && (
        <Html position={[0, top + (showLabel || (hovered && !selected) ? 0.8 : 0.4), 0]} center zIndexRange={[25, 0]}>
          <button
            type="button"
            className="order-scene-badge"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(eq.id);
            }}
            style={{ border: 'none', font: 'inherit' }}
            title={state.lastReading.order}
          >
            <span className="order-scene-dot" />
            <span>🥐 {state.lastReading.order.split(':')[0]} в работе</span>
          </button>
        </Html>
      )}
      {(showLabel || (hovered && !selected)) && (
        <Html position={[0, top + 0.25, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`scene-tag${hovered ? ' is-hovered' : ''}`}>
            <StatusIcon status={status} size={12} />
            <span className="scene-tag-name">{eq.name}</span>
            <span className="scene-tag-value">
              {status === 'offline'
                ? STATUS_LABEL.offline
                : `${fmtKw(powerKw)} кВт${state?.climate?.temperatureC != null ? ` · ${state.climate.temperatureC.toFixed(0)} °C` : ''}`}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
});
