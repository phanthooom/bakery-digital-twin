import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { PowerPoint } from '@bakery/shared';
import { binTable, nearestIndex, niceMax, splitByGaps } from './chartMath';
import { fmtKw, fmtPct, fmtTime } from './format';
import { useElementWidth } from './useNow';

export interface PowerChartProps {
  points: PowerPoint[];
  peak: PowerPoint | null;
  nominalKw: number;
  fromMs: number;
  toMs: number;
  timezone: string;
  hours: number;
  bucketMs: number;
}

const PLOT_H = 76;
const PAD_TOP = 8;

const SERIES = 'var(--series-1)';

/**
 * Мощность за последние N часов: одна серия (легенда не нужна — подпись в заголовке),
 * линия 2px + заливка 10 %, тонкая линия номинала, точка «сейчас», пик подписан под осью.
 * Наведение/клавиши ←/→ — перекрестие с подсказкой; есть табличное представление.
 */
export function PowerChart({ points, peak, nominalKw, fromMs, toMs, timezone, hours, bucketMs }: PowerChartProps) {
  const [setRef, width] = useElementWidth<HTMLDivElement>();
  const [cursor, setCursor] = useState<number | null>(null);
  const titleId = useId();
  const W = Math.max(width, 120);
  const H = PLOT_H + PAD_TOP;
  const yMax = niceMax(peak?.kw ?? 0, nominalKw);
  const x = (t: number) => ((t - fromMs) / (toMs - fromMs)) * W;
  const y = (kw: number) => PAD_TOP + PLOT_H - (kw / yMax) * PLOT_H;

  const { linePaths, areaPaths } = useMemo(() => {
    const segs = splitByGaps(points, bucketMs * 2.5);
    const lp: string[] = [];
    const ap: string[] = [];
    for (const s of segs) {
      const d = s.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.kw).toFixed(1)}`).join('');
      lp.push(s.length === 1 ? `${d}h1` : d);
      ap.push(`${d}L${x(s[s.length - 1]!.t).toFixed(1)},${y(0)}L${x(s[0]!.t).toFixed(1)},${y(0)}Z`);
    }
    return { linePaths: lp, areaPaths: ap };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, W, yMax, fromMs, toMs, bucketMs]);

  const last = points[points.length - 1];
  const hover = cursor !== null ? points[cursor] : undefined;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = fromMs + ((e.clientX - r.left) / r.width) * (toMs - fromMs);
    const i = nearestIndex(points, t);
    setCursor(i >= 0 ? i : null);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!points.length) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 30 : 5;
      const cur = cursor ?? points.length - 1;
      setCursor(Math.min(points.length - 1, Math.max(0, cur + (e.key === 'ArrowLeft' ? -step : step))));
    } else if (e.key === 'Escape') {
      setCursor(null);
    }
  };

  const summary = last
    ? `Мощность за ${hours} ч: сейчас ${fmtKw(last.kw)} кВт${peak ? `, пик ${fmtKw(peak.kw)} кВт в ${fmtTime(peak.t, timezone)}` : ''}. Стрелки влево/вправо — значения по времени.`
    : 'Нет данных за период';
  const table = useMemo(() => binTable(points, 30 * 60_000), [points]);

  return (
    <div className="chart" ref={setRef}>
      <span id={titleId} className="sr-only">
        {summary}
      </span>
      {width > 0 && (
        <svg
          width={W}
          height={H}
          role="img"
          aria-labelledby={titleId}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setCursor(null)}
          onKeyDown={onKey}
          onBlur={() => setCursor(null)}
        >
          {/* базовая линия и номинал — тонкие сплошные, приглушённые */}
          <line x1={0} x2={W} y1={y(0) + 0.5} y2={y(0) + 0.5} stroke="var(--axis)" strokeWidth={1} />
          <line x1={0} x2={W} y1={Math.round(y(nominalKw)) + 0.5} y2={Math.round(y(nominalKw)) + 0.5} stroke="var(--grid)" strokeWidth={1} />
          <text x={W} y={y(nominalKw) - 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">
            номинал {fmtKw(nominalKw)} кВт
          </text>
          {areaPaths.map((d, i) => (
            <path key={`a${i}`} d={d} fill={SERIES} fillOpacity={0.1} />
          ))}
          {linePaths.map((d, i) => (
            <path key={`l${i}`} d={d} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {last && !hover && <circle cx={x(last.t)} cy={y(last.kw)} r={4} fill={SERIES} stroke="var(--surface-1)" strokeWidth={2} />}
          {hover && (
            <g pointerEvents="none">
              <line x1={x(hover.t)} x2={x(hover.t)} y1={PAD_TOP} y2={y(0)} stroke="var(--text-muted)" strokeWidth={1} />
              <circle cx={x(hover.t)} cy={y(hover.kw)} r={4} fill={SERIES} stroke="var(--surface-1)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {hover && (
        <div
          className="chart-tooltip"
          style={x(hover.t) < W / 2 ? { left: x(hover.t) + 10 } : { left: x(hover.t) - 10, transform: 'translateX(-100%)' }}
          role="status"
        >
          <strong>{fmtKw(hover.kw)}&nbsp;кВт</strong> <span className="muted">· {fmtPct((hover.kw / nominalKw) * 100)}</span>
          <div className="muted">{fmtTime(hover.t, timezone)}, среднее за {Math.round(bucketMs / 60_000)}&nbsp;мин</div>
        </div>
      )}
      <div className="chart-axis" aria-hidden>
        <span>{hours}&nbsp;ч назад</span>
        <span>{peak ? `пик ${fmtKw(peak.kw)} кВт · ${fmtTime(peak.t, timezone)}` : '—'}</span>
        <span>сейчас</span>
      </div>
      <details className="table-view">
        <summary>Данные графика таблицей</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Интервал</th>
              <th scope="col">Сред., кВт</th>
              <th scope="col">Макс., кВт</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.t}>
                <td>{fmtTime(r.t, timezone)}</td>
                <td>{fmtKw(r.avg)}</td>
                <td>{fmtKw(r.max)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
