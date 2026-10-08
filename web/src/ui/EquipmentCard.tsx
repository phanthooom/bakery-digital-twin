import { useEffect, useMemo, useRef } from 'react';
import { FAULTS, faultsFor, type EquipmentConfig } from '@bakery/shared';
import { useDataSource, useEquipmentState } from '../data/store';
import { fmtAgo, fmtDuration, fmtKw, fmtPct } from './format';
import { PhaseMeters } from './PhaseMeters';
import { PowerChart } from './PowerChart';
import { AI_LABEL, REASON_LABEL, STATUS_LABEL } from './statusMeta';
import { StatusIcon, WarnIcon } from './StatusIcon';
import { useNow } from './useNow';

const HOURS = 6;
/** 3-минутные средние: 120 точек за 6 ч — читаемо и без «щётки» от термостатов. */
const BUCKET_MS = 3 * 60_000;


export function EquipmentCard({ eq, onClose }: { eq: EquipmentConfig; onClose: () => void }) {
  const ds = useDataSource();
  const state = useEquipmentState(eq.id);
  const now = useNow(1000);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { thresholds, site } = ds.config;

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, [eq.id]);

  // история пересчитывается при каждом новом показании
  const history = useMemo(() => ds.getHistory(eq.id, HOURS, BUCKET_MS), [ds, eq.id, state?.updatedAt, state?.status]);
  const range = useMemo(() => ({ to: Date.now(), from: Date.now() - HOURS * 3_600_000 }), [history]);

  if (!state) return null;
  const r = state.lastReading;
  const offline = state.status === 'offline';
  const ai = state.ai_check;
  const aiLevel = ai.state === 'anomaly' ? 'critical' : ai.state === 'deviation' ? 'warning' : null;

  return (
    <aside className="card" aria-label={`Карточка: ${eq.name}`} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="card-head">
        <div>
          <h2 className="card-title">{eq.name}</h2>
          {eq.vendorModel && <div className="card-sub">{eq.vendorModel}</div>}
        </div>
        <button ref={closeRef} className="card-close" onClick={onClose} aria-label="Закрыть карточку">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="status-line" aria-live="polite">
        <StatusIcon status={state.status} />
        {STATUS_LABEL[state.status]}
        {state.statusSince > 0 && <span className="since">{fmtDuration(now - state.statusSince)}</span>}
      </div>
      {state.status === 'alarm' && (
        <div className="reasons" role="alert">
          <WarnIcon level="critical" />
          <span>Причина: {state.reasons.map((x) => REASON_LABEL[x]).join(', ')}</span>
        </div>
      )}

      <div className="hero">
        <span className="hero-value">{offline || !r ? '—' : fmtKw(r.powerKw)}</span>
        <span className="hero-unit">кВт</span>
      </div>
      <div className="hero-sub">
        {state.pctOfNominal === null || offline ? `номинал ${fmtKw(eq.nominalKw)} кВт` : `${fmtPct(state.pctOfNominal)} номинала (${fmtKw(eq.nominalKw)} кВт)`}
      </div>

      <PowerChart points={history.points} peak={history.peak} nominalKw={eq.nominalKw} fromMs={range.from} toMs={range.to} timezone={site.timezone} hours={HOURS} bucketMs={BUCKET_MS} />

      {r && (
        <div className="section">
          <PhaseMeters currentsA={r.currentsA} ratedA={state.ratedCurrentA} imbalancePct={state.imbalancePct} imbalanceLimit={thresholds.imbalanceAlarmPct} />
        </div>
      )}

      <div className="section">
        <div className="meta-row">{r?.order && !offline ? `Заказ: ${r.order}` : 'Заказа нет'}</div>
        <div className="ai">
          {aiLevel && <WarnIcon level={aiLevel} />}
          <div>
            <div>
              <b>ИИ:</b> {ai.state === 'learning' ? AI_LABEL.learning : ai.message}
            </div>
            <div className="ai-sub">
              {ai.state === 'learning'
                ? ai.message
                : `норма для этого часа ${fmtKw(ai.baselineKw ?? 0)} кВт · среднее за ${thresholds.ai.windowMin} мин ${fmtKw(ai.currentKw ?? 0)} кВт`}
            </div>
            {ai.checkedAt > 0 && <div className="ai-sub">проверка {fmtAgo(now - ai.checkedAt)}</div>}
          </div>
        </div>
      </div>

      <div className="card-foot">
        <span title={r?.meterId ?? eq.meterId}>Счётчик {r?.meterId ?? eq.meterId ?? '—'}</span>
        <span>{r ? `обновлено ${fmtAgo(now - r.ts)}` : 'нет данных'}</span>
      </div>

      {ds.simulate && (
        <div className="demo">
          <div className="demo-title">Демо-события на этом станке</div>
          <div className="demo-actions">
            {faultsFor(eq.phases).map((type) => (
              <button key={type} className="btn" onClick={() => ds.simulate!(eq.id, type)}>
                {FAULTS[type].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
