import { AREA_KINDS, type FloorRect, type SiteConfig } from './types';

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Проверка config/equipment.json. Возвращает список ошибок на русском. */
export function validateSiteConfig(raw: unknown): { config: SiteConfig | null; errors: string[] } {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) return { config: null, errors: ['конфиг должен быть объектом'] };
  const c = raw as Partial<SiteConfig>;

  if (!c.site?.timezone) errors.push('site.timezone обязателен');
  if (!c.thresholds) errors.push('thresholds обязателен');
  const brand = c.site?.brand as unknown as Record<string, unknown> | undefined;
  if (brand !== undefined && (typeof brand !== 'object' || brand === null || typeof brand.name !== 'string' || !brand.name)) {
    errors.push('site.brand.name обязателен, если задан site.brand');
  }
  const panel = (c as { power?: { panel?: Record<string, unknown> } }).power?.panel;
  if ((c as { power?: unknown }).power !== undefined && (!panel || typeof panel.id !== 'string' || !isNum(panel.inputBreakerA))) {
    errors.push('power.panel: нужны id и inputBreakerA');
  }
  const energy = (c as { energy?: Record<string, unknown> }).energy;
  if (energy !== undefined) errors.push(...validateEnergy(energy));
  const supply = (c as { supply?: Record<string, unknown> }).supply;
  if (supply !== undefined) errors.push(...validateSupply(supply));
  if (brand && brand.logo != null && typeof brand.logo !== 'string') errors.push('site.brand.logo — путь к файлу логотипа или null');
  if (!Array.isArray(c.stages) || c.stages.length === 0) errors.push('stages: нужен хотя бы один этап');
  if (!Array.isArray(c.equipment)) errors.push('equipment должен быть массивом');
  if (errors.length) return { config: null, errors };

  const hall = c.site!.hall;
  c.stages!.forEach((s, i) => {
    if (!rectInHall(s.zone, hall)) errors.push(`stages[${i}] (${s.id}): zone — прямоугольник x0 < x1, z0 < z1 внутри цеха`);
  });
  const stageIds = new Set(c.stages!.map((s) => s.id));
  const seen = new Set<string>();
  c.equipment!.forEach((e, i) => {
    const at = `equipment[${i}]${e?.id ? ` (${e.id})` : ''}`;
    if (typeof e?.id !== 'string' || !ID_RE.test(e.id)) {
      errors.push(`${at}: id должен состоять из a-z, 0-9, "-", "_" (используется в MQTT-топике)`);
    } else if (seen.has(e.id)) {
      errors.push(`${at}: дублируется id "${e.id}"`);
    } else {
      seen.add(e.id);
    }
    if (typeof e.name !== 'string' || !e.name) errors.push(`${at}: name обязателен`);
    if (!stageIds.has(e.stage)) errors.push(`${at}: неизвестный этап "${e.stage}"`);
    if (!isNum(e.nominalKw) || e.nominalKw <= 0) errors.push(`${at}: nominalKw должен быть > 0`);
    if (e.phases !== 1 && e.phases !== 3) errors.push(`${at}: phases должен быть 1 или 3`);
    const p = e.position as unknown as Record<string, unknown> | undefined;
    if (!p || !isNum(p.x) || !isNum(p.y) || !isNum(p.z)) errors.push(`${at}: position должен быть {x, y, z} числами`);
    if (e.model != null && typeof e.model !== 'string') errors.push(`${at}: model — строка (путь к .glb) или null`);
    if (e.gasM3h !== undefined && (!isNum(e.gasM3h) || e.gasM3h <= 0)) errors.push(`${at}: gasM3h — расход горелки, м³/ч, должен быть > 0`);
    if (e.climate !== undefined) {
      const cl = e.climate as unknown as Record<string, unknown>;
      if (!isNum(cl.targetTempC) || !isNum(cl.minTempC) || !isNum(cl.maxTempC) || cl.minTempC >= cl.maxTempC) {
        errors.push(`${at}: climate — нужны targetTempC, minTempC < maxTempC`);
      }
    }
  });
  const gas = (c as { gas?: Record<string, unknown> }).gas;
  if (gas !== undefined) errors.push(...validateGas(gas));
  (c.staff ?? []).forEach((s, i) => {
    if (s.spot) return;
    if (!Array.isArray(s.at) || !s.at.length) errors.push(`staff[${i}]: at — хотя бы один станок (или spot — место без станка)`);
    else for (const id of s.at) if (!seen.has(id)) errors.push(`staff[${i}]: неизвестный станок "${id}"`);
  });
  (c.areas ?? []).forEach((a, i) => {
    const at = `areas[${i}] (${a.id})`;
    if (!(AREA_KINDS as readonly string[]).includes(a.kind)) errors.push(`${at}: kind — одно из ${AREA_KINDS.join(', ')}`);
    if (!rectInHall(a.zone, hall)) errors.push(`${at}: zone — прямоугольник x0 < x1, z0 < z1 внутри цеха`);
  });

  return errors.length ? { config: null, errors } : { config: c as SiteConfig, errors };
}

function rectInHall(z: FloorRect | undefined, hall: { width: number; depth: number }): boolean {
  const inside = (v: number, half: number) => isNum(v) && Math.abs(v) <= half + 1e-9;
  return !!z && z.x0 < z.x1 && z.z0 < z.z1 && [z.x0, z.x1].every((v) => inside(v, hall.width / 2)) && [z.z0, z.z1].every((v) => inside(v, hall.depth / 2));
}

function validateGas(gas: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const meter = gas.meter as Record<string, unknown> | undefined;
  if (!meter || typeof meter.id !== 'string' || !isNum(meter.maxM3h) || meter.maxM3h <= 0) errors.push('gas.meter: нужны id и maxM3h > 0');
  const det = gas.detector as Record<string, unknown> | undefined;
  if (det !== undefined && (!isNum(det.warnLel) || !isNum(det.alarmLel) || det.warnLel <= 0 || det.alarmLel <= det.warnLel || det.alarmLel > 100)) {
    errors.push('gas.detector: пороги в % НКПР, 0 < warnLel < alarmLel ≤ 100');
  }
  const leak = gas.leak as Record<string, unknown> | undefined;
  const keys = ['idleFlowM3h', 'idleMinutes', 'overPct', 'overMinM3h', 'overMinutes'];
  if (!leak || keys.some((k) => !isNum(leak[k]) || (leak[k] as number) <= 0)) errors.push(`gas.leak: ${keys.join(', ')} — числа > 0`);
  if (!isNum(gas.offlineAfterSec) || gas.offlineAfterSec <= 0) errors.push('gas.offlineAfterSec должен быть > 0');
  return errors;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateEnergy(energy: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const tariffs = energy.tariffs as Array<Record<string, unknown>> | undefined;
  const shifts = energy.shifts as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(tariffs) || !tariffs.length) errors.push('energy.tariffs: нужен хотя бы один тариф');
  else tariffs.forEach((t, i) => {
    if (typeof t.from !== 'string' || !DATE_RE.test(t.from) || !isNum(t.pricePerKwh) || t.pricePerKwh <= 0) {
      errors.push(`energy.tariffs[${i}]: from — дата YYYY-MM-DD, pricePerKwh > 0`);
    }
  });
  if (!Array.isArray(shifts) || !shifts.length) {
    errors.push('energy.shifts: нужна хотя бы одна смена');
    return errors;
  }
  let ok = true;
  shifts.forEach((s, i) => {
    if (typeof s.from !== 'string' || typeof s.to !== 'string' || !HM_RE.test(s.from) || !HM_RE.test(s.to)) {
      errors.push(`energy.shifts[${i}]: from и to — время HH:MM`);
      ok = false;
    }
  });
  // каждая минута суток — ровно в одной смене
  const covered = ok ? new Array<number>(1440).fill(0) : [];
  if (ok) for (const s of shifts) {
    const [a, b] = [s.from, s.to].map((v) => { const [h, m] = String(v).split(':').map(Number); return h! * 60 + m!; });
    for (let m = a!; m !== b; m = (m + 1) % 1440) covered[m]!++;
  }
  if (!ok || covered.some((n) => n !== 1)) errors.push('energy.shifts: смены должны покрывать все 24 часа без наложений');
  return errors;
}

function validateSupply(supply: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const materials = (supply.materials as Array<Record<string, unknown>> | undefined) ?? [];
  const products = (supply.products as Array<Record<string, unknown>> | undefined) ?? [];
  const ids = new Set(materials.map((m) => m.id));
  if (!materials.length) errors.push('supply.materials: нужно хотя бы одно сырьё');
  materials.forEach((m, i) => {
    if (!isNum(m.shelfLifeDays) || m.shelfLifeDays <= 0 || !isNum(m.minStock)) errors.push(`supply.materials[${i}]: нужны shelfLifeDays > 0 и minStock`);
  });
  products.forEach((p, i) => {
    const recipe = (p.recipe as Record<string, unknown> | undefined) ?? {};
    for (const [id, v] of Object.entries(recipe)) {
      if (!ids.has(id)) errors.push(`supply.products[${i}] (${String(p.id)}): в рецептуре неизвестное сырьё "${id}"`);
      else if (!isNum(v) || v <= 0) errors.push(`supply.products[${i}] (${String(p.id)}): расход "${id}" должен быть > 0`);
    }
  });
  if (!Array.isArray(supply.vehicles)) errors.push('supply.vehicles должен быть массивом');
  return errors;
}
