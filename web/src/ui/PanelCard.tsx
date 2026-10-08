import { useEffect, useRef } from 'react';
import { useDataSource, useStates } from '../data/store';
import { fmtKw, fmtNum, fmtPct } from './format';
import { LINE_COLOR, LINE_LABEL, lineInfo } from './lineMeta';

/** Карточка щита: суммарная мощность, токи вводного автомата по фазам и все линии с их состоянием. */
export function PanelCard({ onClose, onOpenLine }: { onClose: () => void; onOpenLine: (id: string) => void }) {
  const ds = useDataSource();
  const states = useStates();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus({ preventScroll: true }), []);
  const panel = ds.config.power!.panel;
  const lines = ds.config.equipment.map((eq) => ({ ...lineInfo(ds.config, eq, states.get(eq.id)), state: states.get(eq.id) }));
  const phase = [0, 0, 0];
  let kw = 0;
  for (const l of lines) {
    const r = l.state?.lastReading;
    if (!r || l.health.level === 'offline') continue;
    kw += r.powerKw;
    if (r.currentsA.length === 3) r.currentsA.forEach((a, i) => (phase[i]! += a));
    else phase[0]! += r.currentsA[0]!; // однофазные потребители сидят на L1
  }
  const load = (Math.max(...phase) / panel.inputBreakerA) * 100;
  const order = { critical: 0, warning: 1, offline: 2, ok: 3, idle: 4 } as const;
  const sorted = [...lines].sort((a, b) => order[a.health.level] - order[b.health.level]);
  const issues = lines.filter((l) => l.health.level === 'critical' || l.health.level === 'warning').length;

  return (
    <aside className="card" aria-label={`Щит ${panel.id}`} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="card-head">
        <div>
          <h2 className="card-title">Щит {panel.id}</h2>
          <div className="card-sub">
            {panel.name} · вводной автомат {panel.inputBreakerA}&nbsp;А
          </div>
        </div>
        <button ref={closeRef} className="card-close" onClick={onClose} aria-label="Закрыть карточку">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="status-line">{issues ? `Линий с проблемами: ${issues}` : 'Все линии в норме'}</div>
      <div className="hero">
        <span className="hero-value">{fmtKw(kw)}</span>
        <span className="hero-unit">кВт</span>
      </div>
      <div className="hero-sub">ввод загружен на {fmtPct(load)} по самой нагруженной фазе</div>
      <div className="section phases">
        {phase.map((a, i) => (
          <div key={i}>
            <div className="phase-head">
              <span className="phase-name">L{i + 1}</span>
              <span className="phase-value">{fmtNum(a, 1)}</span>
              <span className="phase-unit">А</span>
            </div>
            <div className="meter">
              <span style={{ width: `${Math.min(100, (a / panel.inputBreakerA) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="section">
        <table className="line-table">
          <thead>
            <tr>
              <th scope="col">Линия</th>
              <th scope="col">Состояние</th>
              <th scope="col">% авт.</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => (
              <tr key={l.eq.id} onClick={() => onOpenLine(l.eq.id)}>
                <td>
                  <button className="row-btn" onClick={(e) => { e.stopPropagation(); onOpenLine(l.eq.id); }}>
                    {l.feeder.id} · {l.eq.name}
                  </button>
                </td>
                <td>
                  <span className="dot" style={{ background: LINE_COLOR[l.health.level] }} aria-hidden /> {LINE_LABEL[l.health.level]}
                </td>
                <td className="num">{l.health.loadPct === null ? '—' : fmtNum(l.health.loadPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  );
}
