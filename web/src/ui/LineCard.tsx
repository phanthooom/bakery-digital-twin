import { useEffect, useRef } from 'react';
import { FAULTS, type EquipmentConfig, type FaultType } from '@bakery/shared';
import { useDataSource, useEquipmentState } from '../data/store';
import { fmtAgo, fmtKw, fmtNum, fmtPct } from './format';
import { LINE_COLOR, LINE_LABEL, lineInfo, problemText } from './lineMeta';
import { WarnIcon } from './StatusIcon';
import { useNow } from './useNow';

const LINE_FAULTS: FaultType[] = ['overload', 'phase_loss', 'undervoltage'];

/** Карточка линии питания: автомат, кабель, токи и напряжения по фазам, диагноз. */
export function LineCard({ eq, onClose, onOpenMachine }: { eq: EquipmentConfig; onClose: () => void; onOpenMachine: () => void }) {
  const ds = useDataSource();
  const state = useEquipmentState(eq.id);
  const now = useNow(1000);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus({ preventScroll: true }), [eq.id]);
  const { feeder, health } = lineInfo(ds.config, eq, state);
  const r = state?.lastReading;
  const offline = health.level === 'offline';
  const load = health.loadPct;
  const loadColor = load === null ? 'var(--axis)' : load > 100 ? 'var(--status-critical)' : load > 80 ? 'var(--status-warning)' : 'var(--series-1)';

  return (
    <aside className="card" aria-label={`Линия ${feeder.id}`} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="card-head">
        <div>
          <h2 className="card-title">
            Линия {feeder.id} → {eq.name}
          </h2>
          <div className="card-sub">
            {ds.config.power?.panel.id} · автомат {feeder.breakerA}&nbsp;А · кабель {feeder.cable}
          </div>
        </div>
        <button ref={closeRef} className="card-close" onClick={onClose} aria-label="Закрыть карточку">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="status-line">
        <span className="dot" style={{ background: LINE_COLOR[health.level] }} aria-hidden />
        {LINE_LABEL[health.level]}
      </div>
      {health.problems.length > 0 && (
        <ul className="diagnosis" role="alert">
          {health.problems.map((p) => (
            <li key={p.code + (p.phase ?? '')}>
              <WarnIcon level={p.level} />
              <span>{problemText(p)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="hero">
        <span className={`hero-value${load === null ? ' is-empty' : ''}`}>{load === null ? '—' : fmtNum(load)}</span>
        <span className="hero-unit">% автомата</span>
      </div>
      <div className="meter meter-lg" role="meter" aria-label="Загрузка автомата" aria-valuemin={0} aria-valuemax={100} aria-valuenow={load ?? 0}>
        <span style={{ width: `${Math.min(100, load ?? 0)}%`, background: loadColor }} />
      </div>
      <div className="hero-sub">
        {offline || !r ? 'нет показаний от счётчика' : `мощность по линии ${fmtKw(r.powerKw)} кВт`}
      </div>

      {r && !offline && (
        <div className="section">
          <table className="phase-table">
            <thead>
              <tr>
                <th scope="col">Фаза</th>
                <th scope="col">Ток, А</th>
                <th scope="col">% автомата</th>
                <th scope="col">Напряжение, В</th>
              </tr>
            </thead>
            <tbody>
              {r.currentsA.map((a, i) => {
                const u = r.voltageV?.[i];
                const badU = u !== undefined && (u < 207 || u > 253);
                return (
                  <tr key={i}>
                    <th scope="row">{r.currentsA.length === 1 ? 'L' : `L${i + 1}`}</th>
                    <td>{fmtNum(a, 2)}</td>
                    <td>{fmtPct((a / feeder.breakerA) * 100)}</td>
                    <td className={badU ? 'is-bad' : undefined}>
                      {badU && <WarnIcon level={u! < 195 || u! > 265 ? 'critical' : 'warning'} />} {u === undefined ? '—' : fmtNum(u, 1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="section line-actions">
        <button className="btn" onClick={onOpenMachine}>
          Открыть станок «{eq.name}»
        </button>
      </div>
      <div className="card-foot">
        <span>Счётчик {r?.meterId ?? eq.meterId ?? '—'}</span>
        <span>{r ? `обновлено ${fmtAgo(now - r.ts)}` : 'нет данных'}</span>
      </div>

      {ds.simulate && (
        <div className="demo">
          <div className="demo-title">Демо-события на линии</div>
          <div className="demo-actions">
            {LINE_FAULTS.filter((t) => eq.phases === 3 || !FAULTS[t].threePhaseOnly).map((t) => (
              <button key={t} className="btn" onClick={() => ds.simulate!(eq.id, t)}>
                {FAULTS[t].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
