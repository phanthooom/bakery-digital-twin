import { memo, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import { Select } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { EquipmentConfig, SiteConfig } from '@bakery/shared';
import { useEquipmentState, useStates } from '../data/store';
import { fmtNum } from '../ui/format';
import { LINE_COLOR, LINE_LABEL, lineInfo } from '../ui/lineMeta';
import { M } from './materials';
import { buildRoutes, type Route } from './powerRoutes';

const DASH_M = 0.3;

function makeDashTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 64, 4);
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,1)');
  g.addColorStop(0.7, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

interface LineProps {
  config: SiteConfig;
  eq: EquipmentConfig;
  route: Route;
  selected: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

/** Одна линия питания: кабель, по которому бегут «импульсы» тока; скорость — от загрузки, цвет — от состояния. */
const PowerLine = memo(function PowerLine({ config, eq, route, selected, hovered, onHover, onSelect }: LineProps) {
  const state = useEquipmentState(eq.id);
  const info = lineInfo(config, eq, state);
  const { level } = info.health;
  const color = LINE_COLOR[level];
  const flowing = level !== 'idle' && level !== 'offline';
  const speed = flowing ? 0.4 + Math.min(1.2, (info.health.loadPct ?? 0) / 100) * 1.6 : 0;

  const { geometry, hitGeometry } = useMemo(() => {
    const segs = Math.max(20, Math.round(route.length * 4));
    const hitSegs = Math.max(12, Math.round(route.length * 2));
    return {
      geometry: new THREE.TubeGeometry(route.path, segs, 0.022, 6, false),
      hitGeometry: new THREE.TubeGeometry(route.path, hitSegs, 0.1, 4, false),
    };
  }, [route]);
  const baseColor = useMemo(
    () => (flowing ? new THREE.Color(color).multiplyScalar(0.35) : new THREE.Color(level === 'offline' ? '#7c7a74' : '#3a3b3d')),
    [flowing, color, level],
  );
  const dash = useMemo(() => {
    const t = makeDashTexture();
    t.repeat.set(route.length / DASH_M, 1);
    return t;
  }, [route.length]);
  const mat = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((s, dt) => {
    if (flowing) {
      dash.offset.x -= (dt * speed) / DASH_M;
    }
    const m = mat.current;
    if (!m) return;
    const blink = level === 'critical' ? 0.6 + 0.4 * Math.sin(s.clock.elapsedTime * 6) : 1;
    m.emissiveIntensity = flowing ? (selected || hovered ? 3 : 2) * blink : 0;
  });

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(eq.id);
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(eq.id);
  };

  return (
    <group>
      <Select enabled={selected || hovered}>
        <mesh geometry={geometry}>
          <meshStandardMaterial
            ref={mat}
            color={baseColor}
            emissive={color}
            emissiveMap={dash}
            emissiveIntensity={0}
            roughness={0.55}
            toneMapped={false}
          />
        </mesh>
      </Select>
      <mesh geometry={hitGeometry} visible={false} onPointerOver={over} onPointerOut={() => onHover(null)} onClick={click} />
      {hovered && !selected && (
        <Html position={route.labelAt} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="scene-tag is-hovered">
            <span className="dot" style={{ background: color }} aria-hidden />
            <span className="scene-tag-name">
              {info.feeder.id} → {eq.name}
            </span>
            <span className="scene-tag-value">
              {info.health.loadPct === null ? LINE_LABEL.offline : `${fmtNum(info.health.loadPct)} % автомата`}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
});

/** Щит: индикаторы показывают худшее состояние линий; клик — карточка щита. */
function PowerPanel({ config, selected, onSelect }: { config: SiteConfig; selected: boolean; onSelect: () => void }) {
  const panel = config.power!.panel;
  const states = useStates();
  const worst = useMemo(() => {
    const levels = config.equipment.map((eq) => lineInfo(config, eq, states.get(eq.id)).health.level);
    return levels.includes('critical') ? 'critical' : levels.includes('warning') ? 'warning' : 'ok';
  }, [config, states]);
  const led = worst === 'critical' ? LINE_COLOR.critical : worst === 'warning' ? LINE_COLOR.warning : '#38c24a';
  return (
    <Select enabled={selected}>
      <group
        position={[panel.position.x, 0, panel.position.z]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <RoundedBox args={[0.9, 1.9, 0.35]} radius={0.03} position={[0, 0.95, 0]} material={M.steelLight} castShadow />
        <mesh position={[0, 1.55, 0.18]}>
          <circleGeometry args={[0.035, 16]} />
          <meshStandardMaterial color={led} emissive={led} emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
        <mesh position={[0.12, 1.55, 0.18]}>
          <circleGeometry args={[0.025, 16]} />
          <meshStandardMaterial color="#38c24a" emissive="#38c24a" emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
        <mesh position={[0, 1.2, 0.181]} material={M.black}>
          <planeGeometry args={[0.5, 0.18]} />
        </mesh>
        <Html position={[0, 1.2, 0.19]} transform scale={0.12} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{ color: '#fff', font: '700 40px system-ui', letterSpacing: 2 }}>{panel.id}</div>
        </Html>
      </group>
    </Select>
  );
}

export interface PowerLinesProps {
  config: SiteConfig;
  selectedLineId: string | null;
  panelSelected: boolean;
  hoveredLineId: string | null;
  onHoverLine: (id: string | null) => void;
  onSelectLine: (id: string) => void;
  onSelectPanel: () => void;
}

export function PowerLines({ config, selectedLineId, panelSelected, hoveredLineId, onHoverLine, onSelectLine, onSelectPanel }: PowerLinesProps) {
  const routes = useMemo(() => buildRoutes(config), [config]);
  if (!config.power) return null;
  return (
    <group>
      <PowerPanel config={config} selected={panelSelected} onSelect={onSelectPanel} />
      {routes.map((r) => {
        const eq = config.equipment.find((e) => e.id === r.equipmentId)!;
        return (
          <PowerLine
            key={r.equipmentId}
            config={config}
            eq={eq}
            route={r}
            selected={selectedLineId === eq.id}
            hovered={hoveredLineId === eq.id}
            onHover={onHoverLine}
            onSelect={onSelectLine}
          />
        );
      })}
    </group>
  );
}
