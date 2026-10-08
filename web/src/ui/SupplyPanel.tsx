import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { tripStatus, type Lot, type TripStatus } from '@bakery/shared';
import { useDataSource, useSupply } from '../data/store';
import { SupplySim } from '../data/mockSupply';
import { fmtMass, fmtNum, fmtTime } from './format';
import { WarnIcon } from './StatusIcon';
import { supplyView, type SupplyLevel, type SupplyTab } from './supplyView';

const TABS: { id: SupplyTab; label: string }[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'raw', label: 'Сырьё' },
  { id: 'goods', label: 'Готовая продукция' },
  { id: 'trips', label: 'Рейсы' },
  { id: 'lots', label: 'Партии' },
];

function plural(n: number, [one, few, many]: [string, string, string]) {
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${n} ${w}`;
}

const LEVEL_LABEL: Record<SupplyLevel, string> = { ok: 'в норме', low: 'мало', critical: 'критично' };
const TRIP_LABEL: Record<TripStatus, string> = { planned: 'запланирован', loading: 'погрузка', en_route: 'в пути', returned: 'вернулся' };

function LevelChip({ level }: { level: SupplyLevel }) {
  return (
    <span className={`supply-chip is-${level}`}>
      {level !== 'ok' && <WarnIcon level={level === 'critical' ? 'critical' : 'warning'} />}
      {LEVEL_LABEL[level]}
    </span>
  );
}

/**
 * Цепочка поставок: приёмка → склад сырья → производство → упаковка → склад ГП → доставка.
 * Остатки, дни запаса, сроки годности, рейсы и прослеживаемость партий.
 */
export function SupplyPanel({ initialTab = 'overview', onClose }: { initialTab?: SupplyTab; onClose: () => void }) {
  const ds = useDataSource();
  const config = ds.config;
  const tz = config.site.timezone;
  const snap = useSupply();
  const [tab, setTab] = useState<SupplyTab>(initialTab);
  const [lotId, setLotId] = useState<string | null>(null);
  const [lotKind, setLotKind] = useState<'product' | 'raw'>('product');
  const [openTrip, setOpenTrip] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const view = useMemo(() => (snap ? supplyView(snap, config, SupplySim.localMidnight(snap.now, tz)) : null), [snap, config, tz]);
  if (!snap || !view || !config.supply) return null;
  const inv = snap.inventory;
  const now = snap.now;
  const nameOf = (itemId: string) => config.supply!.materials.find((m) => m.id === itemId)?.name ?? config.supply!.products.find((p) => p.id === itemId)?.name ?? itemId;
  const vehicleName = (id: string) => config.supply!.vehicles.find((v) => v.id === id)?.name ?? id;
  const dt = (t: number) => `${new Date(t).toLocaleDateString('ru-RU', { timeZone: tz, day: '2-digit', month: '2-digit' })} ${fmtTime(t, tz)}`;
  const tabAlerts = (t: SupplyTab) => view.alerts.filter((a) => a.tab === t);
  const worst = (t: SupplyTab) => (tabAlerts(t).some((a) => a.level === 'critical') ? 'critical' : tabAlerts(t).length ? 'warning' : null);

  const today = SupplySim.localMidnight(now, tz);
  const deliveriesToday = snap.deliveries.filter((d) => d.at >= today && d.at < today + 24 * 3_600_000);
  const nextDelivery = snap.deliveries.filter((d) => d.at > now).sort((a, b) => a.at - b.at)[0];
  const producedToday = view.goods.reduce((a, g) => a + g.producedToday, 0);
  const waiting = view.goods.reduce((a, g) => a + g.waiting, 0);
  const packedFresh = view.goods.filter((g) => !g.product.frozen).reduce((a, g) => a + g.packed, 0);
  const packedFrozen = view.goods.filter((g) => g.product.frozen).reduce((a, g) => a + g.packed, 0);
  const enRoute = view.vehicles.filter((v) => v.status === 'en_route').length;
  const rawLow = view.raw.filter((r) => r.level !== 'ok').length;

  const chain: { tab: SupplyTab; title: string; value: string; sub: string; warn: 'warning' | 'critical' | null }[] = [
    { tab: 'raw', title: 'Приёмка', value: plural(deliveriesToday.filter((d) => d.at <= now).length, ['поставка', 'поставки', 'поставок']), sub: nextDelivery ? `далее: ${nameOf(nextDelivery.materialId).split(' ')[0]} ${fmtTime(nextDelivery.at, tz)}` : 'поставок не ждём', warn: null },
    { tab: 'raw', title: 'Склад сырья', value: plural(view.raw.length, ['позиция', 'позиции', 'позиций']), sub: rawLow ? `${rawLow} — мало` : 'всё в норме', warn: worst('raw') },
    { tab: 'goods', title: 'Производство', value: fmtMass(producedToday), sub: 'выпущено сегодня', warn: null },
    { tab: 'goods', title: 'Упаковка', value: fmtMass(waiting), sub: 'ждёт упаковки', warn: null },
    { tab: 'goods', title: 'Склад продукции', value: fmtMass(packedFresh + packedFrozen), sub: `заморозка ${fmtMass(packedFrozen)}`, warn: worst('goods') },
    { tab: 'trips', title: 'Доставка', value: plural(view.tripsToday.length, ['рейс', 'рейса', 'рейсов']), sub: `в пути: ${enRoute}`, warn: worst('trips') },
  ];

  const lots: Lot[] = inv.lots((l) => l.kind === lotKind).sort((a, b) => b.at - a.at).slice(0, 80);
  const selectedLot = lotId ? inv.lot(lotId) : null;

  return (
    <div className="chart-modal-overlay" role="dialog" aria-modal="true" aria-label="Цепочка поставок" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="chart-modal energy-modal supply-modal">
        <div className="modal-head">
          <div className="modal-title-wrap">
            <h2 className="modal-title">Цепочка: сырьё → производство → доставка</h2>
            <div className="modal-sub">
              Остатки, сроки годности, рейсы и прослеживаемость партий
              {ds.kind === 'mock' && <span className="chart-badge energy-demo">демо</span>}
            </div>
          </div>
          <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden>
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="segmented supply-tabs" role="tablist" aria-label="Разделы">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
              {worst(t.id) && t.id !== 'overview' && <span className={`supply-dot is-${worst(t.id)}`} aria-label="есть предупреждения" />}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            <ol className="supply-chain">
              {chain.map((c, i) => (
                <li key={c.title}>
                  <button type="button" className={`supply-node${c.warn ? ` is-${c.warn}` : ''}`} onClick={() => setTab(c.tab)}>
                    <span className="supply-node-step">{String(i).padStart(2, '0')}</span>
                    <span className="supply-node-title">
                      {c.warn && <WarnIcon level={c.warn} />} {c.title}
                    </span>
                    <span className="supply-node-value">{c.value}</span>
                    <span className="supply-node-sub">{c.sub}</span>
                  </button>
                </li>
              ))}
            </ol>
            <h3 className="supply-h">Требует внимания</h3>
            {view.alerts.length ? (
              <ul className="supply-alerts">
                {view.alerts.map((a, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => setTab(a.tab)}>
                      <WarnIcon level={a.level} />
                      <span>{a.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Всё в норме.</p>
            )}
          </>
        )}

        {tab === 'raw' && (
          <div className="energy-table-wrap">
            <table className="energy-table">
              <thead>
                <tr>
                  <th scope="col">Сырьё</th>
                  <th scope="col">Остаток</th>
                  <th scope="col">Минимум</th>
                  <th scope="col">Хватит на</th>
                  <th scope="col">Состояние</th>
                  <th scope="col">Ближайший срок</th>
                  <th scope="col">Последняя поставка</th>
                  <th scope="col">Следующая</th>
                </tr>
              </thead>
              <tbody>
                {view.raw.map((r) => (
                  <tr key={r.material.id}>
                    <td>
                      {r.material.name} <span className="muted">· {r.material.storage === 'cold' ? 'холод' : 'сухой склад'}</span>
                    </td>
                    <td>{fmtMass(r.stock)}</td>
                    <td className="muted">{fmtMass(r.material.minStock)}</td>
                    <td>{r.daysOfCover === null ? '—' : `${fmtNum(r.daysOfCover, 1)} дн.`}</td>
                    <td><LevelChip level={r.level} /></td>
                    <td>{r.nearestExpiry ? dt(r.nearestExpiry) : '—'}</td>
                    <td>{r.lastDelivery ? dt(r.lastDelivery) : '—'}</td>
                    <td>{r.nextDelivery ? dt(r.nextDelivery) : <span className="muted">не запланирована</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'goods' && (
          <div className="energy-table-wrap">
            <table className="energy-table">
              <thead>
                <tr>
                  <th scope="col">Продукция</th>
                  <th scope="col">Выпущено сегодня</th>
                  <th scope="col">Ждёт упаковки</th>
                  <th scope="col">На складе</th>
                  <th scope="col">Срок</th>
                  <th scope="col">Истекает за 12 ч</th>
                  <th scope="col">Просрочено</th>
                  <th scope="col">Списано за 7 дн.</th>
                </tr>
              </thead>
              <tbody>
                {view.goods.map((g) => (
                  <tr key={g.product.id}>
                    <td>
                      {g.product.name} {g.product.frozen && <span className="muted">· −18 °C</span>}
                    </td>
                    <td>{fmtMass(g.producedToday)}</td>
                    <td>{g.waiting ? fmtMass(g.waiting) : <span className="muted">—</span>}</td>
                    <td>{fmtMass(g.packed)}</td>
                    <td className="muted">{g.product.shelfLifeDays} дн.</td>
                    <td>{g.expiringSoon ? <span className="supply-warn"><WarnIcon level="warning" /> {fmtMass(g.expiringSoon)}</span> : <span className="muted">—</span>}</td>
                    <td>{g.expired ? <span className="supply-crit"><WarnIcon level="critical" /> {fmtMass(g.expired)}</span> : <span className="muted">—</span>}</td>
                    <td>{g.writtenOff7d ? fmtMass(g.writtenOff7d) : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'trips' && (
          <div className="energy-table-wrap">
            <table className="energy-table">
              <thead>
                <tr>
                  <th scope="col">Рейс</th>
                  <th scope="col" className="txt">Машина</th>
                  <th scope="col">Выезд</th>
                  <th scope="col">Возврат</th>
                  <th scope="col">Заказов</th>
                  <th scope="col">Груз</th>
                  <th scope="col">Статус</th>
                </tr>
              </thead>
              <tbody>
                {view.tripsToday.map((t) => {
                  const st = tripStatus(t, now);
                  const v = config.supply!.vehicles.find((x) => x.id === t.vehicleId);
                  const load = t.orders.reduce((a, o) => a + o.kg, 0);
                  return (
                    <Fragment key={t.id}>
                      <tr className={openTrip === t.id ? 'is-selected' : ''} tabIndex={0} onClick={() => setOpenTrip(openTrip === t.id ? null : t.id)} onKeyDown={(e) => e.key === 'Enter' && setOpenTrip(openTrip === t.id ? null : t.id)}>
                        <td>{t.id}</td>
                        <td className="txt">
                          {v?.name ?? t.vehicleId} <span className="muted">· {v?.plate}</span>
                        </td>
                        <td>{fmtTime(t.departAt, tz)}</td>
                        <td>{fmtTime(t.returnAt, tz)}</td>
                        <td>{t.orders.length}</td>
                        <td>
                          {fmtMass(load)}
                          {v && <span className="muted"> · {Math.round((load / v.capacityKg) * 100)} %</span>}
                        </td>
                        <td>
                          <span className={`supply-trip is-${st}`}>{TRIP_LABEL[st]}</span>
                        </td>
                      </tr>
                      {openTrip === t.id &&
                        t.orders.map((o) => (
                          <tr key={o.orderId} className="supply-subrow">
                            <td className="muted">{o.orderId}</td>
                            <td colSpan={4} className="txt">{o.client}</td>
                            <td>{fmtMass(o.kg)}</td>
                            <td className="muted">
                              {snap.shortages.some((s) => s.ref === o.orderId) ? (
                                <span className="supply-warn">
                                  <WarnIcon level="warning" /> недогруз
                                </span>
                              ) : st === 'planned' ? 'собирается' : 'отгружен'}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'lots' && (
          <div className="supply-lots">
            <div className="supply-lots-list">
              <div className="segmented" role="tablist" aria-label="Тип партий">
                <button role="tab" aria-selected={lotKind === 'product'} className={lotKind === 'product' ? 'is-active' : ''} onClick={() => (setLotKind('product'), setLotId(null))}>
                  Продукция
                </button>
                <button role="tab" aria-selected={lotKind === 'raw'} className={lotKind === 'raw' ? 'is-active' : ''} onClick={() => (setLotKind('raw'), setLotId(null))}>
                  Сырьё
                </button>
              </div>
              <div className="energy-table-wrap">
                <table className="energy-table">
                  <thead>
                    <tr>
                      <th scope="col">Партия</th>
                      <th scope="col" className="txt">{lotKind === 'raw' ? 'Сырьё' : 'Продукция'}</th>
                      <th scope="col">Остаток</th>
                      <th scope="col">Годна до</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((l) => (
                      <tr key={l.id} className={l.id === lotId ? 'is-selected' : ''} tabIndex={0} onClick={() => setLotId(l.id)} onKeyDown={(e) => e.key === 'Enter' && setLotId(l.id)}>
                        <td>{l.id}</td>
                        <td className="txt">{nameOf(l.itemId)}</td>
                        <td>{fmtMass(l.qty)}</td>
                        <td className={l.expiresAt <= now ? 'supply-crit' : ''}>{dt(l.expiresAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <section className="energy-breakdown supply-trace" aria-label="Прослеживаемость партии">
              {!selectedLot ? (
                <p className="muted">Выберите партию — покажу, из чего она сделана и кому уехала.</p>
              ) : selectedLot.kind === 'product' ? (
                (() => {
                  const t = inv.trace(selectedLot.id);
                  return (
                    <>
                      <div className="energy-breakdown-title">
                        {selectedLot.id} · {nameOf(selectedLot.itemId)}
                      </div>
                      <p className="supply-trace-meta">
                        Выпуск {dt(selectedLot.at)} · смена {'shiftKey' in selectedLot.source ? selectedLot.source.shiftKey.split('#')[1] : '—'} · {fmtMass(selectedLot.initialQty)}
                        {selectedLot.packedAt ? ` · упакована ${fmtTime(selectedLot.packedAt, tz)}` : ' · ждёт упаковки'}
                      </p>
                      <h4 className="supply-h4">Сделано из</h4>
                      <ul className="supply-trace-list">
                        {t.inputs.map((i) => (
                          <li key={i.lot.id}>
                            <button type="button" onClick={() => (setLotKind('raw'), setLotId(i.lot.id))}>
                              {nameOf(i.lot.itemId)} — {fmtMass(i.qty)}
                            </button>
                            <span className="muted">
                              партия {i.lot.id} · {'supplier' in i.lot.source ? i.lot.source.supplier : ''} · приход {dt(i.lot.at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <h4 className="supply-h4">Отгружено</h4>
                      {t.shipments.length ? (
                        <ul className="supply-trace-list">
                          {t.shipments.map((s, k) => (
                            <li key={k}>
                              <span>
                                {s.client} — {fmtMass(s.qty)}
                              </span>
                              <span className="muted">
                                заказ {s.orderId} · {vehicleName(s.vehicleId)} · {dt(s.at)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted">Ещё не отгружалась.</p>
                      )}
                    </>
                  );
                })()
              ) : (
                (() => {
                  const affected = inv.affectedBy(selectedLot.id);
                  const clients = new Set(affected.flatMap((l) => inv.trace(l.id).shipments.map((s) => s.client)));
                  return (
                    <>
                      <div className="energy-breakdown-title">
                        {selectedLot.id} · {nameOf(selectedLot.itemId)}
                      </div>
                      <p className="supply-trace-meta">
                        {'supplier' in selectedLot.source ? selectedLot.source.supplier : ''} · приход {dt(selectedLot.at)} · {fmtMass(selectedLot.initialQty)}, осталось {fmtMass(selectedLot.qty)}
                      </p>
                      <h4 className="supply-h4">Использовано в партиях продукции ({affected.length})</h4>
                      <ul className="supply-trace-list">
                        {affected.slice(0, 30).map((l) => (
                          <li key={l.id}>
                            <button type="button" onClick={() => (setLotKind('product'), setLotId(l.id))}>
                              {nameOf(l.itemId)} — {l.id}
                            </button>
                            <span className="muted">{dt(l.at)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="supply-trace-meta">
                        Если с этой партией проблема — продукция из неё уехала к <strong>{clients.size}</strong> клиентам.
                      </p>
                    </>
                  );
                })()
              )}
            </section>
          </div>
        )}

        <p className="energy-note">
          Сырьё списывается по рецептуре на выпуск каждой партии; со склада первым уходит то, у чего раньше срок годности.
          {ds.kind === 'mock' ? ' Поставщики, клиенты и объёмы — демо.' : ''}
        </p>
      </div>
    </div>
  );
}
