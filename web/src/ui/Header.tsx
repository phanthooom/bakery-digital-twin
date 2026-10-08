import type { MachineStatus } from '@bakery/shared';
import { useDataSource, useStates } from '../data/store';
import { fmtAgo, fmtKw } from './format';
import { STATUS_LABEL, STATUS_ORDER } from './statusMeta';
import { StatusIcon } from './StatusIcon';
import { useNow } from './useNow';

export interface HeaderProps {
  showLabels: boolean;
  listOpen: boolean;
  onToggleLabels: () => void;
  onToggleList: () => void;
  onResetView: () => void;
}

export function Header({ showLabels, listOpen, onToggleLabels, onToggleList, onResetView }: HeaderProps) {
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
        <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
          <rect x="3" y="11" width="26" height="18" rx="3" fill="#52514e" />
          <rect x="7" y="16" width="8" height="9" rx="1.5" fill="#efa21f" />
          <rect x="18" y="16" width="7" height="4" rx="1" fill="#cde2fb" />
          <rect x="13" y="3" width="6" height="9" rx="2" fill="#2a78d6" />
        </svg>
        <div style={{ minWidth: 0 }}>
          <div className="brand-title">3D Пекарня</div>
        </div>
        <span className="brand-sub">{ds.config.site.name}</span>
      </div>

      <div className="topbar-stats" aria-label="Сводка по цеху">
        <div className="stat-total">
          <span className="label">Цех сейчас</span>
          <span className="value">{fmtKw(total)}</span>
          <span className="unit">кВт</span>
        </div>
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
        <button className="btn" aria-pressed={listOpen} onClick={onToggleList}>
          Оборудование
        </button>
        <button className="btn" aria-pressed={showLabels} onClick={onToggleLabels}>
          Подписи
        </button>
        <button className="btn" onClick={onResetView}>
          Весь цех
        </button>
      </div>
    </header>
  );
}
