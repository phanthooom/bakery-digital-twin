import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateSiteConfig } from '@bakery/shared';
import rawConfig from '../../../config/equipment.json';
import { MockDataSource } from './MockDataSource';

const config = validateSiteConfig(rawConfig).config!;
// 2026-10-08 10:00 по Ташкенту — рабочая смена
const NOW = Date.UTC(2026, 9, 8, 5, 0, 0);

function createSource() {
  return new MockDataSource(config, { warmupDays: 0.2, faultsPerHour: 0 });
}

describe('MockDataSource (то, что видит фронт)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('после start() у каждого станка есть свежее показание и график за 6 ч', () => {
    const ds = createSource();
    ds.start();
    for (const eq of config.equipment) {
      const s = ds.getStates().get(eq.id)!;
      expect(s.status).not.toBe('offline');
      expect(NOW - s.lastReading!.ts).toBeLessThan(5000);
      const h = ds.getHistory(eq.id, 6, 3 * 60_000);
      expect(h.points.length).toBeGreaterThanOrEqual(118);
      expect(h.points[0]!.t).toBeLessThanOrEqual(NOW - 5.9 * 3_600_000);
    }
    ds.stop();
  });

  it('каждые 5 с приходят новые показания, после stop() — тишина', () => {
    const ds = createSource();
    ds.start();
    const seen: number[] = [];
    ds.subscribe(() => seen.push(ds.getStates().get('oven-1')!.lastReading!.ts));
    vi.advanceTimersByTime(15_000);
    expect(new Set(seen).size).toBe(3);
    ds.stop();
    const before = seen.length;
    vi.advanceTimersByTime(30_000);
    expect(seen.length).toBe(before);
  });

  it('демо-событие «перегрузка» сразу переводит станок в аварию с причиной «перегрузка»', () => {
    const ds = createSource();
    ds.start();
    ds.simulate('moulder-1', 'overload');
    const s = ds.getStates().get('moulder-1')!;
    expect(s.status).toBe('alarm');
    expect(s.reasons).toContain('overload');
    expect(s.pctOfNominal!).toBeGreaterThan(115);
    ds.stop();
  });

  it('демо-событие «потеря связи»: через 30 с без показаний станок «Нет связи», потом связь возвращается', () => {
    const ds = createSource();
    ds.start();
    ds.simulate('oven-2', 'comm_loss');
    vi.advanceTimersByTime(31_000);
    expect(ds.getStates().get('oven-2')!.status).toBe('offline');
    vi.advanceTimersByTime(30_000);
    expect(ds.getStates().get('oven-2')!.status).not.toBe('offline');
    ds.stop();
  });

  it('журнал энергии: кВт·ч по часам за прошлые сутки и за текущий час растёт с показаниями', async () => {
    const ds = new MockDataSource(config, { warmupDays: 0.2, energyDays: 2, faultsPerHour: 0 });
    ds.start();
    const HOUR = 3_600_000;
    const entries = await ds.getEnergy!(NOW - 2 * 24 * HOUR, NOW + HOUR);
    // морозильная камера работает круглосуточно — у неё есть запись за каждый час двух суток
    const cold = entries.filter((e) => e.equipmentId === 'coldroom-1');
    expect(cold.length).toBeGreaterThanOrEqual(47);
    const perHour = cold.map((e) => e.kwh);
    expect(Math.max(...perHour)).toBeLessThanOrEqual(3 * 1.2); // не больше номинала × 1 ч с запасом
    const hourNow = Math.floor(NOW / HOUR) * HOUR;
    const before = (await ds.getEnergy!(hourNow, hourNow + HOUR)).reduce((s, e) => s + e.kwh, 0);
    vi.advanceTimersByTime(10 * 60_000);
    const after = (await ds.getEnergy!(hourNow, hourNow + HOUR)).reduce((s, e) => s + e.kwh, 0);
    expect(after).toBeGreaterThan(before);
    ds.stop();
  });

  it('цепочка: сырьё на складе, выпуск списал сырьё, сегодня есть рейсы, дрожжи заканчиваются', () => {
    const ds = createSource();
    const snap = ds.getSupply!(NOW)!;
    const inv = snap.inventory;
    expect(inv.stock('flour')).toBeGreaterThan(0);
    expect(snap.production.length).toBeGreaterThan(50);
    // каждая партия продукции знает свои партии сырья
    const lot = inv.lot(snap.production.at(-1)!.lotId)!;
    expect(inv.trace(lot.id).inputs.length).toBeGreaterThan(0);
    const today = snap.trips.filter((t) => t.departAt > NOW - 12 * 3_600_000 && t.departAt < NOW + 12 * 3_600_000);
    expect(today.length).toBeGreaterThanOrEqual(3);
    expect(inv.daysOfCover('yeast', NOW)!).toBeLessThan(3);
    // снимок воспроизводим
    expect(ds.getSupply!(NOW)!.inventory.stock('flour')).toBe(inv.stock('flour'));
  });

  it('газ: днём печи горят — расход есть, тревог нет; демо «утечка в цехе» — сигнализатор поднимает аварию за пару минут', () => {
    const ds = createSource();
    ds.start();
    const g = ds.getGas!()!;
    expect(g.level).toBe('ok');
    expect(g.lastReading!.flowM3h).toBeGreaterThan(0);
    expect(ds.getGasHistory!(6, 3 * 60_000).length).toBeGreaterThanOrEqual(118);

    ds.simulateGas!('leak_inside');
    vi.advanceTimersByTime(3 * 60_000);
    const leak = ds.getGas()!;
    expect(leak.level).toBe('critical');
    expect(leak.alerts.map((a) => a.kind)).toContain('detector');
    expect(leak.lastReading!.ch4Lel!).toBeGreaterThanOrEqual(20);
    ds.stop();
  });

  it('заказ из Telegram: станки (печь/тестомес) получают номер заказа, фургон встает на погрузку', () => {
    const ds = createSource();
    ds.start();
    const received: unknown[] = [];
    ds.onTelegramOrder!((order) => received.push(order));

    ds.dispatchTelegramOrder!({
      orderId: 'TG-777',
      clientName: 'Кафе Чинор',
      total: 90000,
      items: [{ name: 'Круассан классический', quantity: 5, price: 15000 }],
      createdAt: NOW,
    });

    expect(received).toHaveLength(1);
    const oven = ds.getStates().get('oven-1')!;
    expect(oven.lastReading?.order).toContain('TG-777');
    expect(oven.lastReading?.order).toContain('Круассан классический');

    const snap = ds.getSupply!(NOW)!;
    const vanTrip = snap.trips.find((t) => t.id === 'Р-TG-777');
    expect(vanTrip).toBeDefined();
    expect(vanTrip?.vehicleId).toBe('van-1');

    ds.stop();
  });
});
