import type { MachineStatus, TelegramOrder } from '@bakery/shared';
import { assessSolarGeneration } from '@bakery/shared';
import { useDataSource, useGas, useStates } from '../data/store';
import { fmtAgo, fmtKw, fmtNum } from './format';
import { STATUS_LABEL, STATUS_ORDER } from './statusMeta';
import { BrandMark } from './BrandMark';
import { StatusIcon, WarnIcon } from './StatusIcon';
import { useNow } from './useNow';
import { AudioControl } from './AudioControl';

export interface HeaderProps {
  showLabels: boolean;
  listOpen: boolean;
  onToggleLabels: () => void;
  onToggleList: () => void;
  onResetView: () => void;
  energyOpen: boolean;
  supplyOpen?: boolean;
  onOpenSupply?: () => void;
  onOpenEnergy: () => void;
  linesVisible: boolean;
  onToggleLines: () => void;
  /** Газ: расход на вводе в сводке; клик — карточка газа. */
  gasOpen?: boolean;
  onOpenGas?: () => void;
  /** Текущий этаж */
  floorFilter?: 'all' | 1 | 2 | 3 | 4;
  onFloorChange?: (floor: 'all' | 1 | 2 | 3 | 4) => void;
  /** Режим архитектурного среза (Exploded View) */
  explodedView?: boolean;
  onToggleExploded?: () => void;
  /** Открыть модальное окно СЭС и климатического комплекса */
  onOpenSolarHvac?: () => void;
  latestOrder?: TelegramOrder | null;
  onOpenOrder?: () => void;
  productionActive?: boolean;
  onToggleProduction?: () => void;
  isNight?: boolean;
  onToggleNight?: () => void;
  layoutMode?: boolean;
  onToggleLayout?: () => void;
}

export function Header({ showLabels, listOpen, onToggleLabels, onToggleList, onResetView, energyOpen, onOpenEnergy, supplyOpen, onOpenSupply, linesVisible, onToggleLines, gasOpen, onOpenGas, floorFilter = 'all', onFloorChange, explodedView = false, onToggleExploded, onOpenSolarHvac, latestOrder, onOpenOrder, productionActive = false, onToggleProduction, isNight = false, onToggleNight, layoutMode = false, onToggleLayout }: HeaderProps) {
  const gas = useGas();
  const ds = useDataSource();
  const states = useStates();
  const now = useNow(1000);
  const counts: Record<MachineStatus, number> = { running: 0, idle: 0, alarm: 0, offline: 0 };
  let total = 0;
  let lastTs = 0;
  for (const s of states.values()) {
    counts[s.status]++;
    if (s.status !== 'offline') total += s.lastReading?.powerKw ?? 0;
    lastTs = Math.max(lastTs, s.lastReading?.ts ?? 0);
  }

  const solarCfg = ds.config.solarRoof;
  const solarGen = solarCfg ? assessSolarGeneration(now, total, solarCfg) : null;

  return (
    <header className="topbar">
      <div className="topbar-row-main">
        <div className="brand">
          <BrandMark logo={ds.config.site.brand?.logo} color={ds.config.site.brand?.color} name={ds.config.site.brand?.name ?? ds.config.site.name} />
          <div style={{ minWidth: 0 }}>
            <div className="brand-title-row">
              <div className="brand-title">{ds.config.site.brand?.name ?? '3D Пекарня'}</div>
              <span className="source-badge" title={ds.kind === 'mock' ? 'Данные генерируются в браузере (без API и счётчиков)' : 'Живые данные'}>
                <span className="pulse" aria-hidden />
                <span className="source-badge-text">{ds.kind === 'mock' ? 'Демо-данные' : 'Онлайн'} · {lastTs ? fmtAgo(now - lastTs) : '—'}</span>
              </span>
            </div>
            <div className="brand-sub">3D-цех · цифровой двойник</div>
          </div>
        </div>

        <div className="topbar-stats" aria-label="Сводка по цеху">
          <div className="stat-total">
            <span className="label">Цех сейчас</span>
            <span className="value">{fmtKw(total)}</span>
            <span className="unit">кВт</span>
          </div>
          {gas && onOpenGas && (
            <button
              type="button"
              className={`stat-gas${gas.level === 'warning' || gas.level === 'critical' ? ` is-${gas.level}` : ''}`}
              aria-pressed={gasOpen}
              onClick={onOpenGas}
              title="Расход газа на вводе; утечки — по сигнализатору и по расходу"
            >
              {(gas.level === 'warning' || gas.level === 'critical') && <WarnIcon level={gas.level} />}
              <span className="stat-gas-label">{gas.level === 'critical' ? 'Утечка газа' : 'Газ'}</span>
              <strong>{gas.lastReading && gas.level !== 'offline' ? fmtNum(gas.lastReading.flowM3h, 1) : '—'}</strong>
              <span className="stat-gas-unit">м³/ч</span>
            </button>
          )}
          <div className="stat-chips">
            {STATUS_ORDER.map((st) => (
              <span key={st} className={`chip${st === 'alarm' && counts.alarm > 0 ? ' is-alert' : ''}`} title={`${STATUS_LABEL[st]}: ${counts[st]}`}>
                <StatusIcon status={st} size={12} />
                <span className="chip-label">{STATUS_LABEL[st]}</span>
                <strong>{counts[st]}</strong>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="topbar-group topbar-group-panels">
          {latestOrder && (
            <button
              type="button"
              className="btn btn-order is-active"
              onClick={onOpenOrder}
              title={`Заказ ${latestOrder.orderId}: ${latestOrder.clientName || 'Клиент'} (${latestOrder.total.toLocaleString('ru-RU')} сум)`}
            >
              <span>🛒</span>
              <span>Заказ {latestOrder.orderId}</span>
            </button>
          )}
          <button className="btn" aria-pressed={listOpen} onClick={onToggleList} title="Список всех станков цеха">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>Оборудование</span>
          </button>
          {onOpenSupply && (
            <button className="btn" aria-pressed={supplyOpen} onClick={onOpenSupply} title="Сырьё, склад, упаковка, рейсы и партии">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
                <circle cx="7" cy="18" r="1.6" />
                <circle cx="17" cy="18" r="1.6" />
              </svg>
              <span>Цепочка</span>
            </button>
          )}
          {ds.config.energy && (
            <button className="btn btn-energy" aria-pressed={energyOpen} onClick={onOpenEnergy} title="кВт·ч и сумма по тарифу за смены, дни, месяцы; выгрузка в Excel">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
              </svg>
              <span>Энергия, сум</span>
            </button>
          )}
          {ds.config.solarRoof && onOpenSolarHvac && (
            <button
              type="button"
              className="btn btn-solar"
              onClick={onOpenSolarHvac}
              title={`Кровля-СЭС и климатический комплекс (3-4 эт.): выработка ${solarGen?.powerKw.toFixed(1) ?? 0} кВт, чистая энергия ${solarGen?.greenSharePct.toFixed(0) ?? 0}%, рекуперация тепла печей, QC лаборатория ГОСТ`}
            >
              <span>☀️</span>
              <span className="btn-text-full">СЭС: {solarGen?.powerKw.toFixed(0)} кВт ({solarGen?.greenSharePct.toFixed(0)}%)</span>
              <span className="btn-text-short">СЭС {solarGen?.powerKw.toFixed(0)}кВт</span>
            </button>
          )}
          {onToggleProduction && (
            <button
              type="button"
              className={`btn btn-production${productionActive ? ' is-active' : ''}`}
              onClick={onToggleProduction}
              title={productionActive ? 'Производственный цикл активен (клик — открыть управление/пауза)' : 'Запустить сквозной цикл производства от муки до выезда фургона'}
            >
              <span className="pulse-prod" aria-hidden />
              <span>{productionActive ? 'Цикл активен' : '▶ Производство'}</span>
            </button>
          )}
        </div>

        <div className="topbar-divider" aria-hidden />

        <div className="topbar-group topbar-group-scene">
          <AudioControl />
          {onFloorChange && (
            <div className="floor-switch" role="group" aria-label="Выбор этажа">
              <button
                type="button"
                className={`btn-floor${floorFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => onFloorChange('all')}
                title="Показать все этажи"
              >
                Все
              </button>
              <button
                type="button"
                className={`btn-floor${floorFilter === 1 ? ' is-active' : ''}`}
                onClick={() => onFloorChange(1)}
                title="1-й этаж: цех"
              >
                1 эт.
              </button>
              <button
                type="button"
                className={`btn-floor${floorFilter === 2 ? ' is-active' : ''}`}
                onClick={() => onFloorChange(2)}
                title="2-й этаж: антресоль, силосы, SCADA"
              >
                2 эт.
              </button>
              <button
                type="button"
                className={`btn-floor${floorFilter === 3 ? ' is-active' : ''}`}
                onClick={() => onFloorChange(3)}
                title="3-й этаж: климатика AHU, чиллер, QC лаборатория ГОСТ"
              >
                3 эт.
              </button>
              <button
                type="button"
                className={`btn-floor${floorFilter === 4 ? ' is-active' : ''}`}
                onClick={() => onFloorChange(4)}
                title="4-й этаж: кровля-энергоцентр, СЭС 60 кВт, ДГУ Cummins"
              >
                4 эт.
              </button>
            </div>
          )}
          {onToggleExploded && (
            <button
              type="button"
              className={`btn${explodedView ? ' is-active' : ''}`}
              aria-pressed={explodedView}
              onClick={onToggleExploded}
              title="Архитектурный срез этажей (Exploded View / Слои здания)"
            >
              <span>🥞</span>
              <span className="btn-text-full">Слои</span>
              <span className="btn-text-short">Слои</span>
            </button>
          )}
          {onToggleNight && (
            <button
              type="button"
              className="btn"
              aria-pressed={isNight}
              onClick={onToggleNight}
              title={isNight ? 'Включить дневное освещение цеха' : 'Включить режим «Ночная смена» (прожекторы High-Bay LED, фары фургонов, подсветка печей и SCADA)'}
            >
              <span>{isNight ? '🌙' : '☀️'}</span>
              <span className="btn-text-full">{isNight ? 'Ночная смена' : 'День / Ночь'}</span>
              <span className="btn-text-short">{isNight ? 'Ночь' : 'День'}</span>
            </button>
          )}
          {onToggleLayout && (
            <button
              type="button"
              className="btn"
              aria-pressed={layoutMode}
              onClick={onToggleLayout}
              title="Интерактивный 3D-конструктор цеха: перетаскивание станков по сетке 0,5 м, поворот на 90°, пересчёт кабельных трасс и ΔU, выгрузка JSON"
            >
              <span>📐</span>
              <span className="btn-text-full">Планировка</span>
              <span className="btn-text-short">План</span>
            </button>
          )}
          <button className="btn" aria-pressed={linesVisible} onClick={onToggleLines} title="Линии электропитания и ГРЩ">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 12h5l3-7 4 14 3-7h1" />
            </svg>
            <span className="btn-text-full">Линии питания</span>
            <span className="btn-text-short">Линии</span>
          </button>
          <button className="btn" aria-pressed={showLabels} onClick={onToggleLabels} title="Подписи над оборудованием в 3D">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
            <span>Подписи</span>
          </button>
          <button className="btn" onClick={onResetView} title="Сбросить ракурс камеры на весь цех">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
            <span>Весь цех</span>
          </button>
        </div>
      </div>
    </header>
  );
}
