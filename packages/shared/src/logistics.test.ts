import { describe, expect, it } from 'vitest';
import { tripStatus, vehicleState, type Trip } from './logistics';

const M = 60_000;
const T = Date.UTC(2026, 9, 8, 4, 0, 0);
const trip = (id: string, vehicleId: string, departAt: number, returnAt: number): Trip => ({ id, vehicleId, departAt, returnAt, loadMinutes: 40, orders: [] });

describe('рейс и машина', () => {
  it('статус рейса по времени: запланирован → погрузка → в пути → вернулся', () => {
    const t = trip('r1', 'van-1', T, T + 180 * M);
    expect(tripStatus(t, T - 60 * M)).toBe('planned');
    expect(tripStatus(t, T - 10 * M)).toBe('loading');
    expect(tripStatus(t, T + 60 * M)).toBe('en_route');
    expect(tripStatus(t, T + 181 * M)).toBe('returned');
  });

  it('машина: у рампы, на погрузке или в рейсе; знает текущий и следующий рейс', () => {
    const trips = [trip('r1', 'van-1', T, T + 180 * M), trip('r2', 'van-1', T + 300 * M, T + 420 * M), trip('x', 'van-2', T, T + 60 * M)];
    expect(vehicleState('van-1', trips, T + 30 * M)).toMatchObject({ status: 'en_route', trip: { id: 'r1' }, next: { id: 'r2' } });
    expect(vehicleState('van-1', trips, T + 200 * M)).toMatchObject({ status: 'at_dock', trip: null, next: { id: 'r2' } });
    expect(vehicleState('van-1', trips, T + 280 * M)).toMatchObject({ status: 'loading', trip: { id: 'r2' } });
    expect(vehicleState('van-1', trips, T + 500 * M)).toMatchObject({ status: 'at_dock', trip: null, next: null });
  });
});
