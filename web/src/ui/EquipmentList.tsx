import { Fragment } from 'react';
import type { SiteConfig } from '@bakery/shared';
import { useStates } from '../data/store';
import { fmtKw, fmtPct } from './format';
import { STATUS_LABEL } from './statusMeta';
import { StatusIcon } from './StatusIcon';

/** Табличный вид цеха: то же, что в 3D, но доступно с клавиатуры и скринридера. */
export function EquipmentList({ config, selectedId, onSelect }: { config: SiteConfig; selectedId: string | null; onSelect: (id: string) => void }) {
  const states = useStates();
  const stages = [...config.stages].sort((a, b) => a.order - b.order);
  return (
    <section className="list" aria-label="Список оборудования">
      <table>
        <caption>Оборудование цеха</caption>
        <thead>
          <tr>
            <th scope="col">Станок</th>
            <th scope="col">Статус</th>
            <th scope="col" className="num">кВт</th>
            <th scope="col" className="num">% ном.</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((stage) => (
            <Fragment key={stage.id}>
              <tr className="stage-row">
                <td colSpan={4}>{stage.label}</td>
              </tr>
              {config.equipment
                .filter((e) => e.stage === stage.id)
                .map((e) => {
                  const s = states.get(e.id);
                  const st = s?.status ?? 'offline';
                  const off = st === 'offline';
                  return (
                    <tr key={e.id} className={`row${selectedId === e.id ? ' is-selected' : ''}`} onClick={() => onSelect(e.id)}>
                      <td>
                        <div className="cell">
                          <button className="row-btn" onClick={(ev) => { ev.stopPropagation(); onSelect(e.id); }}>
                            {e.name}
                          </button>
                          {e.floor === 2 && (
                            <span className="row-climate-pill" style={{ background: '#eaf2fd', color: '#1c5cab', borderColor: 'rgba(28,92,171,0.2)' }} title="Размещено на 2-м этаже (антресоли)">
                              2 эт.
                            </span>
                          )}
                          {s?.climate?.temperatureC != null && !off && (
                            <span className="row-climate-pill" title={s.climate.alert ?? `Температура ${s.climate.temperatureC.toFixed(1)} °C`}>
                              {s.climate.temperatureC.toFixed(0)}°C
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="cell">
                          <StatusIcon status={st} size={12} />
                          {STATUS_LABEL[st]}
                        </div>
                      </td>
                      <td className="num">
                        <div className="cell" style={{ justifyContent: 'flex-end' }}>{off ? '—' : fmtKw(s?.lastReading?.powerKw ?? 0)}</div>
                      </td>
                      <td className="num">
                        <div className="cell" style={{ justifyContent: 'flex-end' }}>{off || s?.pctOfNominal == null ? '—' : fmtPct(s.pctOfNominal)}</div>
                      </td>
                    </tr>
                  );
                })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </section>
  );
}
