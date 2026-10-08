import { localParts, type EnergyGrouping, type EnergyRow } from '@bakery/shared';

/** Выпуск, введённый вручную: ключ смены «YYYY-MM-DD#id» → кг. */
export type Outputs = Record<string, number>;

export interface ReportRow extends EnergyRow {
  /** Выпуск за строку, кг (сумма введённых смен); null — ничего не введено. */
  kg: number | null;
  /** Введён выпуск всех смен строки, в которых было потребление. */
  complete: boolean;
  kwhPerKg: number | null;
  costPerKg: number | null;
}

const r = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/**
 * Добавляет выпуск и удельный расход. Для дня и месяца выпуск — сумма смен, начавшихся в этот
 * день/месяц, а кВт·ч на кг считается по этим же сменам и только если введены все смены.
 */
export function withOutput(rows: EnergyRow[], by: EnergyGrouping, shiftRows: EnergyRow[], outputs: Outputs): ReportRow[] {
  return rows.map((row) => {
    const covered = by === 'shift' ? [row] : shiftRows.filter((s) => s.key.slice(0, row.key.length) === row.key && s.key[row.key.length] === (by === 'day' ? '#' : '-'));
    const withEnergy = covered.filter((s) => s.kwh > 0);
    const entered = withEnergy.filter((s) => (outputs[s.key] ?? 0) > 0);
    const kg = entered.length ? entered.reduce((a, s) => a + outputs[s.key]!, 0) : null;
    const complete = withEnergy.length > 0 && entered.length === withEnergy.length;
    const kwh = withEnergy.reduce((a, s) => a + s.kwh, 0);
    const cost = withEnergy.reduce((a, s) => a + s.cost, 0);
    return {
      ...row,
      kg,
      complete,
      kwhPerKg: complete && kg ? r(kwh / kg, 3) : null,
      costPerKg: complete && kg ? r(cost / kg, 1) : null,
    };
  });
}

/** Прогноз на календарный месяц: потребление с начала месяца × (часов в месяце / прошло часов). */
export function monthForecast(monthToDate: { kwh: number; cost: number }, now: number, timezone: string): { kwh: number; cost: number } {
  const { date, minutes } = localParts(now, timezone);
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const elapsedH = (day - 1) * 24 + minutes / 60;
  if (elapsedH < 1) return { ...monthToDate };
  const k = (daysInMonth * 24) / elapsedH;
  return { kwh: r(monthToDate.kwh * k, 1), cost: Math.round(monthToDate.cost * k) };
}

/* ── Excel ── */

type Cell = { value: string | number | null; type?: typeof String | typeof Number; format?: string; fontWeight?: 'bold'; backgroundColor?: string; align?: 'left' | 'right' | 'center' } | null;
export interface SheetSpec {
  sheet: string;
  data: Cell[][];
  columns: { width: number }[];
  stickyRowsCount?: number;
}

const HEAD = (value: string): Cell => ({ value, fontWeight: 'bold', backgroundColor: '#EEF3FA' });
const KWH = '#,##0.0';
const MONEY = '#,##0';
const num = (v: number | null, format: string, bold = false): Cell => (v === null ? null : { value: v, type: Number, format, ...(bold ? { fontWeight: 'bold' as const } : {}) });
const text = (v: string, bold = false): Cell => ({ value: v, type: String, ...(bold ? { fontWeight: 'bold' as const } : {}) });

function periodSheet(sheet: string, firstCol: string, rows: ReportRow[], currency: string): SheetSpec {
  const total = rows.reduce((a, x) => ({ kwh: a.kwh + x.kwh, cost: a.cost + x.cost }), { kwh: 0, cost: 0 });
  return {
    sheet,
    stickyRowsCount: 1,
    columns: [{ width: 34 }, { width: 12 }, { width: 16 }, { width: 13 }, { width: 13 }, { width: 13 }],
    data: [
      [HEAD(firstCol), HEAD('кВт·ч'), HEAD(`Сумма, ${currency}`), HEAD('Выпуск, кг'), HEAD('кВт·ч на кг'), HEAD(`${currency} на кг`)],
      ...rows.map((x) => [text(x.label), num(x.kwh, KWH), num(x.cost, MONEY), num(x.kg, '#,##0'), num(x.kwhPerKg, '0.000'), num(x.costPerKg, '#,##0.0')]),
      [text('Итого', true), num(r(total.kwh, 3), KWH, true), num(Math.round(total.cost), MONEY, true), null, null, null],
    ],
  };
}

export interface WorkbookInput {
  title: string;
  currency: string;
  /** [действует с, цена за кВт·ч, основание] */
  tariffLines: [string, number, string][];
  shifts: ReportRow[];
  days: ReportRow[];
  months: ReportRow[];
  equipment: { name: string; kwh: number; cost: number }[];
}

/** Листы отчёта: смены, дни, месяцы, разбивка по станкам, тарифы. Числа — числами, чтобы в Excel можно было считать. */
export function workbookSheets(input: WorkbookInput): SheetSpec[] {
  const eqTotal = input.equipment.reduce((a, e) => a + e.kwh, 0);
  return [
    periodSheet('Смены', 'Смена', input.shifts, input.currency),
    periodSheet('Дни', 'День', input.days, input.currency),
    periodSheet('Месяцы', 'Месяц', input.months, input.currency),
    {
      sheet: 'По станкам',
      stickyRowsCount: 1,
      columns: [{ width: 34 }, { width: 12 }, { width: 16 }, { width: 10 }],
      data: [
        [HEAD('Станок'), HEAD('кВт·ч'), HEAD(`Сумма, ${input.currency}`), HEAD('Доля')],
        ...input.equipment.map((e) => [text(e.name), num(e.kwh, KWH), num(e.cost, MONEY), num(eqTotal ? e.kwh / eqTotal : 0, '0.0%')]),
      ],
    },
    {
      sheet: 'Тариф',
      columns: [{ width: 14 }, { width: 18 }, { width: 46 }],
      data: [
        [text(input.title, true), null, null],
        [HEAD('Действует с'), HEAD(`Цена за кВт·ч, ${input.currency}`), HEAD('Основание')],
        ...input.tariffLines.map(([from, price, basis]) => [text(from), num(price, '#,##0.00'), text(basis)]),
        [null, null, null],
        [text('Сумма — по станкам под мониторингом; общий счёт цеха больше (освещение, вентиляция, офис).'), null, null],
      ],
    },
  ];
}
