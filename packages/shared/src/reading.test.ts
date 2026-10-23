import { describe, expect, it } from 'vitest';
import { parseReading, parseTopic } from './reading';

const NOW = Date.UTC(2026, 9, 8, 6, 0, 0);

describe('parseTopic', () => {
  it('извлекает equipmentId из bakery/{id}/power', () => {
    expect(parseTopic('bakery/oven-1/power')).toBe('oven-1');
  });

  it('учитывает свой префикс', () => {
    expect(parseTopic('plant7/bakery/mixer-2/power', 'plant7/bakery')).toBe('mixer-2');
  });

  it('возвращает null для чужих топиков', () => {
    expect(parseTopic('bakery/oven-1/status')).toBeNull();
    expect(parseTopic('other/oven-1/power')).toBeNull();
    expect(parseTopic('bakery//power')).toBeNull();
    expect(parseTopic('bakery/a/b/power')).toBeNull();
    expect(parseTopic('bakery/../power')).toBeNull();
    expect(parseTopic('bakery/oven<script>/power')).toBeNull();
  });
});

describe('parseReading', () => {
  const topic = 'bakery/moulder-1/power';

  it('разбирает полное сообщение по контракту', () => {
    const payload = JSON.stringify({
      ts: '2026-10-08T05:59:55.000Z',
      meterId: 'ESP32_Dala_Meter_01',
      powerKw: 0.77,
      currentsA: [1.03, 2.25, 0.24],
      voltageV: [229.1, 231.4, 230.2],
      energyKwh: 1532.4,
      powerFactor: 0.91,
    });
    const r = parseReading(topic, payload, { nowMs: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reading).toEqual({
      equipmentId: 'moulder-1',
      ts: Date.UTC(2026, 9, 8, 5, 59, 55),
      meterId: 'ESP32_Dala_Meter_01',
      powerKw: 0.77,
      currentsA: [1.03, 2.25, 0.24],
      voltageV: [229.1, 231.4, 230.2],
      energyKwh: 1532.4,
      powerFactor: 0.91,
    });
  });

  it('разбирает климатические поля (температура, влажность, температура ядра)', () => {
    const payload = JSON.stringify({
      powerKw: 2.5,
      currentsA: [3.8, 3.7, 3.8],
      temperatureC: 37.2,
      targetTempC: 37,
      humidityPct: 81.5,
      targetHumidityPct: 80,
      coreTempC: -18.2,
    });
    const r = parseReading('bakery/proofer-1/power', payload, { nowMs: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reading.temperatureC).toBe(37.2);
    expect(r.reading.targetTempC).toBe(37);
    expect(r.reading.humidityPct).toBe(81.5);
    expect(r.reading.targetHumidityPct).toBe(80);
    expect(r.reading.coreTempC).toBe(-18.2);
  });

  it('принимает Buffer', () => {
    const r = parseReading(topic, Buffer.from('{"powerKw":1,"currentsA":[1,1,1]}'), { nowMs: NOW });
    expect(r.ok).toBe(true);
  });

  it('без ts берёт время получения', () => {
    const r = parseReading(topic, '{"powerKw":1,"currentsA":[4.9]}', { nowMs: NOW });
    expect(r.ok && r.reading.ts).toBe(NOW);
  });

  it('ts в секундах (типично для ESP32) переводит в мс', () => {
    const r = parseReading(topic, JSON.stringify({ ts: NOW / 1000, powerKw: 1, currentsA: [1] }), { nowMs: NOW });
    expect(r.ok && r.reading.ts).toBe(NOW);
  });

  it('ts в мс оставляет как есть', () => {
    const r = parseReading(topic, JSON.stringify({ ts: NOW - 5000, powerKw: 1, currentsA: [1] }), { nowMs: NOW });
    expect(r.ok && r.reading.ts).toBe(NOW - 5000);
  });

  it('принимает powerW вместо powerKw', () => {
    const r = parseReading(topic, '{"powerW":770,"currentsA":[1,2,0.5]}', { nowMs: NOW });
    expect(r.ok && r.reading.powerKw).toBeCloseTo(0.77);
  });

  it('отклоняет невалидный JSON', () => {
    const r = parseReading(topic, '{oops', { nowMs: NOW });
    expect(r).toEqual({ ok: false, error: 'invalid_json' });
  });

  it('отклоняет чужой топик', () => {
    const r = parseReading('bakery/x/status', '{"powerKw":1,"currentsA":[1]}', { nowMs: NOW });
    expect(r).toEqual({ ok: false, error: 'bad_topic' });
  });

  it('отклоняет отсутствующую или отрицательную мощность', () => {
    expect(parseReading(topic, '{"currentsA":[1]}', { nowMs: NOW })).toEqual({ ok: false, error: 'bad_power' });
    expect(parseReading(topic, '{"powerKw":-1,"currentsA":[1]}', { nowMs: NOW })).toEqual({ ok: false, error: 'bad_power' });
    expect(parseReading(topic, '{"powerKw":"1","currentsA":[1]}', { nowMs: NOW })).toEqual({ ok: false, error: 'bad_power' });
  });

  it('отклоняет токи не из 1 или 3 неотрицательных чисел', () => {
    expect(parseReading(topic, '{"powerKw":1}', { nowMs: NOW })).toEqual({ ok: false, error: 'bad_currents' });
    expect(parseReading(topic, '{"powerKw":1,"currentsA":[1,2]}', { nowMs: NOW })).toEqual({ ok: false, error: 'bad_currents' });
    expect(parseReading(topic, '{"powerKw":1,"currentsA":[1,-2,3]}', { nowMs: NOW })).toEqual({ ok: false, error: 'bad_currents' });
    expect(parseReading(topic, '{"powerKw":1,"currentsA":[1,null,3]}', { nowMs: NOW })).toEqual({ ok: false, error: 'bad_currents' });
  });

  it('отклоняет время из будущего (> 5 мин) и мусорный ts', () => {
    const future = JSON.stringify({ ts: NOW + 10 * 60_000, powerKw: 1, currentsA: [1] });
    expect(parseReading(topic, future, { nowMs: NOW })).toEqual({ ok: false, error: 'bad_ts' });
    const garbage = JSON.stringify({ ts: 'вчера', powerKw: 1, currentsA: [1] });
    expect(parseReading(topic, garbage, { nowMs: NOW })).toEqual({ ok: false, error: 'bad_ts' });
  });

  it('игнорирует некорректные необязательные поля, не роняя сообщение', () => {
    const r = parseReading(topic, '{"powerKw":1,"currentsA":[1],"voltageV":"230","energyKwh":"x","meterId":5}', { nowMs: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reading.voltageV).toBeUndefined();
    expect(r.reading.energyKwh).toBeUndefined();
    expect(r.reading.meterId).toBeUndefined();
  });

  it('пропускает поле order (заказ)', () => {
    const r = parseReading(topic, '{"powerKw":1,"currentsA":[1],"order":"Батон нарезной ×120"}', { nowMs: NOW });
    expect(r.ok && r.reading.order).toBe('Батон нарезной ×120');
  });

  it('отклоняет физически невозможные выбросы мощности и токов', () => {
    expect(parseReading(topic, '{"powerKw":100000,"currentsA":[1]}', { nowMs: NOW })).toEqual({ ok: false, error: 'bad_power' });
    expect(parseReading(topic, '{"powerKw":1,"currentsA":[60000]}', { nowMs: NOW })).toEqual({ ok: false, error: 'bad_currents' });
  });

  it('санирует и ограничивает длину meterId и order, удаляя управляющие символы', () => {
    const r = parseReading(topic, JSON.stringify({
      powerKw: 1,
      currentsA: [1],
      meterId: 'ESP32\x00_Meter\x1F_01' + 'A'.repeat(100),
      order: 'Партия\x07 №1' + 'B'.repeat(200),
    }), { nowMs: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reading.meterId).toBe(('ESP32_Meter_01' + 'A'.repeat(100)).slice(0, 64));
    expect(r.reading.order).toBe(('Партия №1' + 'B'.repeat(200)).slice(0, 120));
  });
});
