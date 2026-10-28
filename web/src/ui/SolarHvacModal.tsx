import { useState } from 'react';
import type { SiteConfig } from '@bakery/shared';
import { assessSolarGeneration } from '@bakery/shared';
import { useStates } from '../data/store';
import { useNow } from './useNow';
import './SolarHvacModal.css';

export interface SolarHvacModalProps {
  config: SiteConfig;
  onClose: () => void;
}

export function SolarHvacModal({ config, onClose }: SolarHvacModalProps) {
  const [tab, setTab] = useState<'solar' | 'hvac' | 'lab'>('solar');
  const now = useNow();
  const states = useStates();

  // Суммарное потребление оборудования цеха
  let totalKw = 0;
  for (const s of states.values()) {
    if (s.lastReading?.powerKw) {
      totalKw += s.lastReading.powerKw;
    }
  }

  // Расчёт выработки СЭС на текущую минуту
  const solarCfg = config.solarRoof;
  const solar = solarCfg
    ? assessSolarGeneration(now, totalKw, solarCfg)
    : { irradianceWm2: 0, powerKw: 0, greenSharePct: 0, co2SavedKgPerHour: 0 };

  const hvacCfg = config.hvacFloor;
  const labCfg = config.lab;
  const sample = labCfg?.sampleFlour;

  return (
    <div className="solar-hvac-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="solar-hvac-modal" onClick={(e) => e.stopPropagation()}>
        <div className="solar-hvac-header">
          <div className="solar-hvac-title-group">
            <span className="solar-hvac-badge">3–4 ЭТАЖИ</span>
            <h2>Энергоцентр и Лаборатория качества</h2>
          </div>
          <button type="button" className="solar-hvac-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        {/* Навигационные вкладки */}
        <div className="solar-hvac-tabs">
          <button
            type="button"
            className={`solar-tab-btn${tab === 'solar' ? ' is-active' : ''}`}
            onClick={() => setTab('solar')}
          >
            ☀️ Солнечная СЭС (4 эт.)
          </button>
          <button
            type="button"
            className={`solar-tab-btn${tab === 'hvac' ? ' is-active' : ''}`}
            onClick={() => setTab('hvac')}
          >
            ❄️ Климат и Рекуперация (3 эт.)
          </button>
          <button
            type="button"
            className={`solar-tab-btn${tab === 'lab' ? ' is-active' : ''}`}
            onClick={() => setTab('lab')}
          >
            🔬 QC Лаборатория муки ГОСТ
          </button>
        </div>

        <div className="solar-hvac-content">
          {tab === 'solar' && (
            <div className="solar-tab-panel">
              <div className="solar-kpi-grid">
                <div className="solar-kpi-card highlight">
                  <span className="solar-kpi-label">Генерация СЭС (кровля)</span>
                  <span className="solar-kpi-value">{solar.powerKw.toFixed(1)} <small>кВт</small></span>
                  <span className="solar-kpi-sub">Инверторы Huawei 60 кВт</span>
                </div>
                <div className="solar-kpi-card">
                  <span className="solar-kpi-label">Доля чистой энергии</span>
                  <span className="solar-kpi-value green">{solar.greenSharePct.toFixed(1)}%</span>
                  <span className="solar-kpi-sub">от текущей нагрузки {totalKw.toFixed(1)} кВт</span>
                </div>
                <div className="solar-kpi-card">
                  <span className="solar-kpi-label">Солнечная инсоляция</span>
                  <span className="solar-kpi-value">{Math.round(solar.irradianceWm2)} <small>Вт/м²</small></span>
                  <span className="solar-kpi-sub">Ташкент (угол 15°, Юг)</span>
                </div>
                <div className="solar-kpi-card">
                  <span className="solar-kpi-label">Снижение CO₂</span>
                  <span className="solar-kpi-value">{solar.co2SavedKgPerHour.toFixed(1)} <small>кг/ч</small></span>
                  <span className="solar-kpi-sub">ESG эко-стандарт</span>
                </div>
              </div>

              <div className="solar-diagram-box">
                <h4>Суточный профиль инсоляции и выработки СЭС</h4>
                <div className="solar-bars">
                  {[6, 8, 10, 12, 14, 16, 18, 20].map((h) => {
                    const heightPct = h >= 6 && h <= 19 ? Math.sin(((h - 6) / 13) * Math.PI) * 100 : 0;
                    return (
                      <div key={h} className="solar-bar-col">
                        <div className="solar-bar-fill" style={{ height: `${heightPct}%` }} />
                        <span className="solar-bar-time">{h}:00</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'hvac' && (
            <div className="hvac-tab-panel">
              <div className="solar-kpi-grid">
                <div className="solar-kpi-card highlight-orange">
                  <span className="solar-kpi-label">Утилизация тепла печей</span>
                  <span className="solar-kpi-value">131.8 <small>кВт</small></span>
                  <span className="solar-kpi-sub">КПД рекуператора: 76%</span>
                </div>
                <div className="solar-kpi-card">
                  <span className="solar-kpi-label">Экономия газа</span>
                  <span className="solar-kpi-value orange">~14.2 <small>м³/ч</small></span>
                  <span className="solar-kpi-sub">замещает нагрев котла</span>
                </div>
                <div className="solar-kpi-card highlight-blue">
                  <span className="solar-kpi-label">Ледяная вода тестомесов</span>
                  <span className="solar-kpi-value blue">+2.0 <small>°C</small></span>
                  <span className="solar-kpi-sub">Чиллер 95 кВт (COP 3.8)</span>
                </div>
                <div className="solar-kpi-card">
                  <span className="solar-kpi-label">Расход циркуляции</span>
                  <span className="solar-kpi-value">8.2 <small>м³/ч</small></span>
                  <span className="solar-kpi-sub">Насосы Grundfos Hydro</span>
                </div>
              </div>

              <div className="hvac-details-box">
                <h4>Термодинамический контур рекуперации (3-й этаж)</h4>
                <p>
                  Дымовые газы ротационных и туннельных печей (температура +180 °C) подаются в пластинчатый рекуператор
                  AHU-1. Воздух охлаждается до +65 °C, отдавая тепло приточному воздуху цеха и воде для технологического
                  замеса теста. Чиллерная станция круглосуточно готовит воду с температурой +2 °C для предотвращения
                  перегрева теста спиральными тестомесами летом.
                </p>
              </div>
            </div>
          )}

          {tab === 'lab' && sample && (
            <div className="lab-tab-panel">
              <div className="lab-passport-card">
                <div className="lab-passport-header">
                  <div>
                    <span className="lab-batch-num">{sample.batchId}</span>
                    <h3>Паспорт качества муки пшеничной (ГОСТ 26574-2017)</h3>
                  </div>
                  <span className="lab-status-badge approved">СООТВЕТСТВУЕТ В/С</span>
                </div>

                <div className="lab-metrics-grid">
                  <div className="lab-metric-item">
                    <span className="lab-metric-title">Сырая клейковина</span>
                    <span className="lab-metric-val">{sample.glutenPct}%</span>
                    <span className="lab-metric-norm">Норма ГОСТ: не менее 28.0%</span>
                  </div>
                  <div className="lab-metric-item">
                    <span className="lab-metric-title">Качество по ИДК</span>
                    <span className="lab-metric-val">{sample.glutenIdk} ед. (I группа)</span>
                    <span className="lab-metric-norm">Норма: 45–75 ед. (Хорошая)</span>
                  </div>
                  <div className="lab-metric-item">
                    <span className="lab-metric-title">Влажность муки</span>
                    <span className="lab-metric-val">{sample.moisturePct}%</span>
                    <span className="lab-metric-norm">Норма: не более 14.5%</span>
                  </div>
                  <div className="lab-metric-item">
                    <span className="lab-metric-title">Число падения</span>
                    <span className="lab-metric-val">{sample.fallingNumberSec} с</span>
                    <span className="lab-metric-norm">Норма: не менее 230 с</span>
                  </div>
                </div>

                {sample.farinograph && (
                  <div className="lab-farinograph-box">
                    <h4>Реология замеса на фаринографе Брабендера</h4>
                    <div className="farinograph-chips">
                      <div className="f-chip">
                        <span>Водопоглощение (ВПС):</span>
                        <strong>{sample.farinograph.waterAbsorptionPct}%</strong>
                      </div>
                      <div className="f-chip">
                        <span>Устойчивость теста:</span>
                        <strong>{sample.farinograph.stabilityMin} мин</strong>
                      </div>
                      <div className="f-chip">
                        <span>Разжижение теста:</span>
                        <strong>{sample.farinograph.softeningFU} FU</strong>
                      </div>
                      <div className="f-chip highlight">
                        <span>Индекс качества (FU):</span>
                        <strong>{sample.farinograph.qualityNumber} ед. (Сильная мука)</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
