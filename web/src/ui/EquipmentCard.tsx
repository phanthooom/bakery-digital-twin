import { useEffect, useMemo, useRef, useState } from 'react';
import { FAULTS, faultsFor, type EquipmentConfig } from '@bakery/shared';
import { useDataSource, useEquipmentState } from '../data/store';
import { EquipmentChartModal } from './EquipmentChartModal';
import { fmtAgo, fmtAiHeadline, fmtAiLearning, fmtDuration, fmtKw, fmtPct } from './format';
import { OfflineNotice } from './OfflineNotice';
import { PhaseMeters } from './PhaseMeters';
import { PowerChart } from './PowerChart';
import { REASON_LABEL, STATUS_LABEL } from './statusMeta';
import { StatusIcon, WarnIcon } from './StatusIcon';
import { useNow } from './useNow';

const getBucketMs = (hours: number) => {
  if (hours <= 1) return 60_000;
  if (hours <= 3) return 2 * 60_000;
  if (hours <= 6) return 3 * 60_000;
  if (hours <= 12) return 6 * 60_000;
  return 12 * 60_000;
};

export function EquipmentCard({ eq, onClose }: { eq: EquipmentConfig; onClose: () => void }) {
  const [hours, setHours] = useState(6);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStretched, setIsStretched] = useState(false);
  const ds = useDataSource();
  const state = useEquipmentState(eq.id);
  const now = useNow(1000);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { thresholds, site } = ds.config;

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, [eq.id]);

  const bucketMs = getBucketMs(hours);
  // история пересчитывается при каждом новом показании или смене периода
  const history = useMemo(
    () => ds.getHistory(eq.id, hours, bucketMs),
    [ds, eq.id, hours, bucketMs, state?.updatedAt, state?.status]
  );
  // период «последние N часов до сейчас» сдвигается с каждым показанием; окно графика следует за ним
  const range = useMemo(() => ({ to: Date.now(), from: Date.now() - hours * 3_600_000 }), [history, hours]);

  if (!state) return null;
  const r = state.lastReading;
  const offline = state.status === 'offline';
  const ai = state.ai_check;
  const aiLevel = ai.state === 'anomaly' ? 'critical' : ai.state === 'deviation' ? 'warning' : null;

  return (
    <>
      <aside
        className={`card${isStretched ? ' is-stretched' : ''}`}
        aria-label={`Карточка: ${eq.name}`}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="card-head">
          <div>
            <h2 className="card-title">{eq.name}</h2>
            {eq.vendorModel && <div className="card-sub">{eq.vendorModel}</div>}
          </div>
          <div className="card-head-actions">
            <button
              type="button"
              className="card-stretch-btn"
              onClick={() => setIsStretched((v) => !v)}
              title={isStretched ? 'Сжать карточку до компактного вида' : 'Растянуть карточку по ширине'}
              aria-label={isStretched ? 'Сжать карточку' : 'Растянуть карточку'}
            >
              {isStretched ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>
            <button ref={closeRef} className="card-close" onClick={onClose} aria-label="Закрыть карточку">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
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

        {offline && <OfflineNotice meterId={r?.meterId ?? eq.meterId} silentForMs={r ? now - r.ts : null} />}

        <div className="hero">
          <span className={`hero-value${offline || !r ? ' is-empty' : ''}`}>{offline || !r ? '—' : fmtKw(r.powerKw)}</span>
          <span className="hero-unit">кВт</span>
        </div>
        <div className="hero-sub">
          {state.pctOfNominal === null || offline
            ? `номинал ${fmtKw(eq.nominalKw)} кВт`
            : `${fmtPct(state.pctOfNominal)} номинала (${fmtKw(eq.nominalKw)} кВт)`}
        </div>

        {/* Растягивающийся интерактивный график мощности */}
        <PowerChart
          points={history.points}
          peak={history.peak}
          nominalKw={eq.nominalKw}
          fromMs={range.from}
          toMs={range.to}
          timezone={site.timezone}
          hours={hours}
          bucketMs={bucketMs}
          badge={ds.simulate ? 'демо' : 'ESP32'}
          height={isStretched ? 150 : 124}
          onHoursChange={setHours}
          onExpand={() => setIsModalOpen(true)}
        />

        {r && (
          <div className="section">
            <PhaseMeters
              currentsA={r.currentsA}
              ratedA={state.ratedCurrentA}
              imbalancePct={state.imbalancePct}
              imbalanceLimit={thresholds.imbalanceAlarmPct}
            />
          </div>
        )}

        <div className="section">
          <div className="meta-row">{r?.order && !offline ? `Заказ: ${r.order}` : 'Заказа нет'}</div>
          <div className="ai">
            {aiLevel && <WarnIcon level={aiLevel} />}
            <div>
              <div>
                <b>ИИ:</b> {fmtAiHeadline(ai)}
              </div>
              <div className="ai-sub">
                {ai.state === 'learning'
                  ? fmtAiLearning(ai, thresholds.ai.minBaselineSamples)
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

      {/* Полноэкранный модальный режим для глубокого детального анализа */}
      <EquipmentChartModal eq={eq} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
