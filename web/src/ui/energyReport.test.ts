import { describe, expect, it } from 'vitest';
import type { EnergyRow } from '@bakery/shared';
import { monthForecast, withOutput, workbookSheets } from './energyReport';

const row = (key: string, kwh: number, cost: number): EnergyRow => ({ key, label: key, from: 0, kwh, cost, byEquipment: {} });

const shifts = [row('2026-10-07#1', 100, 110_000), row('2026-10-07#2', 80, 88_000), row('2026-10-08#1', 50, 55_000)];

describe('withOutput — кВт·ч и сум на кг по введённому выпуску', () => {
  it('смена: делим на свой выпуск; без выпуска — пусто', () => {
    const r = withOutput(shifts, 'shift', shifts, { '2026-10-07#1': 400 });
    expect(r[0]).toMatchObject({ kg: 400, kwhPerKg: 0.25, costPerKg: 275 });
    expect(r[1]).toMatchObject({ kg: null, kwhPerKg: null, costPerKg: null });
  });

  it('день и месяц: только если введены все смены с потреблением', () => {
    const days = [row('2026-10-07', 180, 198_000), row('2026-10-08', 50, 55_000)];
    const partial = withOutput(days, 'day', shifts, { '2026-10-07#1': 400 });
    expect(partial[0]).toMatchObject({ kg: 400, complete: false, kwhPerKg: null });
    const full = withOutput(days, 'day', shifts, { '2026-10-07#1': 400, '2026-10-07#2': 500 });
    expect(full[0]).toMatchObject({ kg: 900, complete: true, kwhPerKg: 0.2, costPerKg: 220 });
    const month = withOutput([row('2026-10', 230, 253_000)], 'month', shifts, { '2026-10-07#1': 400, '2026-10-07#2': 500, '2026-10-08#1': 100 });
    expect(month[0]).toMatchObject({ kg: 1000, complete: true, kwhPerKg: 0.23 });
  });
});

describe('monthForecast — прогноз на месяц по темпу с начала месяца', () => {
  it('8 суток из 31 прошло — × 31/8', () => {
    const start = Date.parse('2026-10-01T00:00:00+05:00');
    const now = start + 8 * 24 * 3_600_000;
    expect(monthForecast({ kwh: 800, cost: 880_000 }, now, 'Asia/Tashkent')).toEqual({ kwh: 3100, cost: 3_410_000 });
  });
});

describe('workbookSheets — содержимое Excel', () => {
  it('листы с заголовками и числами (не строками), чтобы в Excel можно было считать', () => {
    const sheets = workbookSheets({
      title: 'Цех',
      currency: 'сум',
      tariffLines: [['2026-06-01', 1100, 'ПКМ №243']],
      shifts: withOutput(shifts, 'shift', shifts, {}),
      days: withOutput([row('2026-10-07', 180, 198_000)], 'day', shifts, {}),
      months: withOutput([row('2026-10', 230, 253_000)], 'month', shifts, {}),
      equipment: [{ name: 'Печь 1', kwh: 120, cost: 132_000 }],
    });
    expect(sheets.map((s) => s.sheet)).toEqual(['Смены', 'Дни', 'Месяцы', 'По станкам', 'Тариф']);
    const shiftSheet = sheets[0]!;
    expect(shiftSheet.data[0]!.map((c) => (c as { value: unknown }).value)).toEqual(['Смена', 'кВт·ч', 'Сумма, сум', 'Выпуск, кг', 'кВт·ч на кг', 'сум на кг']);
    const firstValue = shiftSheet.data[1]![1] as { value: unknown; type: unknown };
    expect(firstValue.value).toBe(100);
    expect(firstValue.type).toBe(Number);
  });
});
