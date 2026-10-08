import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { PowerPoint } from '@bakery/shared';
import { binTable, monotonePath, nearestIndex, niceMax, niceTicks, splitByGaps, timeTicks, tzOffsetMs } from './chartMath';
import { fmtAxis, fmtKw, fmtPct, fmtTime } from './format';
import { useChartViewport } from './useChartViewport';
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
  height?: number;
  /** Откуда данные — маленький значок у заголовка («демо», «ESP32»). */
  badge?: string;
  onHoursChange?: (hours: number) => void;
  onExpand?: () => void;
  isExpanded?: boolean;
}

const PERIOD_OPTIONS = [1, 3, 6, 12, 24];
const INSETS = { left: 34, right: 12 };
const PAD_TOP = 22; // место под подписи значений над точками
const PAD_BOTTOM = 20; // подписи времени
const MIN_SPAN_MS = 15 * 60_000;
/** Расстояние между точками (px), с которого у каждой точки появляется кружок, и — подпись значения. */
const BULLETS_FROM_PX = 22;
const LABELS_FROM_PX = 40;

const SERIES = 'var(--series-1)';

function hoursLabel(h: number) {
  return h === 1 ? 'час' : h < 5 ? 'часа' : 'часов';
}

/**
 * График мощности, по логике графика из ai-solar-panels (amCharts):
 * два пальца вверх-вниз / колесо / щипок — растянуть или сжать ось времени вокруг курсора,
 * два пальца влево-вправо и перетаскивание — сдвиг с инерцией, двойной клик — плавно весь период.
 * Ось X — время (разрыв связи остаётся разрывом), ось Y — круглые деления, не прыгает при сдвиге.
 * При приближении у точек появляются кружки и значения; подсказка всегда про точку под курсором.
 */
export function PowerChart({
  points,
  nominalKw,
  fromMs,
  toMs,
  timezone,
  hours,
  bucketMs,
  height = 124,
  badge,
  onHoursChange,
  onExpand,
  isExpanded = false,
}: PowerChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [hoverPx, setHoverPx] = useState<number | null>(null);
  const [keyT, setKeyT] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const titleId = useId();
  const clipId = useId().replace(/:/g, '');
  const gradId = useId().replace(/:/g, '');

  const last = points[points.length - 1];
  const domain = useMemo(
    () => ({ min: fromMs, max: Math.max(toMs, last?.t ?? toMs), minSpan: Math.max(MIN_SPAN_MS, bucketMs * 6) }),
    [fromMs, toMs, last?.t, bucketMs]
  );
  const { view, isZoomed, dragging, reset, zoomBy, reveal } = useChartViewport(wrapRef, domain, INSETS);

  const W = Math.max(width, 200);
  const H = height;
  const plotW = Math.max(1, W - INSETS.left - INSETS.right);
  const plotH = Math.max(1, H - PAD_TOP - PAD_BOTTOM);
  const span = Math.max(1, view[1] - view[0]);
  const x = (t: number) => INSETS.left + ((t - view[0]) / span) * plotW;

  // Шкала Y — по всему периоду: при сдвиге/зуме не прыгает (как strictMinMax у референса)
  const fullPeak = useMemo(() => points.reduce((m, p) => Math.max(m, p.kw), 0), [points]);
  const yScale = useMemo(() => niceTicks(niceMax(fullPeak, nominalKw), Math.max(2, Math.floor(plotH / 24))), [fullPeak, nominalKw, plotH]);
  const y = (kw: number) => PAD_TOP + plotH - (Math.max(0, kw) / yScale.max) * plotH;

  // Видимые точки (+1 с каждой стороны, чтобы линия уходила за край, а не обрывалась)
  const lo = Math.max(0, nearestIndex(points, view[0]) - 1);
  const hi = Math.min(points.length - 1, nearestIndex(points, view[1]) + 1);
  const visible = points.length ? points.slice(lo, hi + 1) : [];
  const inView = visible.filter((p) => p.t >= view[0] && p.t <= view[1]);
  const pxPerPoint = (bucketMs / span) * plotW;

  const segs = splitByGaps(visible, bucketMs * 2.5);
  const linePaths = segs.map((s) => monotonePath(s.map((p) => [x(p.t), y(p.kw)] as const)));
  const areaPaths = segs.map((s, i) => {
    const d = linePaths[i]!;
    if (s.length < 2) return '';
    return `${d}L${x(s[s.length - 1]!.t).toFixed(1)},${y(0).toFixed(1)}L${x(s[0]!.t).toFixed(1)},${y(0).toFixed(1)}Z`;
  });

  const tzOffset = useMemo(() => tzOffsetMs(timezone, toMs), [timezone, toMs]);
  const xTicks = timeTicks(view[0], view[1], plotW, tzOffset, 60).ticks.filter((t) => {
    const px = x(t);
    return px >= INSETS.left + 16 && px <= INSETS.left + plotW - 16;
  });

  // Пик и последнее значение в окне — подписаны всегда; при приближении — все точки
  const peakInView = inView.reduce<PowerPoint | null>((m, p) => (!m || p.kw > m.kw ? p : m), null);
  const showAllBullets = pxPerPoint >= BULLETS_FROM_PX;
  const showAllLabels = pxPerPoint >= LABELS_FROM_PX;
  const marked = new Map<number, { p: PowerPoint; label: boolean }>();
  if (showAllBullets) for (const p of inView) marked.set(p.t, { p, label: showAllLabels });
  if (peakInView && peakInView.kw > 0.005) marked.set(peakInView.t, { p: peakInView, label: true });
  if (last && last.t >= view[0] && last.t <= view[1]) marked.set(last.t, { p: last, label: true });

  // Подсказка: точка под курсором по ТЕКУЩЕМУ окну (не залипает при зуме колесом)
  const hoverT = dragging ? null : hoverPx !== null ? view[0] + (hoverPx / plotW) * span : keyT;
  const hoverIdx = hoverT !== null ? nearestIndex(points, hoverT) : -1;
  const hoverPt = hoverIdx >= 0 && Math.abs(points[hoverIdx]!.t - hoverT!) <= bucketMs * 1.5 ? points[hoverIdx] : undefined;

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - INSETS.left;
    setKeyT(null);
    setHoverPx(px >= 0 && px <= plotW ? px : null);
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!points.length) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const cur = hoverPt ? hoverIdx : points.length - 1;
      const step = e.shiftKey ? 10 : 1;
      const i = Math.min(points.length - 1, Math.max(0, cur + (e.key === 'ArrowLeft' ? -step : step)));
      setHoverPx(null);
      setKeyT(points[i]!.t);
      reveal(points[i]!.t);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomBy(0.7);
    } else if (e.key === '-') {
      e.preventDefault();
      zoomBy(1 / 0.7);
    } else if (e.key === '0' || e.key === 'Home') {
      e.preventDefault();
      reset();
    } else if (e.key === 'Escape') {
      setKeyT(null);
    }
  };

  // меню периода закрывается кликом мимо и Esc
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const summary = last
    ? `Мощность за ${hours} ${hoursLabel(hours)}: сейчас ${fmtKw(last.kw)} кВт${peakInView ? `, пик в окне ${fmtKw(peakInView.kw)} кВт в ${fmtTime(peakInView.t, timezone)}` : ''}. Стрелки — значения по времени, плюс и минус — масштаб, ноль — весь период.`
    : 'Нет данных за период';
  const table = useMemo(() => binTable(inView, 30 * 60_000), [inView]);
  const wide = W >= 420;

  return (
    <div className={`chart-card${isExpanded ? ' is-expanded' : ''}`} ref={containerRef}>
      <div className="chart-header">
        <div className="chart-header-left">
          <div className="chart-title-row">
            <h3 className="chart-title">Мощность</h3>
            {badge && <span className="chart-badge">{badge}</span>}
          </div>
          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-line" aria-hidden /> кВт, среднее за {Math.round(bucketMs / 60_000)}&nbsp;мин
            </span>
            <span className="legend-item">
              <span className="legend-line is-dashed" aria-hidden /> номинал
            </span>
          </div>
        </div>

        <div className="chart-header-right">
          {isZoomed && (
            <button type="button" className="chart-btn-reset" onClick={reset} title="Весь период (или двойной клик по графику)" aria-label="Показать весь период">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              {wide && <span>Весь период</span>}
            </button>
          )}
          {onHoursChange && (
            <div className="chart-period-dropdown" ref={menuRef}>
              <button
                type="button"
                className="chart-btn-period"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                aria-label={`Период графика: ${hours} ${hoursLabel(hours)}`}
              >
                <span>{hours}&nbsp;ч</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`chevron${menuOpen ? ' rotate-180' : ''}`} aria-hidden>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {menuOpen && (
                <div role="listbox" className="chart-period-menu" aria-label="Период графика">
                  {PERIOD_OPTIONS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      role="option"
                      aria-selected={h === hours}
                      className={`chart-period-option${h === hours ? ' is-active' : ''}`}
                      onClick={() => {
                        onHoursChange(h);
                        setMenuOpen(false);
                      }}
                    >
                      За {h} {hoursLabel(h)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {onExpand && (
            <button type="button" className="chart-btn-icon" onClick={onExpand} title="Открыть график в большом окне" aria-label="Открыть график в большом окне">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div
        ref={wrapRef}
        className={`chart-svg-wrap${dragging ? ' is-dragging' : ''}`}
        style={{ touchAction: 'pan-y' }}
        title="Два пальца вверх-вниз, колесо или щипок — растянуть · влево-вправо или перетащить — сдвиг · двойной клик — весь период"
      >
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
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHoverPx(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setKeyT(null)}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
              </linearGradient>
              <clipPath id={clipId}>
                <rect x={INSETS.left} y={0} width={plotW} height={PAD_TOP + plotH + 1} />
              </clipPath>
            </defs>

            {/* сетка и деления Y */}
            {yScale.ticks.map((v) => (
              <g key={v}>
                <line x1={INSETS.left} x2={INSETS.left + plotW} y1={Math.round(y(v)) + 0.5} y2={Math.round(y(v)) + 0.5} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} strokeDasharray={v === 0 ? undefined : '3 3'} />
                <text x={INSETS.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-muted)" className="tnum">
                  {fmtAxis(v)}
                </text>
              </g>
            ))}

            {/* номинал */}
            <line x1={INSETS.left} x2={INSETS.left + plotW} y1={Math.round(y(nominalKw)) + 0.5} y2={Math.round(y(nominalKw)) + 0.5} stroke="var(--text-muted)" strokeOpacity={0.6} strokeWidth={1} strokeDasharray="5 4" />

            <g clipPath={`url(#${clipId})`}>
              <g className="chart-series" key={`${hours}`}>
                {areaPaths.map((d, i) => d && <path key={`a${i}`} d={d} fill={`url(#${gradId})`} />)}
                {linePaths.map((d, i) => (
                  <path key={`l${i}`} d={d} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                ))}
              </g>
            </g>

            {/* курсор */}
            {hoverPt && (
              <line x1={x(hoverPt.t)} x2={x(hoverPt.t)} y1={PAD_TOP - 6} y2={y(0)} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3 3" pointerEvents="none" />
            )}

            {/* кружки и значения (как кольцевые точки и подписи у референса) */}
            {[...marked.values()].map(({ p, label }) => {
              const cx = x(p.t);
              const cy = y(p.kw);
              const flip = cy - 16 < 10; // у верхнего края подпись уходит под точку
              const anchor = cx < INSETS.left + 26 ? 'start' : cx > INSETS.left + plotW - 26 ? 'end' : 'middle';
              const tx = anchor === 'start' ? cx - 4 : anchor === 'end' ? cx + 4 : cx;
              const isHover = hoverPt?.t === p.t;
              return (
                <g key={p.t} pointerEvents="none">
                  <circle cx={cx} cy={cy} r={5} fill="var(--surface-1)" />
                  <circle cx={cx} cy={cy} r={3.2} fill={isHover ? SERIES : 'var(--surface-1)'} stroke={SERIES} strokeWidth={2.2} />
                  {label && (
                    <text x={tx} y={flip ? cy + 17 : cy - 9} textAnchor={anchor} fontSize={10.5} fontWeight={650} fill="var(--text-primary)" className="tnum chart-value-label">
                      {fmtKw(p.kw)}
                    </text>
                  )}
                </g>
              );
            })}
            {hoverPt && !marked.has(hoverPt.t) && (
              <circle cx={x(hoverPt.t)} cy={y(hoverPt.kw)} r={4} fill={SERIES} stroke="var(--surface-1)" strokeWidth={2} pointerEvents="none" />
            )}

            {/* время */}
            {xTicks.map((t) => (
              <text key={t} x={x(t)} y={H - 5} textAnchor="middle" fontSize={10} fill="var(--text-muted)" className="tnum">
                {fmtTime(t, timezone)}
              </text>
            ))}
          </svg>
        )}

        {hoverPt && (
          <div
            className="chart-tooltip"
            style={x(hoverPt.t) < W / 2 ? { left: x(hoverPt.t) + 12 } : { left: x(hoverPt.t) - 12, transform: 'translateX(-100%)' }}
            role="status"
          >
            <div className="tooltip-title">{fmtTime(hoverPt.t, timezone)}</div>
            <div className="tooltip-val">
              <strong>{fmtKw(hoverPt.kw)}&nbsp;кВт</strong>
              <span className="tooltip-pct">· {fmtPct((hoverPt.kw / nominalKw) * 100)} ном.</span>
            </div>
            <div className="tooltip-sub">среднее за {Math.round(bucketMs / 60_000)}&nbsp;мин</div>
          </div>
        )}
      </div>

      <div className="chart-footer-axis" aria-hidden>
        <span>{fmtTime(view[0], timezone)}</span>
        <span className="axis-peak-hint">{peakInView ? `пик ${fmtKw(peakInView.kw)} кВт в ${fmtTime(peakInView.t, timezone)}` : 'нет данных'}</span>
        <span>{view[1] >= domain.max - span * 0.01 ? 'сейчас' : fmtTime(view[1], timezone)}</span>
      </div>

      <details className="table-view">
        <summary>Данные графика таблицей ({table.length})</summary>
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
