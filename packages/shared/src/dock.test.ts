import { describe, expect, it } from 'vitest';
import type { Trip } from './logistics';
import {
  VAN_TIMING,
  SEMI_TIMING,
  TROLLEY_TIMING,
  FORKLIFT_TIMING,
  arrivalPath,
  departurePath,
  pathLength,
  poseAlong,
  vanVisits,
  supplierVisits,
  supplierUnloadings,
  dockState,
  cargoPlan,
  cargoSlots,
  palletsFor,
  haulPlan,
  carrierState,
  countDone,
  tripLoadings,
  workWindow,
  type YardLane,
  type DockState,
} from './dock';

const S = 1000;
const M = 60 * S;
const T = Date.UTC(2026, 9, 27, 3, 0, 0);
const trip = (id: string, departAt: number, returnAt: number, loadMinutes = 40, kg: number[] = [30, 45]): Trip => ({
  id,
  vehicleId: 'van-1',
  departAt,
  returnAt,
  loadMinutes,
  orders: kg.map((k, i) => ({ orderId: `${id}-з${i + 1}`, client: 'Кафе', kg: k })),
});

/** Фургон у рампы 20,3 (передний край цеха z = 17,5), приезжает справа. */
const VAN_LANE: YardLane = { dockX: 20.3, parkedZ: 18, side: 1, laneZ: 27, exitLaneZ: 30, radius: 6, farX: 48 };
/** Тягач поставщика у рампы −21, приезжает слева. */
const SEMI_LANE: YardLane = { dockX: -21, parkedZ: 18, side: -1, laneZ: 29, exitLaneZ: 32.5, radius: 9, farX: -60 };

const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Пробежать время с шагом step и проверить, что машина нигде не прыгает и не дёргается. */
function expectSmooth(states: (now: number) => DockState, from: number, to: number, step = 100) {
  let prev = states(from);
  let prevSpeed = NaN; // скорость в начале окна неизвестна — ускорение считаем со второго шага
  for (let t = from + step; t <= to; t += step) {
    const s = states(t);
    const speed = Math.hypot(s.x - prev.x, s.z - prev.z) / (step / S);
    if (s.phase !== 'away' && prev.phase !== 'away') {
      // трогается и тормозит плавно: ускорение не больше 1,5 м/с²
      if (!Number.isNaN(prevSpeed)) expect(Math.abs(speed - prevSpeed) / (step / S), `рывок скорости в ${(t - from) / S} с (${prev.phase} → ${s.phase})`).toBeLessThan(1.5);
      // не быстрее 3 м/с, 0,7 рад/с и полного открытия дверей быстрее чем за 1,2 с
      expect(Math.hypot(s.x - prev.x, s.z - prev.z), `скачок в ${(t - from) / S} с (${prev.phase} → ${s.phase})`).toBeLessThan((3 * step) / S);
      expect(angleDiff(s.heading, prev.heading), `рывок курса в ${(t - from) / S} с (${prev.phase} → ${s.phase})`).toBeLessThan((0.7 * step) / S);
      expect(Math.abs(s.door - prev.door), 'двери не хлопают').toBeLessThan(step / (1.2 * S));
    }
    prevSpeed = s.phase === 'away' || prev.phase === 'away' ? 0 : speed;
    prev = s;
  }
}

describe('маршрут во дворе', () => {
  for (const [name, lane] of [['фургон справа', VAN_LANE], ['тягач слева', SEMI_LANE]] as const) {
    it(`${name}: въезд кончается у рампы кабиной во двор, выезд с неё начинается; путь без разрывов`, () => {
      const arr = arrivalPath(lane);
      const dep = departurePath(lane);
      // участки стыкуются
      expect(arr[0]!.points.at(-1)).toEqual(arr[1]!.points[0]);
      const end = poseAlong(arr, pathLength(arr));
      expect(end.x).toBeCloseTo(lane.dockX, 6);
      expect(end.z).toBeCloseTo(lane.parkedZ, 6);
      expect(end.reverse).toBe(true);
      expect(angleDiff(end.heading, 0)).toBeLessThan(1e-6); // кабина смотрит во двор (+z)
      const start = poseAlong(dep, 0);
      expect(start.x).toBeCloseTo(lane.dockX, 6);
      expect(start.z).toBeCloseTo(lane.parkedZ, 6);
      expect(angleDiff(start.heading, 0)).toBeLessThan(1e-6);
      // по полосе въезда едем кабиной от стороны въезда, на заднем ходу кабина остаётся там же
      expect(angleDiff(poseAlong(arr, 1).heading, lane.side > 0 ? -Math.PI / 2 : Math.PI / 2)).toBeLessThan(1e-6);
      const turnStart = poseAlong(arr, pathLength([arr[0]!]) + 0.01);
      expect(turnStart.reverse).toBe(true);
      expect(angleDiff(turnStart.heading, lane.side > 0 ? -Math.PI / 2 : Math.PI / 2)).toBeLessThan(0.05);
      // выезд уходит за край двора в сторону side
      expect(Math.sign(poseAlong(dep, pathLength(dep)).x - lane.dockX)).toBe(lane.side);
    });
  }

  it('на въезде машина не задевает соседние рампы: полоса въезда дальше носа стоящих фургонов', () => {
    const arr = arrivalPath(VAN_LANE);
    const vanLength = 6.6;
    const halfWidth = 1.05;
    for (const p of arr[0]!.points) expect(p[1] - halfWidth).toBeGreaterThan(VAN_LANE.parkedZ + vanLength);
  });
});

describe('визиты фургона к рампе', () => {
  it('по рейсам: стоит → открывает двери → погрузка → закрывает → выезд → в рейсе → въезд → задний ход → стоит', () => {
    const trips = [trip('r1', T, T + 3 * 60 * M), trip('r2', T + 5 * 60 * M, T + 8 * 60 * M)];
    const visits = vanVisits(trips, 'van-1');
    const at = (t: number) => dockState(visits, VAN_LANE, t, VAN_TIMING);
    expect(at(T - 60 * M).phase).toBe('parked');
    expect(at(T - 40 * M + 1 * S).phase).toBe('doorsOpening');
    expect(at(T - 20 * M).phase).toBe('working');
    expect(at(T - 20 * M).door).toBe(1);
    expect(at(T - 1 * S).phase).toBe('doorsClosing');
    expect(at(T + 5 * S).phase).toBe('departing');
    expect(at(T + 60 * M).phase).toBe('away');
    expect(at(T + 3 * 60 * M - 20 * S).phase).toBe('arriving');
    expect(at(T + 3 * 60 * M - 5 * S).phase).toBe('reversing');
    expect(at(T + 3 * 60 * M - 5 * S).reverse).toBe(true);
    expect(at(T + 3 * 60 * M + 1 * S)).toMatchObject({ phase: 'parked', x: VAN_LANE.dockX, z: VAN_LANE.parkedZ, door: 0 });
    // после последнего рейса фургон остаётся у рампы
    expect(at(T + 9 * 60 * M).phase).toBe('parked');
  });

  it('движение плавное: нет скачков положения, курса и дверей на всех переходах', () => {
    const trips = [trip('r1', T, T + 2 * 60 * M)];
    const visits = vanVisits(trips, 'van-1');
    const at = (t: number) => dockState(visits, VAN_LANE, t, VAN_TIMING);
    expectSmooth(at, T - 41 * M, T - 38 * M);
    expectSmooth(at, T - 1 * M, T + 1 * M);
    expectSmooth(at, T + 2 * 60 * M - 1 * M, T + 2 * 60 * M + 30 * S);
  });

  it('срочный рейс, пока фургон в рейсе: визиты не пересекаются, фургон возвращается заранее, а не телепортируется', () => {
    const urgent: Trip = { ...trip('tg', T + 30 * M, T + 35 * M, 1, [8]) };
    const trips = [trip('r1', T, T + 3 * 60 * M), urgent];
    const visits = vanVisits(trips, 'van-1');
    for (let i = 1; i < visits.length; i++) {
      const prevEnd = visits[i - 1]!.leaveAt! + VAN_TIMING.departMs;
      const start = visits[i]!.arriveAt! - VAN_TIMING.forwardMs - VAN_TIMING.reverseMs;
      expect(start).toBeGreaterThanOrEqual(prevEnd);
      expect(visits[i]!.workFrom).toBeGreaterThanOrEqual(visits[i]!.arriveAt!);
      expect(visits[i]!.workTo).toBeGreaterThanOrEqual(visits[i]!.workFrom);
    }
    const at = (t: number) => dockState(visits, VAN_LANE, t, VAN_TIMING);
    expectSmooth(at, T + 28 * M, T + 37 * M, 200);
  });

  it('срочный рейс сразу после выезда: фургон успевает уехать и вернуться, окно погрузки сжимается', () => {
    const trips = [trip('r1', T, T + 3 * 60 * M), { ...trip('tg', T + 1 * M, T + 6 * M, 1, [8]) }];
    const visits = vanVisits(trips, 'van-1');
    const urgent = visits[1]!;
    expect(urgent.arriveAt! - VAN_TIMING.forwardMs - VAN_TIMING.reverseMs).toBeGreaterThan(T + VAN_TIMING.departMs);
    expect(dockState(visits, VAN_LANE, T + VAN_TIMING.departMs + 1, VAN_TIMING).phase).toBe('away');
    expect(urgent.workFrom).toBeGreaterThanOrEqual(urgent.arriveAt!);
    const at = (t: number) => dockState(visits, VAN_LANE, t, VAN_TIMING);
    expectSmooth(at, T - 10 * S, T + 3 * M, 100);
  });

  it('очень короткое окно: двери открываются и закрываются не дольше четверти окна', () => {
    const v = { id: 'v', ref: null, arriveAt: T, workFrom: T, workTo: T + 8 * S, leaveAt: T + 8 * S };
    const w = workWindow(v, VAN_TIMING);
    expect(w.doors).toBe(2 * S);
    expect(w.to - w.from).toBe(4 * S);
    expectSmooth((t) => dockState([v], VAN_LANE, t, VAN_TIMING), T - S, T + 10 * S, 50);
  });

  it('короткая погрузка (1 мин): двери не дольше четверти окна, фазы идут по порядку', () => {
    const v = vanVisits([trip('tg', T, T + 5 * M, 1, [8])], 'van-1');
    const w = workWindow(v[0]!, VAN_TIMING);
    expect(w.doors).toBeLessThanOrEqual(15 * S);
    expect(w.from).toBeLessThan(w.to);
    const order = ['parked', 'doorsOpening', 'working', 'doorsClosing', 'departing'];
    let k = 0;
    for (let t = T - 2 * M; t < T + 10 * S; t += 500) {
      const p = dockState(v, VAN_LANE, t, VAN_TIMING).phase;
      const idx = order.indexOf(p);
      expect(idx).toBeGreaterThanOrEqual(k);
      k = idx;
    }
    expect(k).toBe(order.length - 1);
  });
});

describe('поставщик у рампы приёмки', () => {
  it('приезжает к окну поставки, разгружается по поддонам и уезжает; поставки в один час — один визит', () => {
    const at8 = T + 5 * 60 * M;
    const visits = supplierVisits([
      { id: 'butter', at: at8, pallets: 1 },
      { id: 'yeast', at: at8, pallets: 1 },
      { id: 'flour', at: at8 + 24 * 60 * M, pallets: 2 },
    ]);
    expect(visits).toHaveLength(2);
    expect(visits[0]!.ref).toBe('butter,yeast');
    expect(visits[0]!.arriveAt).toBe(at8 - 15 * M);
    expect(visits[0]!.leaveAt!).toBeGreaterThan(visits[0]!.workTo);
    const at = (t: number) => dockState(visits, SEMI_LANE, t, SEMI_TIMING);
    expect(at(at8 - 15 * M - 30 * S).phase).toBe('arriving');
    expect(at(at8 - 15 * M - 10 * S).phase).toBe('reversing');
    expect(at(at8).phase).toBe('working');
    expect(at(visits[0]!.leaveAt! + 10 * S).phase).toBe('departing');
    expect(at(at8 + 3 * 60 * M).phase).toBe('away');
    expectSmooth(at, at8 - 16 * M, at8 - 14 * M);
    expectSmooth(at, visits[0]!.workTo - 30 * S, visits[0]!.leaveAt! + 40 * S);
  });

  it('разгрузка: все поддоны каждой поставки на складе до выезда машины, приход — по последнему поддону', () => {
    const at8 = T + 5 * 60 * M;
    const list = supplierUnloadings([
      { id: 'butter', at: at8, pallets: 1 },
      { id: 'flour', at: at8, pallets: 2 },
    ]);
    expect(list).toHaveLength(1);
    const u = list[0]!;
    expect(u.pallets).toBe(3);
    expect(u.deliveries.map((d) => [d.id, d.first, d.pallets])).toEqual([['butter', 0, 1], ['flour', 1, 2]]);
    const w = workWindow(u.visit, SEMI_TIMING);
    expect(countDone(u.haul.doneAt, w.to)).toBe(3);
    expect(u.receivedAt.get('butter')).toBe(u.haul.doneAt[0]);
    expect(u.receivedAt.get('flour')).toBe(u.haul.doneAt[2]);
    for (const t of u.receivedAt.values()) {
      expect(t).toBeGreaterThan(w.from);
      expect(t).toBeLessThan(u.visit.leaveAt!);
    }
  });

  it('поддоны: 20 упаковок на поддон, минимум один', () => {
    expect(palletsFor(1600, 50)).toBe(2);
    expect(palletsFor(1000, 50)).toBe(1);
    expect(palletsFor(55, 1)).toBe(3);
    expect(palletsFor(0)).toBe(1);
  });
});

describe('груз', () => {
  it('лотки по заказам (по 12 кг, с округлением вверх) и перегруз сверх грузоподъёмности', () => {
    const p = cargoPlan(
      [
        { orderId: 'a', client: 'x', kg: 30 },
        { orderId: 'b', client: 'y', kg: 12 },
        { orderId: 'c', client: 'z', kg: 0 },
      ],
      40,
    );
    expect(p.orders.map((o) => [o.first, o.crates])).toEqual([[0, 3], [3, 1], [4, 0]]);
    expect(p.crates).toBe(4);
    expect(p.kg).toBe(42);
    expect(p.overloadKg).toBe(2);
  });

  it('места в кузове: все внутри, без наложений, от кабины к дверям', () => {
    const inner = { w: 1.96, h: 1.96, l: 3.36 };
    const crate = { w: 0.6, h: 0.26, l: 0.4 };
    const slots = cargoSlots(inner, crate);
    expect(slots.length).toBe(3 * 7 * 8);
    for (const [x, y, z] of slots) {
      expect(Math.abs(x) + crate.w / 2).toBeLessThanOrEqual(inner.w / 2 + 1e-9);
      expect(y - crate.h / 2).toBeGreaterThanOrEqual(-1e-9);
      expect(y + crate.h / 2).toBeLessThanOrEqual(inner.h + 1e-9);
      expect(z - crate.l / 2).toBeGreaterThanOrEqual(-1e-9);
      expect(z + crate.l / 2).toBeLessThanOrEqual(inner.l + 1e-9);
    }
    for (let i = 1; i < slots.length; i++) expect(slots[i]![2]).toBeLessThanOrEqual(slots[i - 1]![2]);
    const keys = new Set(slots.map((s) => s.map((v) => v.toFixed(3)).join()));
    expect(keys.size).toBe(slots.length);
  });
});

describe('ходки', () => {
  it('лотки ставятся в кузов по одному, только после того как их взяли со склада, и все к концу окна', () => {
    const from = T;
    const to = T + 38 * M;
    const plan = haulPlan(45, from, to, TROLLEY_TIMING);
    expect(plan.runs).toHaveLength(6);
    expect(plan.doneAt).toHaveLength(45);
    for (let i = 0; i < 45; i++) {
      expect(plan.pickedAt[i]!).toBeLessThan(plan.doneAt[i]!);
      expect(plan.doneAt[i]!).toBeGreaterThan(from);
      expect(plan.doneAt[i]!).toBeLessThanOrEqual(to + 1);
      if (i) expect(plan.doneAt[i]!).toBeGreaterThanOrEqual(plan.doneAt[i - 1]!);
    }
    let prev = 0;
    for (let t = from; t <= to; t += 5 * S) {
      const n = countDone(plan.doneAt, t);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
      const c = carrierState(plan, t);
      expect(c.carrying).toBeGreaterThanOrEqual(0);
      expect(c.carrying).toBeLessThanOrEqual(TROLLEY_TIMING.perRun);
      // на складе взято = в кузове + на рохле
      expect(countDone(plan.pickedAt, t)).toBe(n + c.carrying);
    }
    expect(countDone(plan.doneAt, to)).toBe(45);
  });

  it('короткое окно: ходки ускоряются, но укладываются в окно', () => {
    const plan = haulPlan(3, T, T + 40 * S, FORKLIFT_TIMING);
    expect(plan.runs).toHaveLength(3);
    expect(Math.max(...plan.doneAt)).toBeLessThanOrEqual(T + 40 * S + 1);
    expect(carrierState(plan, T + 1).leg).not.toBe('idle');
  });

  it('пустой рейс — ходок нет, перевозчик ждёт', () => {
    const plan = haulPlan(0, T, T + 10 * M, TROLLEY_TIMING);
    expect(plan.runs).toHaveLength(0);
    expect(carrierState(plan, T + M).leg).toBe('idle');
  });
});

describe('погрузка рейса — один источник правды для сцены и склада', () => {
  it('каждый заказ погружен до закрытия дверей и после их открытия, по порядку заказов', () => {
    const trips = [trip('r1', T, T + 3 * 60 * M, 40, [30, 45, 20]), trip('r2', T + 5 * 60 * M, T + 8 * 60 * M, 40, [90])];
    const loadings = tripLoadings(trips, 'van-1', 800);
    expect(loadings).toHaveLength(2);
    const [l1] = loadings;
    expect(l1!.cargo.crates).toBe(3 + 4 + 2);
    const w = workWindow(l1!.visit, VAN_TIMING);
    for (let i = 0; i < l1!.orderLoadedAt.length; i++) {
      expect(l1!.orderLoadedAt[i]!).toBeGreaterThan(w.from);
      expect(l1!.orderLoadedAt[i]!).toBeLessThan(w.to);
      if (i) expect(l1!.orderLoadedAt[i]!).toBeGreaterThanOrEqual(l1!.orderLoadedAt[i - 1]!);
    }
    expect(countDone(l1!.haul.doneAt, w.to)).toBe(l1!.cargo.crates);
  });
});
