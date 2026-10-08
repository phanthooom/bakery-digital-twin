import type { EnergyConfig, ShiftConfig, Tariff, TariffZone } from './types';

const HOUR = 3_600_000;

/* ── Местное время ── */

const partsFmt = new Map<string, Intl.DateTimeFormat>();
/** Дата (YYYY-MM-DD) и минуты от полуночи по местному времени зоны. */
export function localParts(t: number, timezone: string): { date: string; minutes: number } {
  let f = partsFmt.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    partsFmt.set(timezone, f);
  }
  const p = Object.fromEntries(f.formatToParts(t).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
/** Минута m попадает в интервал [from, to), который может переходить через полночь. */
const inRange = (m: number, from: string, to: string) => {
  const a = hm(from);
  const b = hm(to);
  return a <= b ? m >= a && m < b : m >= a || m < b;
};
const prevDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 24 * HOUR).toISOString().slice(0, 10);

/* ── Тариф ── */

export interface TariffAt {
  pricePerKwh: number;
  tariff: Tariff;
  zone?: TariffZone;
}

/** Цена 1 кВт·ч в момент t: последний тариф, начавшийся не позже местной даты, × коэффициент зоны суток. */
export function tariffAt(t: number, energy: EnergyConfig, timezone: string): TariffAt {
  const { date, minutes } = localParts(t, timezone);
  const sorted = [...energy.tariffs].sort((a, b) => a.from.localeCompare(b.from));
  const tariff = sorted.filter((x) => x.from <= date).pop() ?? sorted[0]!;
  const zone = tariff.zones?.find((z) => inRange(minutes, z.from, z.to));
  return { pricePerKwh: tariff.pricePerKwh * (zone?.coef ?? 1), tariff, zone };
}

/* ── Смены ── */

/** Смена в момент t и её дата — дата начала смены (ночная 22–06 после полуночи относится к вчера). */
export function shiftAt(t: number, shifts: ShiftConfig[], timezone: string): { shiftId: string; date: string } {
  const { date, minutes } = localParts(t, timezone);
  const shift = shifts.find((s) => inRange(minutes, s.from, s.to)) ?? shifts[0]!;
  const crossesMidnight = hm(shift.from) > hm(shift.to);
  return { shiftId: shift.id, date: crossesMidnight && minutes < hm(shift.to) ? prevDate(date) : date };
}

/* ── Журнал кВт·ч по часам ── */

export interface EnergyEntry {
  equipmentId: string;
  /** Начало часа, мс UTC. */
  hour: number;
  kwh: number;
}

/** Потреблённая энергия по станкам и часам. Показание мощности kw на отрезке [from, to) → кВт·ч. */
export class EnergyLedger {
  private readonly map = new Map<string, EnergyEntry>();

  add(equipmentId: string, fromMs: number, toMs: number, kw: number): void {
    if (!(toMs > fromMs) || !(kw > 0)) return;
    for (let t = fromMs; t < toMs; ) {
      const hour = Math.floor(t / HOUR) * HOUR;
      const end = Math.min(toMs, hour + HOUR);
      const key = `${equipmentId}|${hour}`;
      const e = this.map.get(key) ?? { equipmentId, hour, kwh: 0 };
      e.kwh += (kw * (end - t)) / HOUR;
      this.map.set(key, e);
      t = end;
    }
  }

  /** Записи за часы, начавшиеся в [fromMs, toMs), по времени. */
  entries(fromMs = -Infinity, toMs = Infinity): EnergyEntry[] {
    return [...this.map.values()]
      .filter((e) => e.hour >= fromMs && e.hour < toMs)
      .map((e) => ({ ...e, kwh: Math.round(e.kwh * 1e6) / 1e6 }))
      .sort((a, b) => a.hour - b.hour || a.equipmentId.localeCompare(b.equipmentId));
  }
}

/* ── Сводки ── */

export type EnergyGrouping = 'shift' | 'day' | 'month';

export interface EnergyRow {
  /** shift: «2026-10-08#1», day: «2026-10-08», month: «2026-10». */
  key: string;
  label: string;
  /** Начало первого часа в строке, мс. */
  from: number;
  kwh: number;
  cost: number;
  byEquipment: Record<string, { kwh: number; cost: number }>;
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const dm = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;
const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Сводка кВт·ч и суммы по сменам, дням или месяцам; сумма — по тарифу каждого часа. */
export function summarizeEnergy(entries: EnergyEntry[], energy: EnergyConfig, timezone: string, by: EnergyGrouping): EnergyRow[] {
  const rows = new Map<string, EnergyRow>();
  for (const e of entries) {
    let key: string;
    let label: string;
    if (by === 'shift') {
      const s = shiftAt(e.hour, energy.shifts, timezone);
      const shift = energy.shifts.find((x) => x.id === s.shiftId)!;
      key = `${s.date}#${s.shiftId}`;
      label = `${dm(s.date)} · ${shift.name} (${shift.from}–${shift.to})`;
    } else {
      const { date } = localParts(e.hour, timezone);
      key = by === 'day' ? date : date.slice(0, 7);
      label = by === 'day' ? `${dm(date)}.${date.slice(0, 4)}` : `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
    }
    const cost = e.kwh * tariffAt(e.hour, energy, timezone).pricePerKwh;
    const row = rows.get(key) ?? { key, label, from: e.hour, kwh: 0, cost: 0, byEquipment: {} };
    row.kwh += e.kwh;
    row.cost += cost;
    row.from = Math.min(row.from, e.hour);
    const q = (row.byEquipment[e.equipmentId] ??= { kwh: 0, cost: 0 });
    q.kwh += e.kwh;
    q.cost += cost;
    rows.set(key, row);
  }
  return [...rows.values()]
    .map((r) => ({
      ...r,
      kwh: round(r.kwh, 3),
      cost: round(r.cost, 0),
      byEquipment: Object.fromEntries(Object.entries(r.byEquipment).map(([k, v]) => [k, { kwh: round(v.kwh, 3), cost: round(v.cost, 0) }])),
    }))
    .sort((a, b) => a.from - b.from);
}
