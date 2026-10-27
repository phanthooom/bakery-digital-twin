import { useEffect, useMemo, useRef } from 'react';
import { GAS_EVENTS, type GasAlert, type GasEvent, type GasPoint, type GasState } from '@bakery/shared';
import { useDataSource, useGas } from '../data/store';
import { monotonePath, niceTicks, timeTicks, tzOffsetMs } from './chartMath';
import { AnimatedNumber } from './AnimatedNumber';
import { fmtAxis, fmtDuration, fmtNum, fmtTime } from './format';
import { StatusIcon, WarnIcon } from './StatusIcon';
import { useSceneTime } from '../data/timeCursor';

const HOUR = 3_600_000;
const HOURS = 6;
const BUCKET = 3 * 60_000;

const fmtM3h = (v: number) => fmtNum(v, v < 10 ? 2 : 1);

/** Что случилось и что делать — по каждой тревоге. */
export function gasAlertText(a: GasAlert, g: GasState, now: number): { title: string; action: string } {
  const r = g.lastReading;
  const dur = fmtDuration(now - a.since);
  if (a.kind === 'detector') {
    const lel = `${fmtNum(r?.ch4Lel ?? 0, 1)} % НКПР`;
    return a.level === 'critical'
      ? { title: `Загазованность ${lel} — порог 2`, action: 'Закрыть кран на вводе, вывести людей, не включать и не выключать электроприборы, вызвать газовую службу 104.' }
      : { title: `Загазованность ${lel} — порог 1`, action: 'Проветрить, найти источник: краны, соединения у горелок. При запахе газа — 104.' };
  }
  if (a.kind === 'flow_without_consumers') {
    return { title: `Расход ${fmtM3h(r?.flowM3h ?? 0)} м³/ч при погашенных горелках уже ${dur} — вероятна утечка`, action: 'Проверить краны и соединения мыльным раствором; если течь не найдена — закрыть кран на вводе и вызвать газовую службу.' };
  }
  const excess = (r?.flowM3h ?? 0) - g.expected.m3h;
  return { title: `Расход на ${fmtM3h(excess)} м³/ч больше, чем берут горелки, уже ${dur}`, action: 'Утечка или неисправная горелка: проверить пламя и автоматику печей, соединения на трубе.' };
}

function GasChart({ points, fromMs, toMs, timezone, maxM3h }: { points: GasPoint[]; fromMs: number; toMs: number; timezone: string; maxM3h: number }) {
  const W = 300;
  const H = 120;
  const L = 30;
  const B = 18;
  const plotW = W - L - 6;
  const plotH = H - B - 6;
  const peak = Math.max(1, ...points.map((p) => Math.max(p.flowM3h, p.expectedM3h)));
  const y = niceTicks(Math.min(maxM3h, peak * 1.15), 4);
  const sx = (t: number) => L + ((t - fromMs) / (toMs - fromMs)) * plotW;
  const sy = (v: number) => 6 + plotH - (v / y.max) * plotH;
  const off = tzOffsetMs(timezone, toMs);
  const xt = timeTicks(fromMs, toMs, plotW, off, 56);
  const flow = monotonePath(points.map((p) => [sx(p.t + BUCKET / 2), sy(p.flowM3h)] as const));
  const exp = monotonePath(points.map((p) => [sx(p.t + BUCKET / 2), sy(p.expectedM3h)] as const));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Расход газа за ${HOURS} ч и ожидаемый по горелкам`}>
      {y.ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={L + plotW} y1={Math.round(sy(v)) + 0.5} y2={Math.round(sy(v)) + 0.5} stroke="var(--grid)" />
          <text x={L - 5} y={sy(v) + 3.5} textAnchor="end" fontSize="9" fill="var(--text-muted)">
            {fmtAxis(v)}
          </text>
        </g>
      ))}
      {xt.ticks.map((t) => (
        <text key={t} x={sx(t)} y={H - 5} textAnchor="middle" fontSize="9" fill="var(--text-muted)">
          {fmtTime(t, timezone)}
        </text>
      ))}
      <path d={exp} fill="none" stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="4 3" />
      <path d={flow} fill="none" stroke="var(--series-1)" strokeWidth={1.6} />
    </svg>
  );
}

/** Карточка газа: расход на вводе против ожидаемого по горелкам, загазованность, тревоги и что делать. */
export function GasCard({ onClose }: { onClose: () => void }) {
  const ds = useDataSource();
  const g = useGas();
  const now = useSceneTime(5000);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus({ preventScroll: true }), []);
  const gas = ds.config.gas!;
  const tz = ds.config.site.timezone;
  const minute = Math.floor(now / 60_000);
  const points = useMemo(() => ds.getGasHistory?.(HOURS, BUCKET) ?? [], [ds, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const volume = useMemo(() => ds.getGasVolume?.(now - HOURS * HOUR, now) ?? 0, [ds, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!g) return null;

  const r = g.lastReading;
  const det = gas.detector;
  const lel = r?.ch4Lel ?? null;
  const ovens = g.expected.consumers.map((c) => ({ ...c, name: ds.config.equipment.find((e) => e.id === c.id)?.name ?? c.id }));
  const statusText = g.level === 'offline' ? 'Нет связи со счётчиком' : g.level === 'critical' ? 'Утечка газа' : g.level === 'warning' ? 'Внимание' : 'Норма — утечек нет';

  return (
    <aside className={`card${g.level === 'critical' ? ' is-danger' : ''}`} aria-label="Газ" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="card-head">
        <div>
          <h2 className="card-title">Газ · {gas.meter.id}</h2>
          <div className="card-sub">
            {gas.meter.name}
            {gas.meter.vendorModel ? ` · ${gas.meter.vendorModel}` : ''}
          </div>
        </div>
        <button ref={closeRef} className="card-close" onClick={onClose} aria-label="Закрыть карточку">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="status-line">
        {g.level === 'warning' || g.level === 'critical' ? <WarnIcon level={g.level} /> : <StatusIcon status={g.level === 'ok' ? 'running' : 'offline'} size={14} />}
        {statusText}
      </div>

      {g.alerts.map((a) => {
        const t = gasAlertText(a, g, now);
        return (
          <div key={a.kind} className={`gas-alert is-${a.level}`} role="alert">
            <strong>{t.title}</strong>
            <span>{t.action}</span>
          </div>
        );
      })}

      <div className="hero">
        <span className="hero-value">{r ? <AnimatedNumber value={r.flowM3h} format={fmtM3h} /> : '—'}</span>
        <span className="hero-unit">м³/ч</span>
      </div>
      <div className="hero-sub">
        горелки должны брать {fmtM3h(g.expected.m3h)} м³/ч{g.expected.known ? '' : ' (не все печи на связи)'} · счётчик {r ? fmtNum(r.totalM3, 1) : '—'} м³
      </div>

      <div className="chart-card">
        <div className="chart-title-row">
          <h3 className="chart-title">Расход за {HOURS} ч</h3>
          {ds.kind === 'mock' && <span className="chart-badge">демо</span>}
        </div>
        <div className="chart-legend">
          <span className="legend-item">
            <span className="legend-line" aria-hidden /> м³/ч по счётчику
          </span>
          <span className="legend-item">
            <span className="legend-line is-dashed" aria-hidden /> ждём по горелкам
          </span>
        </div>
        <GasChart points={points} fromMs={now - HOURS * HOUR} toMs={now} timezone={tz} maxM3h={gas.meter.maxM3h} />
        <div className="meta-row">
          за {HOURS} ч: <strong>{fmtNum(volume, 1)} м³</strong>
        </div>
      </div>

      {det && (
        <div className="section">
          <div className="meta-row">
            {det.name}: <strong>{lel === null ? 'нет данных' : `${fmtNum(lel, 1)} % НКПР`}</strong>
          </div>
          <div className="meter meter-lg" aria-hidden>
            <span style={{ width: `${Math.min(100, ((lel ?? 0) / (det.alarmLel * 1.5)) * 100)}%`, background: g.alerts.some((a) => a.kind === 'detector') ? 'var(--status-critical)' : undefined }} />
          </div>
          <div className="gas-scale">
            порог 1 — {det.warnLel} %, порог 2 — {det.alarmLel} % НКПР
          </div>
        </div>
      )}

      <div className="section">
        <table className="line-table">
          <thead>
            <tr>
              <th scope="col">Горелка</th>
              <th scope="col">Номинал</th>
              <th scope="col">Сейчас</th>
            </tr>
          </thead>
          <tbody>
            {ovens.map((o) => (
              <tr key={o.id}>
                <td>{o.name}</td>
                <td>{fmtM3h(ds.config.equipment.find((e) => e.id === o.id)?.gasM3h ?? 0)} м³/ч</td>
                <td>{o.m3h > 0 ? `${fmtM3h(o.m3h)} м³/ч` : 'погашена'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="gas-scale">
          Утечка: расход {'≥'} {fmtNum(gas.leak.idleFlowM3h, 2)} м³/ч при погашенных горелках дольше {gas.leak.idleMinutes} мин или больше ожидаемого на {gas.leak.overPct} % дольше {gas.leak.overMinutes} мин. Мелкую утечку днём видно только по сигнализатору, ночью — по расходу.
        </div>
      </div>

      {ds.simulateGas && (
        <div className="demo">
          <div className="demo-title">Демо-события газа</div>
          <div className="demo-actions">
            {(Object.keys(GAS_EVENTS) as GasEvent[]).map((type) => (
              <button key={type} className="btn" onClick={() => ds.simulateGas!(type)}>
                {GAS_EVENTS[type].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
