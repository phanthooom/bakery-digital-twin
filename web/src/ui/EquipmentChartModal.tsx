import { useEffect, useMemo, useRef, useState } from 'react';
import type { EquipmentConfig } from '@bakery/shared';
import { useDataSource, useEquipmentState } from '../data/store';
import { fmtAgo, fmtAiHeadline, fmtDuration, fmtKw, fmtPct, fmtTime } from './format';
import { PhaseMeters } from './PhaseMeters';
import { PowerChart } from './PowerChart';
import { STATUS_LABEL } from './statusMeta';
import { StatusIcon, WarnIcon } from './StatusIcon';
import { useNow } from './useNow';

interface EquipmentChartModalProps {
  eq: EquipmentConfig;
  isOpen: boolean;
  onClose: () => void;
}

const getBucketMs = (hours: number) => {
  if (hours <= 1) return 60_000;
  if (hours <= 3) return 2 * 60_000;
  if (hours <= 6) return 3 * 60_000;
  if (hours <= 12) return 6 * 60_000;
  return 12 * 60_000;
};

export function EquipmentChartModal({ eq, isOpen, onClose }: EquipmentChartModalProps) {
  const [hours, setHours] = useState(6);
  const ds = useDataSource();
  const state = useEquipmentState(eq.id);
  const now = useNow(1000);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const bucketMs = getBucketMs(hours);
  const history = useMemo(
    () => ds.getHistory(eq.id, hours, bucketMs),
    [ds, eq.id, hours, bucketMs, state?.updatedAt, state?.status]
  );
  // период «последние N часов до сейчас» сдвигается с каждым показанием; окно графика следует за ним
  const range = useMemo(() => ({ to: Date.now(), from: Date.now() - hours * 3_600_000 }), [history, hours]);

  useEffect(() => {
    if (isOpen) {
      closeBtnRef.current?.focus();
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !state) return null;

  const r = state.lastReading;
  const offline = state.status === 'offline';
  const ai = state.ai_check;
  const aiLevel = ai.state === 'anomaly' ? 'critical' : ai.state === 'deviation' ? 'warning' : null;

  return (
    <div
      className="chart-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Детальная телеметрия: ${eq.name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="chart-modal" ref={modalRef}>
        {/* Шапка модального окна */}
        <div className="modal-head">
          <div className="modal-title-wrap">
            <div className="modal-badge-status">
              <StatusIcon status={state.status} />
              <span>{STATUS_LABEL[state.status]}</span>
              {state.statusSince > 0 && <span className="modal-since">{fmtDuration(now - state.statusSince)}</span>}
            </div>
            <h2 className="modal-title">{eq.name}</h2>
            {eq.vendorModel && <div className="modal-sub">{eq.vendorModel}</div>}
          </div>

          <div className="modal-hero">
            <div className="modal-hero-val">{offline || !r ? '—' : fmtKw(r.powerKw)} <span className="modal-hero-unit">кВт</span></div>
            <div className="modal-hero-sub">
              {state.pctOfNominal === null || offline
                ? `номинал ${fmtKw(eq.nominalKw)} кВт`
                : `${fmtPct(state.pctOfNominal)} номинала`}
            </div>
          </div>

          <button
            ref={closeBtnRef}
            className="modal-close"
            onClick={onClose}
            aria-label="Закрыть окно"
          >
            <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden>
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Большой широкоформатный график с физическим зумом */}
        <div className="modal-chart-section">
          <PowerChart
            points={history.points}
            peak={history.peak}
            nominalKw={eq.nominalKw}
            fromMs={range.from}
            toMs={range.to}
            timezone={ds.config.site.timezone}
            hours={hours}
            bucketMs={bucketMs}
            badge={ds.simulate ? 'демо' : 'ESP32'}
            height={260}
            onHoursChange={setHours}
            isExpanded={true}
          />
        </div>

        {/* Дополнительная детальная аналитика под графиком */}
        <div className="modal-metrics-grid">
          {/* Фазная нагрузка */}
          {r && (
            <div className="modal-metric-card">
              <div className="metric-card-title">Фазные токи и баланс</div>
              <PhaseMeters
                currentsA={r.currentsA}
                ratedA={state.ratedCurrentA}
                imbalancePct={state.imbalancePct}
                imbalanceLimit={ds.config.thresholds.imbalanceAlarmPct}
              />
            </div>
          )}

          {/* ИИ мониторинг профиля */}
          <div className="modal-metric-card">
            <div className="metric-card-title">ИИ-контроль профиля мощности</div>
            <div className="modal-ai-box">
              {aiLevel && <WarnIcon level={aiLevel} />}
              <div>
                <div className="ai-status-row">
                  <b>ИИ:</b> {fmtAiHeadline(ai)}
                </div>
                <div className="ai-sub">
                  норма для текущего часа: <strong>{fmtKw(ai.baselineKw ?? 0)} кВт</strong> · окно анализа {ds.config.thresholds.ai.windowMin} мин
                </div>
                {ai.checkedAt > 0 && <div className="ai-sub">последняя сверка {fmtAgo(now - ai.checkedAt)}</div>}
              </div>
            </div>
          </div>

          {state.climate && (
            <div className="modal-metric-card">
              <div className="metric-card-title">Технологический микроклимат</div>
              <div className="modal-stat-list">
                {state.climate.temperatureC !== null && (
                  <div className="stat-row">
                    <span className="stat-label">Температура в камере:</span>
                    <span className="stat-val font-bold">
                      {state.climate.temperatureC.toFixed(1)} °C {state.climate.targetTempC !== null && `(цель ${state.climate.targetTempC} °C)`}
                    </span>
                  </div>
                )}
                {state.climate.humidityPct !== null && (
                  <div className="stat-row">
                    <span className="stat-label">Относительная влажность:</span>
                    <span className="stat-val font-bold">
                      {state.climate.humidityPct.toFixed(1)} % {state.climate.targetHumidityPct !== null && `(цель ${state.climate.targetHumidityPct} %)`}
                    </span>
                  </div>
                )}
                {state.climate.coreTempC !== null && (
                  <div className="stat-row">
                    <span className="stat-label">Температура сердцевины:</span>
                    <span className="stat-val font-bold">{state.climate.coreTempC.toFixed(1)} °C (цель −18 °C)</span>
                  </div>
                )}
                <div className="stat-row">
                  <span className="stat-label">Статус режима:</span>
                  <span className={`climate-badge is-${state.climate.status}`}>
                    {state.climate.alert ?? (state.climate.status === 'ok' ? 'В пределах нормы' : state.climate.status)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Сводка по пикам и счётчику */}
          <div className="modal-metric-card">
            <div className="metric-card-title">Параметры датчика и пиков</div>
            <div className="modal-stat-list">
              <div className="stat-row">
                <span className="stat-label">Счётчик электроэнергии:</span>
                <span className="stat-val">{r?.meterId ?? eq.meterId ?? 'ESP32_SIM'}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Максимальный пик за {hours} ч:</span>
                <span className="stat-val font-bold text-blue">
                  {history.peak ? `${fmtKw(history.peak.kw)} кВт (${fmtTime(history.peak.t, ds.config.site.timezone)})` : '—'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Обновление телеметрии:</span>
                <span className="stat-val">{r ? fmtAgo(now - r.ts) : 'нет данных'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
