import { useEffect, useMemo, useRef } from 'react';
import { localParts, tripStatus, type Trip } from '@bakery/shared';
import { useDataSource, useSupply } from '../data/store';
import { SupplySim } from '../data/mockSupply';
import { fmtMass, fmtTime } from './format';
import { SUPPLIER_PLATE, SUPPLIER_VEHICLE, supplyView, type SupplyTab, type VehicleRow } from './supplyView';

const VEHICLE_STATUS: Record<VehicleRow['status'], string> = { at_dock: 'У рампы', loading: 'Погрузка', en_route: 'В рейсе' };

/**
 * Карточка машины у рампы: фургон — текущий и следующий рейс, загрузка, заказы;
 * машина поставщика — что разгружает и ближайшие поставки сырья.
 */
export function VehicleCard({ id, onClose, onOpenSupply }: { id: string; onClose: () => void; onOpenSupply: (tab: SupplyTab) => void }) {
  const { config } = useDataSource();
  const snap = useSupply();
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
  const tripBlock = (title: string, t: Trip) => {
    const load = t.orders.reduce((a, o) => a + o.kg, 0);
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
              груз {fmtMass(load)} · {Math.round((load / v.vehicle.capacityKg) * 100)} %
            </span>
          </li>
        </ul>
        <div className="vehicle-clients">{t.orders.map((o) => o.client).join(', ')}</div>
      </div>
    );
  };

  return (
    <aside className="card" aria-label={v.vehicle.name} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      {head(v.vehicle.name, `${v.vehicle.plate} · до ${fmtMass(v.vehicle.capacityKg)}${v.vehicle.refrigerated ? ' · рефрижератор' : ''}`)}
      <div className="status-line">
        {VEHICLE_STATUS[v.status]}
        <span className="since">
          · {v.status === 'en_route' ? `вернётся ${fmtTime(v.trip!.returnAt, tz)}` : v.status === 'loading' ? `выезд ${fmtTime(v.trip!.departAt, tz)}` : v.next ? `следующий рейс ${at(v.next.departAt)}` : 'рейсов нет'}
        </span>
      </div>
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
