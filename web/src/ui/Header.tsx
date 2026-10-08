import type { MachineStatus } from '@bakery/shared';
import { useDataSource, useStates } from '../data/store';
import { fmtAgo, fmtKw } from './format';
import { STATUS_LABEL, STATUS_ORDER } from './statusMeta';
import { BrandMark } from './BrandMark';
import { StatusIcon } from './StatusIcon';
import { useNow } from './useNow';

export interface HeaderProps {
  showLabels: boolean;
  listOpen: boolean;
  onToggleLabels: () => void;
  onToggleList: () => void;
  onResetView: () => void;
  linesVisible: boolean;
  onToggleLines: () => void;
}

export function Header({ showLabels, listOpen, onToggleLabels, onToggleList, onResetView, linesVisible, onToggleLines }: HeaderProps) {
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
        <button className="btn" aria-pressed={linesVisible} onClick={onToggleLines}>
          Линии питания
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
