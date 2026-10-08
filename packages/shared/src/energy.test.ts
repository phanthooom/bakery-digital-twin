import { describe, expect, it } from 'vitest';
import { EnergyLedger, shiftAt, summarizeEnergy, tariffAt } from './energy';
import type { EnergyConfig } from './types';

const TZ = 'Asia/Tashkent'; // UTC+5
const H = 3_600_000;
/** Местное время Ташкента → мс UTC. */
const local = (iso: string) => Date.parse(`${iso}+05:00`);

const ENERGY: EnergyConfig = {
  currency: 'сум',
  tariffs: [
    { from: '2025-05-01', pricePerKwh: 1000, basis: 'с 1 мая 2025' },
    { from: '2026-06-01', pricePerKwh: 1100, basis: 'ПКМ №243 от 15.05.2026' },
  ],
  shifts: [
    { id: '1', name: '1 смена', from: '06:00', to: '14:00' },
    { id: '2', name: '2 смена', from: '14:00', to: '22:00' },
    { id: '3', name: '3 смена', from: '22:00', to: '06:00' },
  ],
};

describe('tariffAt — цена кВт·ч на момент времени', () => {
  it('действует последний тариф, начавшийся не позже этой даты по местному времени', () => {
    expect(tariffAt(local('2026-05-31T23:00:00'), ENERGY, TZ).pricePerKwh).toBe(1000);
    // 00:30 1 июня в Ташкенте — это ещё 31 мая по UTC, но тариф уже новый
    expect(tariffAt(local('2026-06-01T00:30:00'), ENERGY, TZ).pricePerKwh).toBe(1100);
  });

  it('зона суток умножает цену (дифференцированный тариф для I группы)', () => {
    const zoned: EnergyConfig = {
      ...ENERGY,
      tariffs: [{ from: '2026-06-01', pricePerKwh: 1100, zones: [{ name: 'Полупик', from: '09:00', to: '17:00', coef: 1 / 1.5 }] }],
    };
    const day = tariffAt(local('2026-10-08T10:00:00'), zoned, TZ);
    expect(day.pricePerKwh).toBeCloseTo(733.33, 2);
    expect(day.zone?.name).toBe('Полупик');
    expect(tariffAt(local('2026-10-08T20:00:00'), zoned, TZ).pricePerKwh).toBe(1100);
  });

  it('до первого тарифа — первый тариф (нельзя считать бесплатно)', () => {
    expect(tariffAt(local('2020-01-01T12:00:00'), ENERGY, TZ).pricePerKwh).toBe(1000);
  });
});

describe('shiftAt — смена и её дата', () => {
  it('ночная смена 22–06 относится к дате, когда началась', () => {
    expect(shiftAt(local('2026-10-08T23:00:00'), ENERGY.shifts, TZ)).toEqual({ shiftId: '3', date: '2026-10-08' });
    expect(shiftAt(local('2026-10-09T03:00:00'), ENERGY.shifts, TZ)).toEqual({ shiftId: '3', date: '2026-10-08' });
  });
  it('границы смен', () => {
    expect(shiftAt(local('2026-10-09T06:00:00'), ENERGY.shifts, TZ)).toEqual({ shiftId: '1', date: '2026-10-09' });
    expect(shiftAt(local('2026-10-09T13:59:00'), ENERGY.shifts, TZ).shiftId).toBe('1');
    expect(shiftAt(local('2026-10-09T14:00:00'), ENERGY.shifts, TZ).shiftId).toBe('2');
  });
});

describe('EnergyLedger — кВт·ч по часам', () => {
  it('мощность × время, с разбивкой по границе часа', () => {
    const l = new EnergyLedger();
    l.add('oven-1', local('2026-10-08T10:30:00'), local('2026-10-08T11:30:00'), 2);
    expect(l.entries()).toEqual([
      { equipmentId: 'oven-1', hour: local('2026-10-08T10:00:00'), kwh: 1 },
      { equipmentId: 'oven-1', hour: local('2026-10-08T11:00:00'), kwh: 1 },
    ]);
  });
  it('несколько показаний за час складываются; выборка по периоду', () => {
    const l = new EnergyLedger();
    const t = local('2026-10-08T10:00:00');
    l.add('mixer-1', t, t + H / 2, 4);
    l.add('mixer-1', t + H / 2, t + H, 2);
    l.add('mixer-1', t + H, t + 2 * H, 3);
    expect(l.entries(t, t + H)).toEqual([{ equipmentId: 'mixer-1', hour: t, kwh: 3 }]);
  });
});

describe('summarizeEnergy — сводка по сменам, дням и месяцам', () => {
  const l = new EnergyLedger();
  // 31 мая 21:00–23:00 (тариф 1000) и 1 июня 07:00–08:00 (тариф 1100)
  l.add('oven-1', local('2026-05-31T21:00:00'), local('2026-05-31T23:00:00'), 10); // 20 кВт·ч: 10 во 2-й смене, 10 в 3-й
  l.add('mixer-1', local('2026-06-01T07:00:00'), local('2026-06-01T08:00:00'), 4); // 4 кВт·ч в 1-й смене
  const entries = l.entries();

  it('по сменам: кВт·ч, сумма по тарифу своего часа, разбивка по станкам', () => {
    const rows = summarizeEnergy(entries, ENERGY, TZ, 'shift');
    expect(rows.map((r) => [r.key, r.kwh, r.cost])).toEqual([
      ['2026-05-31#2', 10, 10_000],
      ['2026-05-31#3', 10, 10_000],
      ['2026-06-01#1', 4, 4_400],
    ]);
    expect(rows[2]!.byEquipment).toEqual({ 'mixer-1': { kwh: 4, cost: 4_400 } });
    expect(rows[0]!.label).toBe('31.05 · 2 смена (14:00–22:00)');
  });

  it('по дням и по месяцам — по местному календарю', () => {
    expect(summarizeEnergy(entries, ENERGY, TZ, 'day').map((r) => [r.key, r.kwh, r.cost])).toEqual([
      ['2026-05-31', 20, 20_000],
      ['2026-06-01', 4, 4_400],
    ]);
    const months = summarizeEnergy(entries, ENERGY, TZ, 'month');
    expect(months.map((r) => [r.key, r.label, r.kwh])).toEqual([
      ['2026-05', 'Май 2026', 20],
      ['2026-06', 'Июнь 2026', 4],
    ]);
  });
});
