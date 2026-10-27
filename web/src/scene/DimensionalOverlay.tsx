import { memo, useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import type { SiteConfig } from '@bakery/shared';
import { SPECS } from './machines';

export interface DimensionalOverlayProps {
  config: SiteConfig;
  /** ID выбранного станка (если выбран — вокруг него строятся 3D-размерные линии Д × Ш × В) */
  selectedId?: string | null;
  /** Показывать ли общие архитектурные оси и габариты цеха */
  visible?: boolean;
  /** Ночной режим (меняет контраст размерных линий) */
  isNight?: boolean;
}

interface DimLineProps {
  a: [number, number, number];
  b: [number, number, number];
  tickDir: [number, number, number];
  label: string;
  color: string;
  badgeBg: string;
  badgeColor: string;
}

/**
 * Одна инженерная размерная линия с засечками на концах и выноской размера в метрах
 * (в стиле enesozturk/dimensional-drawing).
 */
function DimensionLine({ a, b, tickDir, label, color, badgeBg, badgeColor }: DimLineProps) {
  const { mainPts, tickA, tickB, mid } = useMemo(() => {
    const [tx, ty, tz] = tickDir;
    return {
      mainPts: [a, b] as [number, number, number][],
      tickA: [
        [a[0] - tx, a[1] - ty, a[2] - tz],
        [a[0] + tx, a[1] + ty, a[2] + tz],
      ] as [number, number, number][],
      tickB: [
        [b[0] - tx, b[1] - ty, b[2] - tz],
        [b[0] + tx, b[1] + ty, b[2] + tz],
      ] as [number, number, number][],
      mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as [number, number, number],
    };
  }, [a, b, tickDir]);

  return (
    <group>
      <Line points={mainPts} color={color} lineWidth={1.5} />
      <Line points={tickA} color={color} lineWidth={1.8} />
      <Line points={tickB} color={color} lineWidth={1.8} />
      <Html position={mid} center zIndexRange={[18, 0]} style={{ pointerEvents: 'none' }}>
        <div
          style={{
            background: badgeBg,
            color: badgeColor,
            border: `1px solid ${color}`,
            borderRadius: 5,
            padding: '2px 6px',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

/**
 * 3D-слой архитектурных и инженерных размерных линий (CAD / Dimensional Drawing):
 * - Габариты пролёта цеха (Ширина × Глубина × Высота конька)
 * - Отметка уровня мезонина (+3,200 м)
 * - Габаритная рамка (Д × Ш × В) вокруг выбранного станка
 */
export const DimensionalOverlay = memo(function DimensionalOverlay({
  config,
  selectedId,
  visible = true,
  isNight = false,
}: DimensionalOverlayProps) {
  if (!visible) return null;

  const { width: W, depth: D, height: H } = config.site.hall;
  const lineColor = isNight ? '#63b3ff' : '#2563eb';
  const eqColor = isNight ? '#fbbf24' : '#B71F3E';
  const badgeBg = isNight ? 'rgba(13, 22, 38, 0.92)' : 'rgba(252, 252, 251, 0.94)';
  const badgeColor = isNight ? '#e2f1ff' : '#1b2432';

  const selectedEq = useMemo(
    () => (selectedId ? config.equipment.find((e) => e.id === selectedId) ?? null : null),
    [config.equipment, selectedId],
  );

  const eqSpec = selectedEq ? SPECS[selectedEq.kind] ?? SPECS.generic : null;
  const eqR = eqSpec ? eqSpec.ringRadius : 1.2;
  const eqH = eqSpec ? eqSpec.height : 2.0;

  return (
    <group>
      {/* Архитектурный размер ширины цеха вдоль заднего фасада */}
      <DimensionLine
        a={[-W / 2, 0.04, -D / 2 - 1.6]}
        b={[W / 2, 0.04, -D / 2 - 1.6]}
        tickDir={[0, 0, 0.35]}
        label={`⟷ ${W.toFixed(1).replace('.', ',')} м (пролёт цеха)`}
        color={lineColor}
        badgeBg={badgeBg}
        badgeColor={badgeColor}
      />

      {/* Архитектурный размер глубины цеха вдоль левого фасада */}
      <DimensionLine
        a={[-W / 2 - 1.6, 0.04, -D / 2]}
        b={[-W / 2 - 1.6, 0.04, D / 2]}
        tickDir={[0.35, 0, 0]}
        label={`⟷ ${D.toFixed(1).replace('.', ',')} м (глубина)`}
        color={lineColor}
        badgeBg={badgeBg}
        badgeColor={badgeColor}
      />

      {/* Высотная отметка кровли и мезонина у заднего левого угла */}
      <DimensionLine
        a={[-W / 2 - 1.2, 0, -D / 2]}
        b={[-W / 2 - 1.2, H, -D / 2]}
        tickDir={[0.25, 0, 0]}
        label={`↕ +${H.toFixed(3).replace('.', ',')} м`}
        color={lineColor}
        badgeBg={badgeBg}
        badgeColor={badgeColor}
      />
      {config.mezzanine && (
        <DimensionLine
          a={[-W / 2 - 0.55, 0, -D / 2 + 0.6]}
          b={[-W / 2 - 0.55, 3.2, -D / 2 + 0.6]}
          tickDir={[0.2, 0, 0]}
          label="2 эт. +3,200 м"
          color={lineColor}
          badgeBg={badgeBg}
          badgeColor={badgeColor}
        />
      )}

      {/* Инженерные габариты выбранного станка (Д × Ш × В) */}
      {selectedEq && (
        <group position={[selectedEq.position.x, selectedEq.position.y ?? 0, selectedEq.position.z]}>
          <DimensionLine
            a={[-eqR, 0.05, eqR + 0.35]}
            b={[eqR, 0.05, eqR + 0.35]}
            tickDir={[0, 0, 0.14]}
            label={`${(eqR * 2).toFixed(2).replace('.', ',')} м`}
            color={eqColor}
            badgeBg={badgeBg}
            badgeColor={badgeColor}
          />
          <DimensionLine
            a={[eqR + 0.35, 0, eqR]}
            b={[eqR + 0.35, eqH, eqR]}
            tickDir={[0.14, 0, 0]}
            label={`В ${eqH.toFixed(2).replace('.', ',')} м`}
            color={eqColor}
            badgeBg={badgeBg}
            badgeColor={badgeColor}
          />
        </group>
      )}
    </group>
  );
});
