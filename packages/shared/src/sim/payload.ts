import type { Reading } from '../types';

/** JSON-сообщение по контракту docs/mqtt-contract.md (так же будет слать ESP32). */
export function toPayload(r: Reading): string {
  return JSON.stringify({
    ts: new Date(r.ts).toISOString(),
    meterId: r.meterId,
    powerKw: r.powerKw,
    currentsA: r.currentsA,
    voltageV: r.voltageV,
    powerFactor: r.powerFactor,
    energyKwh: r.energyKwh,
    ...(r.order ? { order: r.order } : {}),
  });
}

export function topicFor(prefix: string, equipmentId: string): string {
  return `${prefix}/${equipmentId}/power`;
}
