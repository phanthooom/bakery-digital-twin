import { fmtNum, fmtPct } from './format';
import { WarnIcon } from './StatusIcon';

/** Цвет заполнения: обычная нагрузка — цвет серии, выше номинального тока — предупреждение, сильно выше — авария. */
function fill(share: number): string {
  if (share > 1.15) return 'var(--status-critical)';
  if (share > 1.0) return 'var(--status-warning)';
  return 'var(--series-1)';
}

export function PhaseMeters({ currentsA, ratedA, imbalancePct, imbalanceLimit }: { currentsA: number[]; ratedA: number; imbalancePct: number | null; imbalanceLimit: number }) {
  const single = currentsA.length === 1;
  const over = imbalancePct !== null && imbalancePct > imbalanceLimit;
  const name = (i: number) => (single ? 'L' : `L${i + 1}`);
  const overloaded = currentsA.map((a, i) => ({ a, n: name(i), share: ratedA > 0 ? a / ratedA : 0 })).filter((p) => p.share > 1);
  const worst = overloaded.reduce((m, p) => Math.max(m, p.share), 0);
  return (
    <div>
      <div className={`phases${single ? ' single' : ''}`}>
        {currentsA.map((a, i) => {
          const share = ratedA > 0 ? a / ratedA : 0;
          const n = name(i);
          return (
            <div key={n}>
              <div className="phase-head">
                <span className="phase-name">{n}</span>
                <span className="phase-value">{fmtNum(a, 2)}</span>
                <span className="phase-unit">А</span>
              </div>
              <div
                className="meter"
                role="meter"
                aria-label={`Ток ${n}: ${fmtNum(a, 2)} А, ${fmtPct(share * 100)} номинального`}
                aria-valuemin={0}
                aria-valuemax={Math.round(ratedA * 10) / 10}
                aria-valuenow={a}
              >
                <span style={{ width: `${Math.min(100, share * 100)}%`, background: fill(share) }} />
              </div>
            </div>
          );
        })}
      </div>
      {overloaded.length > 0 && (
        <div className="imbalance">
          <WarnIcon level={worst > 1.15 ? 'critical' : 'warning'} />
          {overloaded.map((p) => p.n).join(', ')} выше номинального тока ({fmtNum(ratedA, 1)}&nbsp;А)
        </div>
      )}
      {!single && (
        <div className="imbalance">
          {over && <WarnIcon level="critical" />}
          Несимметрия фаз <strong>{imbalancePct === null ? '—' : fmtPct(imbalancePct)}</strong>
          {over && <span>· выше порога {fmtPct(imbalanceLimit)}</span>}
        </div>
      )}
    </div>
  );
}
