import type { MachineStatus } from '@bakery/shared';
import { useDataSource, useGas, useStates } from '../data/store';
import { fmtAgo, fmtKw, fmtNum } from './format';
import { STATUS_LABEL, STATUS_ORDER } from './statusMeta';
import { BrandMark } from './BrandMark';
import { StatusIcon, WarnIcon } from './StatusIcon';
import { useNow } from './useNow';

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
  floorFilter?: 'all' | 1 | 2;
  onFloorChange?: (floor: 'all' | 1 | 2) => void;
}

export function Header({ showLabels, listOpen, onToggleLabels, onToggleList, onResetView, energyOpen, onOpenEnergy, supplyOpen, onOpenSupply, linesVisible, onToggleLines, gasOpen, onOpenGas, floorFilter = 'all', onFloorChange }: HeaderProps) {
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

  return (
    <header className="topbar">
      <div className="brand">
        <BrandMark logo={ds.config.site.brand?.logo} color={ds.config.site.brand?.color} name={ds.config.site.brand?.name ?? ds.config.site.name} />
        <div style={{ minWidth: 0 }}>
          <div className="brand-title">{ds.config.site.brand?.name ?? '3D Пекарня'}</div>
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
            {gas.level === 'critical' ? 'Утечка газа' : 'Газ'}
            <strong>{gas.lastReading && gas.level !== 'offline' ? fmtNum(gas.lastReading.flowM3h, 1) : '—'}</strong>
            м³/ч
          </button>
        )}
        {STATUS_ORDER.map((st) => (
          <span key={st} className={`chip${st === 'alarm' && counts.alarm > 0 ? ' is-alert' : ''}`}>
            <StatusIcon status={st} size={12} />
            {STATUS_LABEL[st]} <strong>{counts[st]}</strong>
          </span>
        ))}
      </div>

      <div className="topbar-actions">
        <span className="source-badge" title={ds.kind === 'mock' ? 'Данные генерируются в браузере (без API и счётчиков)' : 'Живые данные'}>
          <span className="pulse" aria-hidden />
          {ds.kind === 'mock' ? 'Демо-данные' : 'Онлайн'} · {lastTs ? fmtAgo(now - lastTs) : '—'}
        </span>
        {onOpenSupply && (
          <button className="btn" aria-pressed={supplyOpen} onClick={onOpenSupply} title="Сырьё, склад, упаковка, рейсы и партии">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
              <circle cx="7" cy="18" r="1.6" />
              <circle cx="17" cy="18" r="1.6" />
            </svg>
            Цепочка
          </button>
        )}
        {ds.config.energy && (
          <button className="btn btn-energy" aria-pressed={energyOpen} onClick={onOpenEnergy} title="кВт·ч и сумма по тарифу за смены, дни, месяцы; выгрузка в Excel">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
            </svg>
            Энергия, сум
          </button>
        )}
        <button className="btn" aria-pressed={listOpen} onClick={onToggleList}>
          Оборудование
        </button>
        <button className="btn" aria-pressed={linesVisible} onClick={onToggleLines}>
          Линии питания
        </button>
        <button className="btn" aria-pressed={showLabels} onClick={onToggleLabels}>
          Подписи
        </button>
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
          </div>
        )}
        <button className="btn" onClick={onResetView}>
          Весь цех
        </button>
      </div>
    </header>
  );
}
