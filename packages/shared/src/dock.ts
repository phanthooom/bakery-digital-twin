/**
 * Машины у рамп: маршрут во дворе, визиты к рампе (въезд → задний ход → двери → погрузка/разгрузка → выезд),
 * план груза и ходки рабочего (рохля) или погрузчика между складом и кузовом.
 *
 * Всё здесь — чистые функции от времени: сцена в каждом кадре спрашивает «где машина в момент now»
 * и ничего не накапливает. Поэтому перезагрузка посреди погрузки, переключение вкладки и перемотка времени
 * дают ту же картинку, а склад (mockSupply) списывает и приходует груз по тем же моментам, что видит сцена.
 *
 * Оси — как в цехе (ADR-0007): x вдоль передней стены, z от задней стены (−) к двору (+).
 * Положение машины — середина заднего торца кузова; heading — rotation.y, при котором кабина смотрит по ходу:
 * направление кабины (sin heading, cos heading).
 */
import type { FloorPoint } from './types';
import type { Trip, TripOrder } from './logistics';

const MIN = 60_000;

// ───────────────────────────── маршрут во дворе ─────────────────────────────

/** Участок пути: машина едет вперёд или задним ходом. */
export interface PathSeg {
  points: FloorPoint[];
  reverse: boolean;
}

export interface YardLane {
  /** x рампы (середина ворот). */
  dockX: number;
  /** z, где стоит зад машины у рампы. */
  parkedZ: number;
  /** С какой стороны двора машина приезжает и куда уезжает: +1 — со стороны +x, −1 — со стороны −x. */
  side: 1 | -1;
  /** Полоса въезда (по ней машина проезжает мимо рампы перед задним ходом). */
  laneZ: number;
  /** Полоса выезда. */
  exitLaneZ: number;
  /** Радиус поворота (по заднему торцу), м. */
  radius: number;
  /** Где машина появляется и исчезает — за краем двора. */
  farX: number;
}

const ARC_STEP = Math.PI / 60; // 3°

/** Четверть окружности: точки center + r·(fx(θ), fz(θ)), θ от 0 до π/2. */
function arc(cx: number, cz: number, r: number, fx: (t: number) => number, fz: (t: number) => number): FloorPoint[] {
  const pts: FloorPoint[] = [];
  const n = Math.ceil(Math.PI / 2 / ARC_STEP);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (Math.PI / 2);
    pts.push([cx + r * fx(t), cz + r * fz(t)]);
  }
  return pts;
}

/**
 * Въезд: вперёд по полосе мимо рампы, остановка, задним ходом дугой и прямо к рампе.
 * Кабина всё время смотрит в сторону, противоположную стороне въезда, а у рампы — во двор (+z).
 */
export function arrivalPath(y: YardLane): PathSeg[] {
  const { dockX, parkedZ, side: s, laneZ, radius: R, farX } = y;
  const stopX = dockX - s * R;
  const back = arc(stopX, laneZ - R, R, (t) => s * Math.sin(t), (t) => Math.cos(t));
  return [
    { points: [[farX, laneZ], [stopX, laneZ]], reverse: false },
    { points: [...back, [dockX, parkedZ]], reverse: true },
  ];
}

/** Выезд: прямо от рампы, поворот в сторону выезда, по полосе выезда за край двора. */
export function departurePath(y: YardLane): PathSeg[] {
  const { dockX, parkedZ, side: s, exitLaneZ, radius: R, farX } = y;
  const turnZ = exitLaneZ - R;
  const turn = arc(dockX + s * R, turnZ, R, (t) => -s * Math.cos(t), (t) => Math.sin(t));
  return [{ points: [[dockX, parkedZ], ...turn, [farX, exitLaneZ]], reverse: false }];
}

function segLengths(points: FloorPoint[]): number[] {
  return points.slice(1).map((p, i) => Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]));
}

export function pathLength(segs: PathSeg[]): number {
  return segs.reduce((a, s) => a + segLengths(s.points).reduce((x, y) => x + y, 0), 0);
}

export interface PathPose {
  x: number;
  z: number;
  /** rotation.y машины: кабина смотрит в (sin heading, cos heading). */
  heading: number;
  /** Задний ход — горят фонари заднего хода. */
  reverse: boolean;
}

/** Направление в вершине ломаной: среднее соседних отрезков (на концах — свой отрезок). */
function vertexDir(points: FloorPoint[], i: number): [number, number] {
  const dir = (k: number): [number, number] => {
    const a = points[k]!;
    const b = points[k + 1]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const last = points.length - 2;
  if (last < 0) return [0, 1];
  if (i <= 0) return dir(0);
  if (i > last) return dir(last);
  const [ax, az] = dir(i - 1);
  const [bx, bz] = dir(i);
  return [ax + bx, az + bz];
}

/**
 * Положение на пути через d метров от начала. Курс плавно поворачивается от вершины к вершине
 * (направления в вершинах интерполируются), поэтому на дугах из коротких хорд машина не дёргается.
 */
export function poseAlong(segs: PathSeg[], d: number): PathPose {
  let left = Math.max(0, d);
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k]!;
    const lengths = segLengths(seg.points);
    const L = lengths.reduce((a, b) => a + b, 0);
    if (left > L && k < segs.length - 1) {
      left -= L;
      continue;
    }
    let u = Math.min(left, L);
    let i = 0;
    while (i < lengths.length - 1 && u > lengths[i]!) u -= lengths[i++]!;
    const a = seg.points[i]!;
    const b = seg.points[i + 1] ?? a;
    const f = lengths[i] ? Math.min(1, u / lengths[i]!) : 0;
    const da = vertexDir(seg.points, i);
    const db = vertexDir(seg.points, i + 1);
    let dx = da[0] + (db[0] - da[0]) * f;
    let dz = da[1] + (db[1] - da[1]) * f;
    if (seg.reverse) {
      dx = -dx;
      dz = -dz;
    }
    return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, heading: Math.atan2(dx, dz), reverse: seg.reverse };
  }
  return { x: 0, z: 0, heading: 0, reverse: false };
}

// ───────────────────────────── визиты к рампе ─────────────────────────────

/**
 * Визит машины к рампе. Машина встаёт у рампы в arriveAt (конец заднего хода), с workFrom по workTo
 * двери открыты и идёт погрузка или разгрузка (включая открытие и закрытие дверей), в leaveAt трогается.
 */
export interface DockVisit {
  id: string;
  /** Рейс (для фургонов) или поставки (для поставщика), к которым относится визит. */
  ref: string | null;
  /** null — машина стоит у рампы с начала истории. */
  arriveAt: number | null;
  workFrom: number;
  workTo: number;
  /** null — остаётся у рампы. */
  leaveAt: number | null;
}

/** Длительности движений, мс. */
export interface MoveTiming {
  /** Проезд по полосе до точки заднего хода. */
  forwardMs: number;
  /** Задний ход до рампы. */
  reverseMs: number;
  /** Открыть или закрыть двери. */
  doorsMs: number;
  /** Выезд со двора. */
  departMs: number;
}

export const VAN_TIMING: MoveTiming = { forwardMs: 20_000, reverseMs: 15_000, doorsMs: 4_000, departMs: 20_000 };
export const SEMI_TIMING: MoveTiming = { forwardMs: 26_000, reverseMs: 24_000, doorsMs: 6_000, departMs: 28_000 };

const arrivalMs = (t: MoveTiming) => t.forwardMs + t.reverseMs;
/** Пауза между выездом и следующим въездом: машина успевает скрыться за краем двора. */
const AWAY_GAP_MS = 5_000;

/**
 * Визиты фургона по его рейсам: между возвратом из одного рейса и выездом в следующий.
 * Рейсы, наложенные по времени (например, срочный заказ из Telegram, пока фургон ещё в рейсе), не дают
 * скачков: фургон «возвращается» раньше, чтобы успеть к погрузке, а визиты никогда не пересекаются.
 */
export function vanVisits(trips: Trip[], vehicleId: string, timing: MoveTiming = VAN_TIMING): DockVisit[] {
  const mine = trips.filter((t) => t.vehicleId === vehicleId).sort((a, b) => a.departAt - b.departAt || a.id.localeCompare(b.id));
  const visits: DockVisit[] = [];
  let prev: Trip | null = null;
  let prevEnd = -Infinity; // когда предыдущий визит закончил выезд
  for (const t of mine) {
    let workFrom = t.departAt - t.loadMinutes * MIN;
    let arriveAt: number | null = null;
    if (prev) {
      arriveAt = Math.min(prev.returnAt, workFrom);
      arriveAt = Math.max(arriveAt, prevEnd + AWAY_GAP_MS + arrivalMs(timing));
    }
    const workTo = Math.max(t.departAt, arriveAt ?? -Infinity);
    if (arriveAt !== null) workFrom = Math.max(workFrom, arriveAt);
    visits.push({ id: `${vehicleId}:${t.id}`, ref: t.id, arriveAt, workFrom: Math.min(workFrom, workTo), workTo, leaveAt: workTo });
    prevEnd = workTo + timing.departMs;
    prev = t;
  }
  const last = mine.at(-1);
  if (last) {
    const arriveAt = Math.max(last.returnAt, prevEnd + AWAY_GAP_MS + arrivalMs(timing));
    visits.push({ id: `${vehicleId}:after:${last.id}`, ref: null, arriveAt, workFrom: arriveAt, workTo: arriveAt, leaveAt: null });
  }
  return visits;
}

/** Окно поставки у рампы приёмки: машина встаёт к рампе за 15 мин до часа поставки. */
export const RECEIVING_LEAD_MIN = 15;

/**
 * Визиты поставщика: к часу поставки машина уже у рампы, разгрузка — по числу поддонов,
 * выезд через 5 мин после закрытия дверей. Поставки, которые накладываются по времени, — один визит.
 */
export function supplierVisits(
  deliveries: { at: number; id: string; pallets: number }[],
  haul: HaulTiming = FORKLIFT_TIMING,
  timing: MoveTiming = SEMI_TIMING,
): DockVisit[] {
  const sorted = [...deliveries].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const visits: (DockVisit & { pallets: number; ids: string[]; lastAt: number })[] = [];
  // разгрузка длится не меньше чем до четверти часа после часа поставки (приёмка, документы)
  const workTo = (from: number, pallets: number, lastAt: number) => Math.max(from + workMs(pallets, haul, timing), lastAt + RECEIVING_LEAD_MIN * MIN);
  for (const d of sorted) {
    const from = d.at - RECEIVING_LEAD_MIN * MIN;
    const last = visits.at(-1);
    if (last && from < (last.leaveAt ?? Infinity) + timing.departMs + AWAY_GAP_MS + arrivalMs(timing)) {
      last.pallets += d.pallets;
      last.ids.push(d.id);
      last.lastAt = d.at;
      last.workTo = workTo(last.workFrom, last.pallets, d.at);
      last.leaveAt = last.workTo + 5 * MIN;
      continue;
    }
    const to = workTo(from, d.pallets, d.at);
    visits.push({ id: `supplier:${d.id}`, ref: d.id, arriveAt: from, workFrom: from, workTo: to, leaveAt: to + 5 * MIN, pallets: d.pallets, ids: [d.id], lastAt: d.at });
  }
  return visits.map(({ pallets: _p, ids, lastAt: _l, ...v }) => ({ ...v, ref: ids.join(',') }));
}

function workMs(items: number, haul: HaulTiming, timing: MoveTiming): number {
  return 2 * timing.doorsMs + Math.ceil(items / haul.perRun) * runActiveMs(haul, haul.perRun) + 2 * MIN;
}

export type DockPhase = 'away' | 'arriving' | 'reversing' | 'parked' | 'doorsOpening' | 'working' | 'doorsClosing' | 'departing';

export interface DockState extends PathPose {
  phase: DockPhase;
  /** Текущий визит; null — машины нет у рампы и она не едет. */
  visit: DockVisit | null;
  /** Двери: 0 — закрыты, 1 — распахнуты. */
  door: number;
  /** Окно работы с грузом при открытых дверях: [from, to). */
  work: { from: number; to: number } | null;
}

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Двери открываются/закрываются за doorsMs, но не дольше четверти окна работы. */
export function workWindow(v: DockVisit, timing: MoveTiming): { doors: number; from: number; to: number } {
  const doors = Math.min(timing.doorsMs, Math.max(0, v.workTo - v.workFrom) / 4);
  return { doors, from: v.workFrom + doors, to: v.workTo - doors };
}

/** Где машина и что с ней в момент now. */
export function dockState(visits: DockVisit[], yard: YardLane, now: number, timing: MoveTiming): DockState {
  const parked: PathPose = { x: yard.dockX, z: yard.parkedZ, heading: 0, reverse: false };
  const away: DockState = { ...poseAlong(arrivalPath(yard), 0), phase: 'away', visit: null, door: 0, work: null };
  for (const v of visits) {
    const start = v.arriveAt === null ? -Infinity : v.arriveAt - arrivalMs(timing);
    const end = v.leaveAt === null ? Infinity : v.leaveAt + timing.departMs;
    if (now < start || now >= end) continue;
    const base = { visit: v, door: 0, work: null };
    if (v.arriveAt !== null && now < v.arriveAt) {
      const segs = arrivalPath(yard);
      const L0 = pathLength([segs[0]!]);
      const L1 = pathLength([segs[1]!]);
      if (now < v.arriveAt - timing.reverseMs) {
        const t = (now - start) / timing.forwardMs;
        return { ...base, ...poseAlong(segs, L0 * smooth(t)), phase: 'arriving' };
      }
      const t = (now - (v.arriveAt - timing.reverseMs)) / timing.reverseMs;
      return { ...base, ...poseAlong(segs, L0 + L1 * smooth(t)), phase: 'reversing' };
    }
    if (v.leaveAt !== null && now >= v.leaveAt) {
      const segs = departurePath(yard);
      const t = (now - v.leaveAt) / timing.departMs;
      return { ...base, ...poseAlong(segs, pathLength(segs) * smooth(t)), phase: 'departing' };
    }
    const w = workWindow(v, timing);
    const work = { from: w.from, to: w.to };
    if (w.doors > 0 && now >= v.workFrom && now < v.workTo) {
      if (now < w.from) return { ...base, ...parked, phase: 'doorsOpening', door: smooth((now - v.workFrom) / w.doors), work };
      if (now < w.to) return { ...base, ...parked, phase: 'working', door: 1, work };
      return { ...base, ...parked, phase: 'doorsClosing', door: smooth((v.workTo - now) / w.doors), work };
    }
    return { ...base, ...parked, phase: 'parked' };
  }
  return away;
}

// ───────────────────────────── груз ─────────────────────────────

/** Лоток с хлебом — единица погрузки в фургон, кг продукции. */
export const CRATE_KG = 12;

export interface CargoPlan {
  /** Всего лотков. */
  crates: number;
  kg: number;
  /** Лотки по заказам в порядке погрузки: заказ занимает индексы [first, first + crates). */
  orders: { orderId: string; first: number; crates: number; kg: number }[];
  /** Сколько кг сверх грузоподъёмности (0 — в норме). */
  overloadKg: number;
}

export function cargoPlan(orders: TripOrder[], capacityKg: number, crateKg = CRATE_KG): CargoPlan {
  let next = 0;
  const out = orders.map((o) => {
    const crates = o.kg > 0 ? Math.ceil(o.kg / crateKg - 1e-9) : 0;
    const r = { orderId: o.orderId, first: next, crates, kg: o.kg };
    next += crates;
    return r;
  });
  const kg = orders.reduce((a, o) => a + o.kg, 0);
  return { crates: next, kg, orders: out, overloadKg: Math.max(0, kg - capacityKg) };
}

/** Поддоны поставки: 20 мешков (упаковок) на поддон, как на стеллажах склада сырья. */
export function palletsFor(qtyKg: number, packKg = 25): number {
  return Math.max(1, Math.ceil(qtyKg / (packKg * 20) - 1e-9));
}

export interface Box3 {
  /** ширина (x), высота (y), длина (z), м */
  w: number;
  h: number;
  l: number;
}

/**
 * Места под груз в кузове: [x, y, z] центра каждого места в координатах кузова
 * (x от оси, y от пола, z — глубина от дверей). Порядок погрузки — от кабины к дверям, рядами снизу вверх.
 */
export function cargoSlots(inner: Box3, item: Box3, gap = 0.02): [number, number, number][] {
  const cols = Math.max(0, Math.floor((inner.w + gap) / (item.w + gap)));
  const layers = Math.max(0, Math.floor((inner.h + gap) / (item.h + gap)));
  const rows = Math.max(0, Math.floor((inner.l + gap) / (item.l + gap)));
  const out: [number, number, number][] = [];
  const x0 = -((cols - 1) * (item.w + gap)) / 2;
  for (let r = 0; r < rows; r++) {
    const z = inner.l - item.l / 2 - r * (item.l + gap);
    for (let k = 0; k < layers; k++) for (let c = 0; c < cols; c++) out.push([x0 + c * (item.w + gap), item.h / 2 + k * (item.h + gap), z]);
  }
  return out;
}

// ───────────────────────────── ходки ─────────────────────────────

/**
 * Ходка: от места назначения пустым к источнику, взять груз (по штуке), отвезти, выгрузить (по штуке).
 * Погрузка фургона: источник — склад готовой продукции, назначение — кузов, перевозит рабочий с рохлей.
 * Разгрузка поставщика: источник — кузов, назначение — склад сырья, перевозит погрузчик.
 * Ходки идут равномерно по окну, каждая — в начале своей доли окна; между ходками перевозчик ждёт у места
 * назначения (комплектует следующую часть заказа, оформляет приход).
 */
export interface HaulTiming {
  /** Сколько штук за ходку. */
  perRun: number;
  /** Путь в одну сторону, мс. */
  travelMs: number;
  /** Взять одну штуку, мс. */
  pickMs: number;
  /** Поставить одну штуку, мс. */
  dropMs: number;
}

export const TROLLEY_TIMING: HaulTiming = { perRun: 8, travelMs: 14_000, pickMs: 2_500, dropMs: 2_500 };
export const FORKLIFT_TIMING: HaulTiming = { perRun: 1, travelMs: 16_000, pickMs: 6_000, dropMs: 6_000 };

const runActiveMs = (h: HaulTiming, m: number) => 2 * h.travelMs + m * (h.pickMs + h.dropMs);

export interface HaulRun {
  /** Индексы штук: [first, first + count). */
  first: number;
  count: number;
  /** С departAt: к источнику, взять, к назначению, поставить — до end; потом ждёт у места назначения. */
  departAt: number;
  atSourceAt: number;
  leaveSourceAt: number;
  atDestAt: number;
  end: number;
}

export interface HaulPlan {
  runs: HaulRun[];
  /** Когда штука i снята с источника. */
  pickedAt: number[];
  /** Когда штука i поставлена на место назначения. */
  doneAt: number[];
}

/** Расписание ходок: n штук в окне [from, to). Если окно короткое, движения пропорционально ускоряются. */
export function haulPlan(n: number, from: number, to: number, h: HaulTiming): HaulPlan {
  const runs: HaulRun[] = [];
  const pickedAt: number[] = [];
  const doneAt: number[] = [];
  if (n <= 0 || to <= from) {
    for (let i = 0; i < n; i++) pickedAt.push(from), doneAt.push(from);
    return { runs, pickedAt, doneAt };
  }
  const count = Math.ceil(n / h.perRun);
  const slot = (to - from) / count;
  for (let j = 0; j < count; j++) {
    const first = j * h.perRun;
    const m = Math.min(h.perRun, n - first);
    const f = Math.min(1, slot / runActiveMs(h, m));
    const travel = h.travelMs * f;
    const departAt = from + j * slot;
    const end = departAt + runActiveMs(h, m) * f;
    const atSourceAt = departAt + travel;
    for (let k = 0; k < m; k++) pickedAt.push(atSourceAt + (k + 1) * h.pickMs * f);
    const leaveSourceAt = atSourceAt + m * h.pickMs * f;
    const atDestAt = leaveSourceAt + travel;
    for (let k = 0; k < m; k++) doneAt.push(atDestAt + (k + 1) * h.dropMs * f);
    runs.push({ first, count: m, departAt, atSourceAt, leaveSourceAt, atDestAt, end });
  }
  return { runs, pickedAt, doneAt };
}

/** Окно ходок у визита: работа при открытых дверях минус минута на оформление в начале и в конце. */
export function haulWindow(work: { from: number; to: number }): { from: number; to: number } {
  const pad = Math.min(MIN, (work.to - work.from) / 10);
  return { from: work.from + pad, to: work.to - pad };
}

export type CarrierLeg = 'idle' | 'toSource' | 'atSource' | 'toDest' | 'atDest';

export interface CarrierState {
  leg: CarrierLeg;
  /** Доля пройденного на участке пути (для toSource/toDest), 0…1. */
  t: number;
  /** Сколько штук сейчас везёт. */
  carrying: number;
}

/** Где перевозчик в момент now. idle — ждёт у места назначения. */
export function carrierState(plan: HaulPlan, now: number): CarrierState {
  for (const r of plan.runs) {
    if (now < r.departAt || now >= r.end) continue;
    const picked = plan.pickedAt.slice(r.first, r.first + r.count).filter((t) => t <= now).length;
    const dropped = plan.doneAt.slice(r.first, r.first + r.count).filter((t) => t <= now).length;
    if (now < r.atSourceAt) return { leg: 'toSource', t: (now - r.departAt) / (r.atSourceAt - r.departAt || 1), carrying: 0 };
    if (now < r.leaveSourceAt) return { leg: 'atSource', t: 0, carrying: picked };
    if (now < r.atDestAt) return { leg: 'toDest', t: (now - r.leaveSourceAt) / (r.atDestAt - r.leaveSourceAt || 1), carrying: r.count };
    return { leg: 'atDest', t: 0, carrying: r.count - dropped };
  }
  return { leg: 'idle', t: 0, carrying: 0 };
}

/** Сколько моментов из списка уже наступило. */
export const countDone = (times: number[], now: number) => times.reduce((a, t) => a + (t <= now ? 1 : 0), 0);

// ───────────────────────────── погрузка рейса целиком ─────────────────────────────

/**
 * Погрузка рейса: визит фургона, план груза и расписание ходок. Один источник правды для сцены
 * (лоток появляется в кузове) и склада (заказ списывается, когда погружен его последний лоток).
 */
export interface TripLoading {
  visit: DockVisit;
  cargo: CargoPlan;
  haul: HaulPlan;
  /** Момент погрузки последнего лотка каждого заказа (по cargo.orders). */
  orderLoadedAt: number[];
}

export function tripLoadings(trips: Trip[], vehicleId: string, capacityKg: number, timing: MoveTiming = VAN_TIMING, haul: HaulTiming = TROLLEY_TIMING): TripLoading[] {
  const byId = new Map(trips.map((t) => [t.id, t]));
  return vanVisits(trips, vehicleId, timing).flatMap((visit) => {
    const trip = visit.ref ? byId.get(visit.ref) : undefined;
    if (!trip) return [];
    const cargo = cargoPlan(trip.orders, capacityKg);
    const w = haulWindow(workWindow(visit, timing));
    const plan = haulPlan(cargo.crates, w.from, w.to, haul);
    const orderLoadedAt = cargo.orders.map((o) => (o.crates ? plan.doneAt[o.first + o.crates - 1]! : w.from));
    return [{ visit, cargo, haul: plan, orderLoadedAt }];
  });
}

// ───────────────────────────── разгрузка поставщика целиком ─────────────────────────────

export interface SupplierUnloading {
  visit: DockVisit;
  /** Поставки визита в порядке разгрузки: поддоны [first, first + pallets). */
  deliveries: { id: string; first: number; pallets: number }[];
  pallets: number;
  haul: HaulPlan;
  /** Когда на склад сырья поставлен последний поддон поставки — момент прихода. */
  receivedAt: Map<string, number>;
}

/** Разгрузка поставщика: визиты, поддоны по поставкам и ходки погрузчика (один источник правды для сцены и склада). */
export function supplierUnloadings(
  deliveries: { at: number; id: string; pallets: number }[],
  haul: HaulTiming = FORKLIFT_TIMING,
  timing: MoveTiming = SEMI_TIMING,
): SupplierUnloading[] {
  const byId = new Map(deliveries.map((d) => [d.id, d]));
  return supplierVisits(deliveries, haul, timing).map((visit) => {
    let next = 0;
    const list = (visit.ref ?? '').split(',').flatMap((id) => {
      const d = byId.get(id);
      if (!d) return [];
      const r = { id, first: next, pallets: d.pallets };
      next += d.pallets;
      return [r];
    });
    const w = haulWindow(workWindow(visit, timing));
    const plan = haulPlan(next, w.from, w.to, haul);
    const receivedAt = new Map(list.map((d) => [d.id, plan.doneAt[d.first + d.pallets - 1] ?? w.from]));
    return { visit, deliveries: list, pallets: next, haul: plan, receivedAt };
  });
}
