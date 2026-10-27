import { useEffect, useMemo, useRef } from 'react';
import { cargoPlan, countDone, dockState, localParts, tripStatus, VAN_TIMING, SEMI_TIMING, type DockPhase, type Trip } from '@bakery/shared';
import { vanLane } from '../scene/DockTraffic';
import { useDataSource, useSupply } from '../data/store';
import { useDockPlan } from '../data/useDockPlan';
import { useNow } from './useNow';
import { SupplySim } from '../data/mockSupply';
import { fmtMass, fmtTime } from './format';
import { SUPPLIER_PLATE, SUPPLIER_VEHICLE, supplyView, type SupplyTab, type VehicleRow } from './supplyView';

const VEHICLE_STATUS: Record<VehicleRow['status'], string> = { at_dock: 'У рампы', loading: 'Погрузка', en_route: 'В рейсе' };
/** Что фургон делает у рампы прямо сейчас — по тому же расписанию, что видит сцена (с демо и срочными рейсами). */
const DOCK_STATUS: Record<DockPhase, string> = {
  away: 'В рейсе',
  arriving: 'Возвращается',
  reversing: 'Встаёт к рампе',
  parked: 'У рампы',
  doorsOpening: 'Погрузка',
  working: 'Погрузка',
  doorsClosing: 'Погрузка',
  departing: 'Выезжает',
};

/** Ход погрузки фургона или разгрузки поставщика прямо сейчас — по тому же расписанию, что видит сцена и склад. */
function DockProgress({ id }: { id: string }) {
  const plan = useDockPlan();
  const now = useNow(1000);
  if (!plan) return null;
  let done = 0;
  let total = 0;
  let label = '';
  if (id === SUPPLIER_VEHICLE) {
    const u = plan.supplier.find((x) => x.visit.arriveAt !== null && now >= x.visit.arriveAt - SEMI_TIMING.forwardMs - SEMI_TIMING.reverseMs && now < (x.visit.leaveAt ?? Infinity));
    if (!u) return null;
    done = countDone(u.haul.doneAt, now);
    total = u.pallets;
    label = `На складе ${done} из ${total} ${total === 1 ? 'поддона' : 'поддонов'}`;
  } else {
    const l = plan.vans.get(id)?.loadings.find((x) => now >= x.visit.workFrom && now < (x.visit.leaveAt ?? Infinity) + VAN_TIMING.departMs);
    if (!l || !l.cargo.crates) return null;
    done = countDone(l.haul.doneAt, now);
    total = l.cargo.crates;
    label = `В кузове ${done} из ${total} лотков`;
  }
  return (
    <div className="section">
      <div className="meta-row">{label}</div>
      <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={label}>
        <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

/**
 * Карточка машины у рампы: фургон — текущий и следующий рейс, загрузка, заказы;
 * машина поставщика — что разгружает и ближайшие поставки сырья.
 */
export function VehicleCard({ id, onClose, onOpenSupply }: { id: string; onClose: () => void; onOpenSupply: (tab: SupplyTab) => void }) {
  const { config } = useDataSource();
  const snap = useSupply();
  const plan = useDockPlan();
  const now = useNow(1000);
  const tz = config.site.timezone;
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus({ preventScroll: true }), []);
  const view = useMemo(() => (snap ? supplyView(snap, config, SupplySim.localMidnight(snap.now, tz)) : null), [snap, config, tz]);
  if (!snap || !view) return null;

  const today = localParts(snap.now, tz).date;
  const at = (ts: number) => `${localParts(ts, tz).date === today ? '' : 'завтра '}${fmtTime(ts, tz)}`;
  const supplier = id === SUPPLIER_VEHICLE;
  const row = view.vehicles.find((v) => v.vehicle.id === id);
  if (!supplier && !row) return null;

  const head = (title: string, sub: string) => (
    <div className="card-head">
      <div>
        <h2 className="card-title">{title}</h2>
        <div className="card-sub">{sub}</div>
      </div>
      <button ref={closeRef} className="card-close" onClick={onClose} aria-label="Закрыть карточку">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );

  if (supplier) {
    const { atDock, upcoming } = view.receiving;
    return (
      <aside className="card" aria-label="Машина поставщика" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        {head('Машина поставщика', `Tesla Semi · ${SUPPLIER_PLATE}`)}
        <div className="status-line">{atDock ? `Разгрузка: ${atDock.material.name}` : 'У рампы приёмки'}</div>
        <DockProgress id={id} />
        {atDock && (
          <div className="meta-row">
            {fmtMass(atDock.qty)} · {atDock.supplier} · поставка {at(atDock.at)}
          </div>
        )}
        <div className="section">
          <div className="meta-row">Ближайшие поставки</div>
          {upcoming.length ? (
            <ul className="vehicle-list">
              {upcoming.map((d) => (
                <li key={`${d.material.id}${d.at}`}>
                  <span className="vehicle-list-time">{at(d.at)}</span>
                  <span>{d.material.name}</span>
                  <span className="vehicle-list-qty">{fmtMass(d.qty)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="meta-row">Поставок не запланировано</div>
          )}
        </div>
        <div className="section line-actions">
          <button className="btn" onClick={() => onOpenSupply('raw')}>
            Склад сырья
          </button>
        </div>
      </aside>
    );
  }

  const v = row!;
  const vi = config.supply?.vehicles.findIndex((x) => x.id === id) ?? -1;
  const dock = vi >= 0 ? config.supply!.layout.shippingDocks[vi] : undefined;
  const visits = plan?.vans.get(id)?.visits;
  const phase = dock && visits ? dockState(visits, vanLane(config, dock.x), now, VAN_TIMING).phase : null;
  const tripBlock = (title: string, t: Trip) => {
    const load = t.orders.reduce((a, o) => a + o.kg, 0);
    const cargo = cargoPlan(t.orders, v.vehicle.capacityKg);
    const st = tripStatus(t, snap.now);
    return (
      <div className="section">
        <div className="meta-row">
          {title} {t.id}
        </div>
        <ul className="vehicle-list">
          <li>
            <span className="vehicle-list-time">{at(t.departAt)}</span>
            <span>{st === 'en_route' ? 'выехал' : 'выезд'}</span>
          </li>
          <li>
            <span className="vehicle-list-time">{at(t.returnAt)}</span>
            <span>возврат</span>
          </li>
          <li>
            <span className="vehicle-list-time">{t.orders.length} зак.</span>
            <span>
              груз {fmtMass(load)} · {Math.round((load / v.vehicle.capacityKg) * 100)} % · {cargo.crates} лотк.
            </span>
          </li>
        </ul>
        {cargo.overloadKg > 0 && (
          <div className="gas-alert is-warning" role="alert">
            <strong>Перегруз {fmtMass(cargo.overloadKg)}</strong>
            <span>Груз больше грузоподъёмности {fmtMass(v.vehicle.capacityKg)} — часть заказов перенести в другой рейс.</span>
          </div>
        )}
        <div className="vehicle-clients">{t.orders.map((o) => o.client).join(', ')}</div>
      </div>
    );
  };

  return (
    <aside className="card" aria-label={v.vehicle.name} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      {head(v.vehicle.name, `${v.vehicle.plate} · до ${fmtMass(v.vehicle.capacityKg)}${v.vehicle.refrigerated ? ' · рефрижератор' : ''}`)}
      <div className="status-line">
        {phase ? DOCK_STATUS[phase] : VEHICLE_STATUS[v.status]}
        <span className="since">
          · {v.status === 'en_route' ? `вернётся ${fmtTime(v.trip!.returnAt, tz)}` : v.status === 'loading' ? `выезд ${fmtTime(v.trip!.departAt, tz)}` : v.next ? `следующий рейс ${at(v.next.departAt)}` : 'рейсов нет'}
        </span>
      </div>
      <DockProgress id={id} />
      {v.trip && tripBlock('Рейс', v.trip)}
      {v.next && tripBlock('Следующий рейс', v.next)}
      <div className="section line-actions">
        <button className="btn" onClick={() => onOpenSupply('trips')}>
          Все рейсы
        </button>
      </div>
    </aside>
  );
}
