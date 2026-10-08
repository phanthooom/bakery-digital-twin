import { useEffect, useMemo, useRef, useState } from 'react';
import { shiftAt, summarizeEnergy, tariffAt, type EnergyEntry, type EnergyGrouping } from '@bakery/shared';
import { useDataSource } from '../data/store';
import { setOutput, useOutputs } from '../data/outputStore';
import { monthForecast, withOutput, workbookSheets, type ReportRow } from './energyReport';
import { fmtNum } from './format';
import { useNow } from './useNow';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const HISTORY_DAYS = 31;
const SHIFT_DAYS = 7;

const VIEWS: { id: EnergyGrouping; label: string }[] = [
  { id: 'shift', label: 'По сменам' },
  { id: 'day', label: 'По дням' },
  { id: 'month', label: 'По месяцам' },
];

const kwhText = (v: number) => fmtNum(v, v < 100 ? 1 : 0);
const moneyText = (v: number) => fmtNum(Math.round(v), 0);

function OutputInput({ shiftKey, value }: { shiftKey: string; value: number | null }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value).replace('.', ','));
  useEffect(() => setDraft(value === null ? '' : String(value).replace('.', ',')), [value]);
  const commit = () => {
    const n = Number(draft.replace(/\s/g, '').replace(',', '.'));
    setOutput(shiftKey, draft.trim() && Number.isFinite(n) && n > 0 ? n : null);
  };
  return (
    <input
      className="energy-kg-input"
      inputMode="decimal"
      placeholder="кг"
      aria-label="Выпуск за смену, кг"
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(value === null ? '' : String(value));
      }}
    />
  );
}

/**
 * Учёт энергии в деньгах: кВт·ч и сумма по тарифу за смены, дни и месяцы, прогноз на месяц,
 * кВт·ч и сум на кг по выпуску, который вводит мастер смены, разбивка по станкам, выгрузка в Excel.
 */
export function EnergyPanel({ onClose }: { onClose: () => void }) {
  const ds = useDataSource();
  const energy = ds.config.energy;
  const tz = ds.config.site.timezone;
  const outputs = useOutputs();
  const now = useNow(60_000);
  const [entries, setEntries] = useState<EnergyEntry[] | null>(null);
  const [view, setView] = useState<EnergyGrouping>('shift');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // журнал за 31 день; обновляем раз в минуту — текущая смена дописывается
  useEffect(() => {
    let alive = true;
    const t = Date.now();
    void ds.getEnergy?.(t - HISTORY_DAYS * DAY, t + HOUR).then((e) => alive && setEntries(e));
    return () => {
      alive = false;
    };
  }, [ds, now]);

  const data = useMemo(() => {
    if (!energy || !entries) return null;
    const shiftsAll = summarizeEnergy(entries, energy, tz, 'shift');
    const days = summarizeEnergy(entries, energy, tz, 'day');
    const months = summarizeEnergy(entries, energy, tz, 'month');
    return {
      shiftsAll,
      shift: withOutput(shiftsAll, 'shift', shiftsAll, outputs),
      day: withOutput(days, 'day', shiftsAll, outputs),
      month: withOutput(months, 'month', shiftsAll, outputs),
    };
  }, [entries, energy, tz, outputs]);

  if (!energy) {
    return null;
  }

  const t = tariffAt(now, energy, tz);
  const cur = shiftAt(now, energy.shifts, tz);
  const curShift = energy.shifts.find((s) => s.id === cur.shiftId)!;
  const curShiftKey = `${cur.date}#${cur.shiftId}`;
  const today = new Date(now).toLocaleDateString('sv-SE', { timeZone: tz });
  const monthKey = today.slice(0, 7);

  const nameOf = (id: string) => ds.config.equipment.find((e) => e.id === id)?.name ?? id;

  const rowsAll: ReportRow[] = data ? data[view] : [];
  const rows = [...(view === 'shift' ? rowsAll.filter((r) => r.from >= now - SHIFT_DAYS * DAY) : rowsAll)].reverse();
  const selected = rows.find((r) => r.key === selectedKey) ?? null;
  const total = rows.reduce((a, r) => ({ kwh: a.kwh + r.kwh, cost: a.cost + r.cost }), { kwh: 0, cost: 0 });

  // разбивка по станкам: выбранная строка или весь показанный период
  const breakdownSrc = selected ? [selected] : rows;
  const byEq = new Map<string, { kwh: number; cost: number }>();
  for (const r of breakdownSrc) for (const [id, v] of Object.entries(r.byEquipment)) {
    const q = byEq.get(id) ?? { kwh: 0, cost: 0 };
    q.kwh += v.kwh;
    q.cost += v.cost;
    byEq.set(id, q);
  }
  const breakdown = [...byEq.entries()].map(([id, v]) => ({ id, name: nameOf(id), ...v })).sort((a, b) => b.kwh - a.kwh);
  const breakdownTotal = breakdown.reduce((a, b) => a + b.kwh, 0);

  const kpiShift = data?.shift.find((r) => r.key === curShiftKey);
  const kpiDay = data?.day.find((r) => r.key === today);
  const kpiMonth = data?.month.find((r) => r.key === monthKey);
  const forecast = kpiMonth ? monthForecast(kpiMonth, now, tz) : null;
  const weekShifts = (data?.shift ?? []).filter((r) => r.from >= now - SHIFT_DAYS * DAY && r.kwhPerKg !== null);
  const weekKg = weekShifts.reduce((a, r) => a + (r.kg ?? 0), 0);
  const weekKwhPerKg = weekKg ? weekShifts.reduce((a, r) => a + r.kwh, 0) / weekKg : null;
  const weekCostPerKg = weekKg ? weekShifts.reduce((a, r) => a + r.cost, 0) / weekKg : null;

  const exportXlsx = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const { default: writeXlsxFile } = await import('write-excel-file/browser');
      const eqAll = new Map<string, { kwh: number; cost: number }>();
      for (const r of data.day) for (const [id, v] of Object.entries(r.byEquipment)) {
        const q = eqAll.get(id) ?? { kwh: 0, cost: 0 };
        q.kwh += v.kwh;
        q.cost += v.cost;
        eqAll.set(id, q);
      }
      const sheets = workbookSheets({
        title: `${ds.config.site.brand?.name ?? ds.config.site.name}: энергия за ${HISTORY_DAYS} дн.${ds.kind === 'mock' ? ' (демо-данные)' : ''}`,
        currency: energy.currency,
        tariffLines: energy.tariffs.map((x) => [x.from, x.pricePerKwh, x.basis ?? ''] as [string, number, string]),
        shifts: [...data.shift].reverse(),
        days: [...data.day].reverse(),
        months: [...data.month].reverse(),
        equipment: [...eqAll.entries()].map(([id, v]) => ({ name: nameOf(id), kwh: Math.round(v.kwh * 10) / 10, cost: Math.round(v.cost) })).sort((a, b) => b.kwh - a.kwh),
      });
      await writeXlsxFile(sheets as never, { fontFamily: 'Calibri', fontSize: 11 }).toFile(`energiya-${today}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="chart-modal-overlay" role="dialog" aria-modal="true" aria-label="Энергия и деньги" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="chart-modal energy-modal">
        <div className="modal-head">
          <div className="modal-title-wrap">
            <h2 className="modal-title">Энергия и деньги</h2>
            <div className="modal-sub">
              Тариф <strong>{fmtNum(t.pricePerKwh, t.pricePerKwh % 1 ? 2 : 0)}&nbsp;{energy.currency}/кВт·ч</strong>
              {t.zone ? ` (${t.zone.name})` : ''} · {t.tariff.basis ?? `с ${t.tariff.from}`}
              {energy.tariffGroup ? ` · тарифная группа ${energy.tariffGroup}` : ''}
              {ds.kind === 'mock' && <span className="chart-badge energy-demo">демо</span>}
            </div>
          </div>
          <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden>
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {!data ? (
          <div className="energy-loading" role="status">Считаю журнал энергии…</div>
        ) : (
          <>
            <div className="energy-kpis">
              <div className="energy-kpi">
                <div className="energy-kpi-label">
                  Сейчас: {curShift.name} <span className="muted">{curShift.from}–{curShift.to}</span>
                </div>
                <div className="energy-kpi-value">{moneyText(kpiShift?.cost ?? 0)} <span>{energy.currency}</span></div>
                <div className="energy-kpi-sub">{kwhText(kpiShift?.kwh ?? 0)} кВт·ч · смена идёт</div>
              </div>
              <div className="energy-kpi">
                <div className="energy-kpi-label">Сегодня</div>
                <div className="energy-kpi-value">{moneyText(kpiDay?.cost ?? 0)} <span>{energy.currency}</span></div>
                <div className="energy-kpi-sub">{kwhText(kpiDay?.kwh ?? 0)} кВт·ч</div>
              </div>
              <div className="energy-kpi">
                <div className="energy-kpi-label">С начала месяца</div>
                <div className="energy-kpi-value">{moneyText(kpiMonth?.cost ?? 0)} <span>{energy.currency}</span></div>
                <div className="energy-kpi-sub">
                  {kwhText(kpiMonth?.kwh ?? 0)} кВт·ч{forecast ? ` · прогноз на месяц ≈ ${moneyText(forecast.cost)} ${energy.currency}` : ''}
                </div>
              </div>
              <div className="energy-kpi">
                <div className="energy-kpi-label">Расход на 1 кг · {SHIFT_DAYS} дней</div>
                {weekKwhPerKg !== null ? (
                  <>
                    <div className="energy-kpi-value">{fmtNum(weekCostPerKg!, 1)} <span>{energy.currency}/кг</span></div>
                    <div className="energy-kpi-sub">{fmtNum(weekKwhPerKg, 3)} кВт·ч/кг · {weekShifts.length} смен с выпуском</div>
                  </>
                ) : (
                  <>
                    <div className="energy-kpi-value is-empty">—</div>
                    <div className="energy-kpi-sub">введите выпуск, кг, в таблице смен</div>
                  </>
                )}
              </div>
            </div>

            <div className="energy-toolbar">
              <div className="segmented" role="tablist" aria-label="Группировка">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    role="tab"
                    aria-selected={view === v.id}
                    className={view === v.id ? 'is-active' : ''}
                    onClick={() => {
                      setView(v.id);
                      setSelectedKey(null);
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <span className="muted energy-period">
                {view === 'shift' ? `последние ${SHIFT_DAYS} дней` : view === 'day' ? `последние ${HISTORY_DAYS} день` : 'доступные месяцы'}
              </span>
              <button className="btn btn-primary energy-export" onClick={exportXlsx} disabled={exporting}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                </svg>
                {exporting ? 'Готовлю…' : 'Скачать Excel'}
              </button>
            </div>

            <div className="energy-grid">
              <div className="energy-table-wrap">
                <table className="energy-table">
                  <thead>
                    <tr>
                      <th scope="col">{view === 'shift' ? 'Смена' : view === 'day' ? 'День' : 'Месяц'}</th>
                      <th scope="col">кВт·ч</th>
                      <th scope="col">Сумма, {energy.currency}</th>
                      <th scope="col">Выпуск, кг</th>
                      <th scope="col">кВт·ч/кг</th>
                      <th scope="col">{energy.currency}/кг</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const ongoing = view === 'shift' ? r.key === curShiftKey : view === 'day' ? r.key === today : r.key === monthKey;
                      return (
                        <tr
                          key={r.key}
                          className={r.key === selectedKey ? 'is-selected' : ''}
                          aria-selected={r.key === selectedKey}
                          tabIndex={0}
                          onClick={() => setSelectedKey(r.key === selectedKey ? null : r.key)}
                          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && setSelectedKey(r.key === selectedKey ? null : r.key)}
                        >
                          <td>
                            {r.label}
                            {ongoing && <span className="energy-ongoing">идёт</span>}
                          </td>
                          <td>{kwhText(r.kwh)}</td>
                          <td>{moneyText(r.cost)}</td>
                          <td>
                            {view === 'shift' ? (
                              <OutputInput shiftKey={r.key} value={r.kg} />
                            ) : r.kg !== null ? (
                              <span title={r.complete ? undefined : 'введён выпуск не всех смен'}>
                                {fmtNum(r.kg, 0)}
                                {!r.complete && <span className="muted"> *</span>}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>{r.kwhPerKg !== null ? fmtNum(r.kwhPerKg, 3) : <span className="muted">—</span>}</td>
                          <td>{r.costPerKg !== null ? fmtNum(r.costPerKg, 1) : <span className="muted">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Итого</th>
                      <td>{kwhText(total.kwh)}</td>
                      <td>{moneyText(total.cost)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <section className="energy-breakdown" aria-label="Потребление по станкам">
                <div className="energy-breakdown-title">
                  По станкам
                  <span className="muted"> · {selected ? selected.label : 'за весь показанный период'}</span>
                </div>
                <ol className="energy-bars">
                  {breakdown.map((b) => {
                    const share = breakdownTotal ? b.kwh / breakdownTotal : 0;
                    return (
                      <li key={b.id}>
                        <div className="energy-bar-head">
                          <span className="energy-bar-name">{b.name}</span>
                          <span className="energy-bar-val">
                            {moneyText(b.cost)} {energy.currency} <span className="muted">· {fmtNum(share * 100, 0)}&nbsp;%</span>
                          </span>
                        </div>
                        <div className="meter" aria-hidden>
                          <span style={{ width: `${Math.max(1, share * 100)}%` }} />
                        </div>
                        <div className="energy-bar-sub">{kwhText(b.kwh)} кВт·ч</div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>

            <p className="energy-note">
              Сумма — по станкам под мониторингом, по тарифу каждого часа; общий счёт цеха больше (освещение, вентиляция, офис).
              Выпуск за смену вводит мастер; день и месяц — по сменам, начавшимся в этот день. * — введены не все смены.
              {ds.kind === 'mock' ? ' Потребление — демо-данные модели станков.' : ''}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
