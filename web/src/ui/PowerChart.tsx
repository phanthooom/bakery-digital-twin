import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { PowerPoint } from '@bakery/shared';
import { binTable, nearestIndex, niceMax, splitByGaps } from './chartMath';
import { fmtKw, fmtPct, fmtTime } from './format';
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
  onHoursChange?: (hours: number) => void;
  onExpand?: () => void;
  isExpanded?: boolean;
}

const PERIOD_OPTIONS = [1, 3, 6, 12, 24];

const INSETS = { left: 42, right: 14 };

/**
 * Интерактивный график мощности в стиле beb-dental (Photo 2):
 * - Плавный физический зум колесом / тачпадом вокруг курсора и щипком
 * - Горизонтальная прокрутка перетаскиванием с инерцией
 * - Кнопка «Сбросить зум» (появляется при увеличении) и сброс по двойному клику
 * - Выбор временного диапазона (1 ч, 3 ч, 6 ч, 12 ч, 24 ч)
 * - Кнопка разворачивания на полный экран / модальное окно
 * - Мягкий градиент под линией, сетка, подписи шкалы Y
 * - Акцентные круглые маркеры с крупными числовыми подписями над ключевыми точками (пик, текущее значение)
 */
export function PowerChart({
  points,
  nominalKw,
  fromMs,
  toMs,
  timezone,
  hours,
  bucketMs,
  height = 120,
  onHoursChange,
  onExpand,
  isExpanded = false,
}: PowerChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false);
  const titleId = useId();
  const clipId = useId();
  const gradId = useId();

  // Общее число точек для вьюпорта
  const total = points.length;

  // Физический вьюпорт с плавной инерцией и жестами из beb-dental
  const { view, isZoomed, reset } = useChartViewport(chartWrapRef, total, INSETS, 3);

  const W = Math.max(width, 240);
  const H = height;
  const PAD_TOP = 24;
  const PAD_BOTTOM = 22;
  const plotW = Math.max(1, W - INSETS.left - INSETS.right);
  const plotH = Math.max(1, H - PAD_TOP - PAD_BOTTOM);

  // Видимые точки и расчёт Y-диапазона
  const startInt = Math.max(0, Math.floor(view[0]));
  const endInt = Math.min(Math.max(0, total - 1), Math.ceil(view[1]));
  const visiblePoints = useMemo(() => {
    if (!total) return [];
    return points.slice(startInt, endInt + 1).map((p, i) => ({ ...p, origIdx: startInt + i }));
  }, [points, startInt, endInt, total]);

  const maxVisibleKw = useMemo(() => {
    if (!visiblePoints.length) return 0;
    return Math.max(...visiblePoints.map((p) => p.kw));
  }, [visiblePoints]);

  const yMax = useMemo(() => niceMax(maxVisibleKw, nominalKw), [maxVisibleKw, nominalKw]);

  // Координатные проекции
  const xByIndex = (idx: number) => {
    const span = Math.max(0.001, view[1] - view[0]);
    return INSETS.left + ((idx - view[0]) / span) * plotW;
  };

  const yByKw = (kw: number) => {
    return PAD_TOP + plotH - (Math.max(0, kw) / yMax) * plotH;
  };

  // Построение сегментов линии и градиентной подложки
  const { linePaths, areaPaths } = useMemo(() => {
    if (visiblePoints.length === 0) return { linePaths: [], areaPaths: [] };

    // Берём небольшой запас по 1 точке слева и справа для плавного входа за пределы viewBox
    const padStart = Math.max(0, startInt - 1);
    const padEnd = Math.min(total - 1, endInt + 1);
    const subPoints = points.slice(padStart, padEnd + 1).map((p, i) => ({ ...p, origIdx: padStart + i }));

    const segs = splitByGaps(subPoints, bucketMs * 2.5);
    const lp: string[] = [];
    const ap: string[] = [];

    for (const s of segs) {
      if (!s.length) continue;
      const d = s.map((p, i) => `${i ? 'L' : 'M'}${xByIndex(p.origIdx).toFixed(1)},${yByKw(p.kw).toFixed(1)}`).join(' ');
      lp.push(s.length === 1 ? `${d} h1` : d);

      const firstX = xByIndex(s[0]!.origIdx).toFixed(1);
      const lastX = xByIndex(s[s.length - 1]!.origIdx).toFixed(1);
      const bottomY = (PAD_TOP + plotH).toFixed(1);
      ap.push(`${d} L${lastX},${bottomY} L${firstX},${bottomY} Z`);
    }

    return { linePaths: lp, areaPaths: ap };
  }, [points, visiblePoints, startInt, endInt, total, view, bucketMs, yMax, plotW, plotH]);

  // Вычисление ключевых точек для акцентных круглых маркеров (как на Photo 2)
  const markers = useMemo(() => {
    if (visiblePoints.length < 2) return [];

    const res: Array<{ idx: number; t: number; kw: number; isPeak?: boolean; isLast?: boolean }> = [];

    // 1. Пиковая точка в видимом окне
    let peakPt = visiblePoints[0]!;
    for (const p of visiblePoints) {
      if (p.kw > peakPt.kw) peakPt = p;
    }
    if (peakPt.kw > 0.05) {
      res.push({ idx: peakPt.origIdx, t: peakPt.t, kw: peakPt.kw, isPeak: true });
    }

    // 2. Текущее (последнее) значение, если оно близко к правому краю видимости
    if (endInt >= total - 2) {
      const lastPt = points[total - 1]!;
      // Не дублируем, если пик совпадает с последней точкой
      if (Math.abs((total - 1) - peakPt.origIdx) > 2 || peakPt.kw <= 0.05) {
        res.push({ idx: total - 1, t: lastPt.t, kw: lastPt.kw, isLast: true });
      }
    }

    // 3. Начальная видимая точка (если диапазон достаточно широк и она не накладывается)
    if (startInt <= 1 && visiblePoints.length > 8) {
      const firstPt = visiblePoints[0]!;
      if (Math.abs(firstPt.origIdx - peakPt.origIdx) > 6) {
        res.push({ idx: firstPt.origIdx, t: firstPt.t, kw: firstPt.kw });
      }
    }

    return res;
  }, [visiblePoints, endInt, startInt, total, points]);

  // Сетка и уровни шкалы Y
  const yTicks = useMemo(() => {
    const count = 3;
    const ticks: number[] = [];
    for (let i = 0; i <= count; i++) {
      ticks.push((yMax / count) * i);
    }
    return ticks;
  }, [yMax]);

  // Шкала X по времени (крупные равномерные шаги)
  const xTicks = useMemo(() => {
    if (visiblePoints.length < 2) return [];
    const t0 = visiblePoints[0]!.t;
    const t1 = visiblePoints[visiblePoints.length - 1]!.t;
    const spanMs = Math.max(60_000, t1 - t0);

    let stepMs = 60 * 60_000;
    if (spanMs <= 15 * 60_000) stepMs = 3 * 60_000;
    else if (spanMs <= 30 * 60_000) stepMs = 5 * 60_000;
    else if (spanMs <= 60 * 60_000) stepMs = 15 * 60_000;
    else if (spanMs <= 3 * 3600_000) stepMs = 30 * 60_000;
    else if (spanMs <= 6 * 3600_000) stepMs = 60 * 60_000;
    else if (spanMs <= 12 * 3600_000) stepMs = 2 * 3600_000;
    else stepMs = 4 * 3600_000;

    const ticks: Array<{ t: number; x: number }> = [];
    const firstTick = Math.ceil(t0 / stepMs) * stepMs;
    for (let t = firstTick; t <= t1; t += stepMs) {
      // Ищем ближайший индекс в массиве точек для точной координаты X
      const idx = nearestIndex(points, t);
      if (idx >= 0) {
        const x = xByIndex(idx);
        if (x >= INSETS.left + 15 && x <= INSETS.left + plotW - 15) {
          ticks.push({ t, x });
        }
      }
    }
    return ticks;
  }, [visiblePoints, points, view, plotW]);

  // Интерактивное наведение и подсказка
  const hover = cursor !== null && cursor >= 0 && cursor < total ? points[cursor] : undefined;

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left - INSETS.left) / plotW;
    const boundedRelX = Math.max(0, Math.min(1, relX));
    const targetIdx = view[0] + boundedRelX * (view[1] - view[0]);
    const roundedIdx = Math.max(0, Math.min(total - 1, Math.round(targetIdx)));
    setCursor(roundedIdx);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!total) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const cur = cursor ?? total - 1;
      setCursor(Math.min(total - 1, Math.max(0, cur + (e.key === 'ArrowLeft' ? -step : step))));
    } else if (e.key === 'Escape') {
      setCursor(null);
    }
  };

  const lastPt = total > 0 ? points[total - 1] : undefined;
  const currentPeak = useMemo(() => {
    if (!total) return null;
    let m = points[0]!;
    for (const p of points) if (p.kw > m.kw) m = p;
    return m;
  }, [points, total]);

  const summary = lastPt
    ? `Мощность за ${hours} ч: сейчас ${fmtKw(lastPt.kw)} кВт${currentPeak ? `, пик ${fmtKw(currentPeak.kw)} кВт в ${fmtTime(currentPeak.t, timezone)}` : ''}.`
    : 'Нет данных за период';

  const table = useMemo(() => binTable(points, 30 * 60_000), [points]);

  return (
    <div className={`chart-card${isExpanded ? ' is-expanded' : ''}`} ref={containerRef}>
      {/* Шапка графика в точности как на Photo 2 */}
      <div className="chart-header">
        <div className="chart-header-left">
          <div className="chart-title-row">
            <h3 className="chart-title">Динамика мощности</h3>
            <span className="chart-badge">ESP32</span>
          </div>
          <div className="chart-legend">
            <div className="legend-item">
              <span className="legend-dot dot-blue" />
              <span>Мощность</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot dot-nominal" />
              <span>Номинал {fmtKw(nominalKw)} кВт</span>
            </div>
          </div>
        </div>

        <div className="chart-header-right">
          {/* Кнопка сброса масштаба (появляется при зуме) */}
          {isZoomed && (
            <button
              type="button"
              className="chart-btn-reset"
              onClick={reset}
              title="Сбросить зум на весь период (или двойной клик по графику)"
              aria-label="Сбросить зум"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>Сбросить зум</span>
            </button>
          )}

          {/* Выпадающий список периода */}
          <div className="chart-period-dropdown">
            <button
              type="button"
              className="chart-btn-period"
              onClick={() => setIsPeriodMenuOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={isPeriodMenuOpen}
              aria-label="Выбрать период графика"
            >
              <span>За {hours} ч.</span>
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`chevron${isPeriodMenuOpen ? ' rotate-180' : ''}`}
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {isPeriodMenuOpen && (
              <div role="listbox" className="chart-period-menu">
                {PERIOD_OPTIONS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    role="option"
                    aria-selected={h === hours}
                    className={`chart-period-option${h === hours ? ' is-active' : ''}`}
                    onClick={() => {
                      onHoursChange?.(h);
                      setIsPeriodMenuOpen(false);
                    }}
                  >
                    За {h} {h === 1 ? 'час' : h < 5 ? 'часа' : 'часов'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Кнопка разворачивания графика */}
          {onExpand && (
            <button
              type="button"
              className="chart-btn-icon"
              onClick={onExpand}
              title={isExpanded ? 'Свернуть график' : 'Развернуть график для детального анализа'}
              aria-label={isExpanded ? 'Свернуть' : 'Развернуть'}
            >
              {isExpanded ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Интерактивное полотно SVG с жестами сглаживания */}
      <div
        ref={chartWrapRef}
        className="chart-svg-wrap"
        style={{ touchAction: 'pan-y' }}
        title="Колесо мыши или свайп двумя пальцами — масштаб · перетаскивание мышью — прокрутка · двойной клик — сброс"
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
            onPointerLeave={() => setCursor(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setCursor(null)}
          >
            <defs>
              {/* Мягкий градиент как в beb-dental */}
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
              </linearGradient>

              {/* Обрезка кривой по области построения */}
              <clipPath id={clipId}>
                <rect x={INSETS.left} y={0} width={plotW} height={H} />
              </clipPath>
            </defs>

            {/* Сетка и метки оси Y */}
            {yTicks.map((val, idx) => {
              const y = yByKw(val);
              return (
                <g key={`y-${idx}`}>
                  <line
                    x1={INSETS.left}
                    x2={INSETS.left + plotW}
                    y1={Math.round(y) + 0.5}
                    y2={Math.round(y) + 0.5}
                    stroke="#F1F5F9"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <text
                    x={INSETS.left - 6}
                    y={y + 3.5}
                    textAnchor="end"
                    fontSize={9.5}
                    fill="#94A3B8"
                    fontFamily="system-ui, sans-serif"
                  >
                    {fmtKw(val)}&nbsp;кВт
                  </text>
                </g>
              );
            })}

            {/* Линия номинала */}
            {nominalKw <= yMax && (
              <g>
                <line
                  x1={INSETS.left}
                  x2={INSETS.left + plotW}
                  y1={Math.round(yByKw(nominalKw)) + 0.5}
                  y2={Math.round(yByKw(nominalKw)) + 0.5}
                  stroke="#CBD5E1"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <text
                  x={INSETS.left + plotW}
                  y={yByKw(nominalKw) - 4}
                  textAnchor="end"
                  fontSize={9}
                  fill="#94A3B8"
                  fontFamily="system-ui, sans-serif"
                >
                  ном. {fmtKw(nominalKw)} кВт
                </text>
              </g>
            )}

            {/* Заливка области под кривой (с обрезкой) */}
            <g clipPath={`url(#${clipId})`}>
              {areaPaths.map((d, i) => (
                <path key={`a-${i}`} d={d} fill={`url(#${gradId})`} />
              ))}
              {/* Основная синяя линия графика */}
              {linePaths.map((d, i) => (
                <path
                  key={`l-${i}`}
                  d={d}
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth={2.4}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
            </g>

            {/* Круглые акцентные маркеры со значениями (как на Photo 2) */}
            {markers.map((m, i) => {
              const cx = xByIndex(m.idx);
              const cy = yByKw(m.kw);
              // Если точка вышла за границы области, не рендерим
              if (cx < INSETS.left - 5 || cx > INSETS.left + plotW + 5) return null;

              const isNearTop = cy < PAD_TOP + 15;
              const textY = isNearTop ? cy + 16 : cy - 8;

              return (
                <g key={`marker-${i}`} pointerEvents="none">
                  {/* Текст со значением над точкой */}
                  <text
                    x={cx}
                    y={textY}
                    textAnchor="middle"
                    fontSize={10.5}
                    fontWeight={700}
                    fill="#2563EB"
                    fontFamily="system-ui, sans-serif"
                  >
                    {fmtKw(m.kw)}&nbsp;кВт
                  </text>
                  {/* Круглый маркер с белым центром и синим контуром */}
                  <circle cx={cx} cy={cy} r={5} fill="#FFFFFF" />
                  <circle cx={cx} cy={cy} r={4.5} fill="none" stroke="#2563EB" strokeWidth={2.2} />
                </g>
              );
            })}

            {/* Перекрестие и активная точка при наведении */}
            {hover && cursor !== null && (
              <g pointerEvents="none">
                <line
                  x1={xByIndex(cursor)}
                  x2={xByIndex(cursor)}
                  y1={PAD_TOP}
                  y2={PAD_TOP + plotH}
                  stroke="#94A3B8"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <circle cx={xByIndex(cursor)} cy={yByKw(hover.kw)} r={5} fill="#2563EB" stroke="#FFFFFF" strokeWidth={2} />
              </g>
            )}

            {/* Метки времени по оси X */}
            {xTicks.map((tick, i) => (
              <text
                key={`xtick-${i}`}
                x={tick.x}
                y={H - 5}
                textAnchor="middle"
                fontSize={9.5}
                fill="#94A3B8"
                fontFamily="system-ui, sans-serif"
              >
                {fmtTime(tick.t, timezone)}
              </text>
            ))}
          </svg>
        )}

        {/* Всплывающая подсказка при наведении */}
        {hover && cursor !== null && (
          <div
            className="chart-tooltip"
            style={
              xByIndex(cursor) < W / 2
                ? { left: xByIndex(cursor) + 12 }
                : { left: xByIndex(cursor) - 12, transform: 'translateX(-100%)' }
            }
            role="status"
          >
            <div className="tooltip-title">{fmtTime(hover.t, timezone)}</div>
            <div className="tooltip-val">
              <strong>{fmtKw(hover.kw)}&nbsp;кВт</strong>
              <span className="tooltip-pct">· {fmtPct((hover.kw / nominalKw) * 100)}</span>
            </div>
            <div className="tooltip-sub">среднее за {Math.round(bucketMs / 60_000)}&nbsp;мин</div>
          </div>
        )}
      </div>

      {/* Ось времени внизу карточки (диапазон) */}
      <div className="chart-footer-axis" aria-hidden>
        <span>{visiblePoints[0] ? fmtTime(visiblePoints[0].t, timezone) : `${hours} ч назад`}</span>
        <span className="axis-peak-hint">
          {currentPeak ? `пик ${fmtKw(currentPeak.kw)} кВт в ${fmtTime(currentPeak.t, timezone)}` : '—'}
        </span>
        <span>
          {visiblePoints.length > 0 && visiblePoints[visiblePoints.length - 1]
            ? fmtTime(visiblePoints[visiblePoints.length - 1]!.t, timezone)
            : 'сейчас'}
        </span>
      </div>

      {/* Табличный вид для детального анализа */}
      <details className="table-view">
        <summary>Данные графика таблицей ({table.length} интервалов)</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Интервал</th>
              <th scope="col">Сред., кВт</th>
              <th scope="col">Макс., кВт</th>
            </tr>
          </thead>
          <tbody>
            {table.slice(-12).map((r) => (
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
