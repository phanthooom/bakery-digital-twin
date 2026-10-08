/**
 * Симулятор счётчиков: раз в SIM_INTERVAL_MS публикует показания каждого станка
 * в MQTT-топик {prefix}/{equipmentId}/power. Формат — docs/mqtt-contract.md.
 * Реальные ESP32 заменят его без изменений в API.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mqtt from 'mqtt';
import { env, envNum, loadDotEnv, loadSiteConfig } from '@bakery/shared/node';
import { MachineSim, toPayload, topicFor } from '@bakery/shared';

loadDotEnv();
const config = loadSiteConfig();
const MQTT_URL = env('MQTT_URL', 'mqtt://localhost:1883');
const PREFIX = env('MQTT_TOPIC_PREFIX', 'bakery');
const INTERVAL = envNum('SIM_INTERVAL_MS', 5000);
const BACKFILL_HOURS = envNum('SIM_BACKFILL_HOURS', 6);
const ANOMALY_PER_HOUR = envNum('SIM_ANOMALY_PER_HOUR', 0.5);
const STATE_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.state.json');

interface SimState {
  lastTs: number;
  energyKwh: Record<string, number>;
}

function readState(): SimState | null {
  try {
    return existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, 'utf8')) as SimState) : null;
  } catch {
    return null;
  }
}

const saved = readState();
const sims = config.equipment.map(
  (eq) =>
    new MachineSim(eq, {
      rng: Math.random,
      timezone: config.site.timezone,
      anomalyPerHour: ANOMALY_PER_HOUR,
      energyKwh: saved?.energyKwh[eq.id],
    }),
);
let lastTs = saved?.lastTs ?? 0;

function saveState(): void {
  const state: SimState = { lastTs, energyKwh: Object.fromEntries(sims.map((s) => [s.eq.id, Math.round(s.energyKwh * 1000) / 1000])) };
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.warn('[sim] не удалось сохранить состояние:', (e as Error).message);
  }
}

const anomalySeen = new Map<string, number>();
function logAnomalies(live: boolean): void {
  for (const s of sims) {
    const n = anomalySeen.get(s.eq.id) ?? 0;
    for (const a of s.anomalyLog.slice(n)) {
      if (live) console.log(`[sim] ⚠ ${s.eq.name}: аномалия «${a.type}» на ${Math.round((a.to - a.from) / 1000)} с`);
    }
    anomalySeen.set(s.eq.id, s.anomalyLog.length);
  }
}

async function main(): Promise<void> {
  console.log(`[sim] подключение к ${MQTT_URL} …`);
  const client = await mqtt.connectAsync(MQTT_URL, {
    clientId: `bakery-simulator-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 2000,
  });
  console.log(`[sim] подключено. Станков: ${sims.length}, интервал ${INTERVAL / 1000} с, топики ${PREFIX}/{id}/power`);
  client.on('error', (e) => console.error('[sim] MQTT ошибка:', e.message));
  client.on('reconnect', () => console.log('[sim] переподключение к MQTT…'));

  // Догрузка истории: как ESP32 с буфером, который «досылает» пропущенное после простоя.
  const now = Date.now();
  const from = Math.max(lastTs + INTERVAL, now - BACKFILL_HOURS * 3_600_000);
  if (BACKFILL_HOURS > 0 && now - from > INTERVAL * 2) {
    let count = 0;
    const started = Date.now();
    for (let t = from; t < now; t += INTERVAL) {
      const batch: Promise<unknown>[] = [];
      for (const s of sims) {
        const r = s.tick(t, INTERVAL);
        if (r) {
          batch.push(client.publishAsync(topicFor(PREFIX, r.equipmentId), toPayload(r), { qos: 0 }));
          count++;
        }
      }
      await Promise.all(batch);
      lastTs = t;
    }
    logAnomalies(false);
    console.log(`[sim] дозаписано ${count} сообщений истории за ${((now - from) / 3_600_000).toFixed(1)} ч (${Date.now() - started} мс)`);
    saveState();
  }

  let ticks = 0;
  const tick = () => {
    const t = Date.now();
    const line: string[] = [];
    for (const s of sims) {
      const r = s.tick(t, INTERVAL);
      if (r) {
        client.publish(topicFor(PREFIX, r.equipmentId), toPayload(r), { qos: 0 });
        line.push(`${s.eq.id}=${r.powerKw.toFixed(2)}`);
      } else {
        line.push(`${s.eq.id}=—`);
      }
    }
    lastTs = t;
    logAnomalies(true);
    if (ticks++ % 12 === 0) console.log(`[sim] кВт: ${line.join(' ')}`);
    if (ticks % 12 === 0) saveState();
  };
  tick();
  const timer = setInterval(tick, INTERVAL);

  const stop = async () => {
    clearInterval(timer);
    saveState();
    await client.endAsync().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error('[sim] ошибка запуска:', e instanceof Error ? e.message : e);
  console.error('[sim] Mosquitto запущен? Выполните: docker compose up -d');
  process.exit(1);
});
