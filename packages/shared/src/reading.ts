import type { Reading } from './types';

export type ParseError = 'bad_topic' | 'invalid_json' | 'not_object' | 'bad_power' | 'bad_currents' | 'bad_ts';
export type ParseResult = { ok: true; reading: Reading } | { ok: false; error: ParseError };

export interface ParseOptions {
  /** Время получения сообщения (подставляется, если в нём нет ts). */
  nowMs?: number;
  topicPrefix?: string;
  /** Насколько ts может опережать часы сервера (рассинхрон ESP32). */
  maxFutureSkewMs?: number;
}

const DEFAULT_PREFIX = 'bakery';
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export const MAX_POWER_KW = 10_000;
export const MAX_CURRENT_A = 50_000;
export const MAX_VOLTAGE_V = 1_000;
export const MAX_ENERGY_KWH = 1e9;

/** `bakery/{equipmentId}/power` → equipmentId, иначе null. */
export function parseTopic(topic: string, prefix: string = DEFAULT_PREFIX): string | null {
  const head = `${prefix}/`;
  if (!topic.startsWith(head) || !topic.endsWith('/power')) return null;
  const id = topic.slice(head.length, -'/power'.length);
  if (!ID_RE.test(id)) return null;
  return id;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNonNegNum = (v: unknown, max = Number.POSITIVE_INFINITY): v is number => isNum(v) && v >= 0 && v <= max;

function numArray(v: unknown, lengths: number[], max = Number.POSITIVE_INFINITY): number[] | undefined {
  if (!Array.isArray(v) || !lengths.includes(v.length)) return undefined;
  return v.every((n) => isNonNegNum(n, max)) ? (v as number[]) : undefined;
}

function sanitizeStr(raw: unknown, maxLen: number): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const clean = raw.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLen);
  return clean || undefined;
}

function parseTs(raw: unknown, nowMs: number): number | null {
  if (raw === undefined || raw === null) return nowMs;
  if (isNum(raw)) {
    // < 1e12 — это секунды (ESP32 обычно шлёт unix time в секундах)
    return raw < 1e12 ? Math.round(raw * 1000) : Math.round(raw);
  }
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/**
 * Разбирает и валидирует MQTT-сообщение счётчика. Контракт: docs/mqtt-contract.md.
 * Обязательные поля: powerKw (или powerW) и currentsA (1 или 3 значения).
 */
export function parseReading(topic: string, payload: string | Uint8Array, opts: ParseOptions = {}): ParseResult {
  const nowMs = opts.nowMs ?? Date.now();
  const equipmentId = parseTopic(topic, opts.topicPrefix ?? DEFAULT_PREFIX);
  if (!equipmentId) return { ok: false, error: 'bad_topic' };

  let data: unknown;
  try {
    const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, error: 'not_object' };
  const d = data as Record<string, unknown>;

  let powerKw: number;
  if (d.powerKw !== undefined) {
    if (!isNonNegNum(d.powerKw, MAX_POWER_KW)) return { ok: false, error: 'bad_power' };
    powerKw = d.powerKw;
  } else if (d.powerW !== undefined) {
    if (!isNonNegNum(d.powerW, MAX_POWER_KW * 1000)) return { ok: false, error: 'bad_power' };
    powerKw = d.powerW / 1000;
  } else {
    return { ok: false, error: 'bad_power' };
  }

  const currentsA = numArray(d.currentsA, [1, 3], MAX_CURRENT_A);
  if (!currentsA) return { ok: false, error: 'bad_currents' };

  const ts = parseTs(d.ts, nowMs);
  const maxSkew = opts.maxFutureSkewMs ?? 5 * 60_000;
  if (ts === null || ts > nowMs + maxSkew || ts < Date.UTC(2020, 0, 1)) return { ok: false, error: 'bad_ts' };

  const reading: Reading = { equipmentId, ts, powerKw, currentsA };
  const meterId = sanitizeStr(d.meterId, 64);
  if (meterId) reading.meterId = meterId;
  const voltageV = numArray(d.voltageV, [1, 3], MAX_VOLTAGE_V);
  if (voltageV) reading.voltageV = voltageV;
  if (isNonNegNum(d.energyKwh, MAX_ENERGY_KWH)) reading.energyKwh = d.energyKwh;
  if (isNum(d.powerFactor) && d.powerFactor >= 0 && d.powerFactor <= 1) reading.powerFactor = d.powerFactor;
  const order = sanitizeStr(d.order, 120);
  if (order) reading.order = order;
  return { ok: true, reading };
}
