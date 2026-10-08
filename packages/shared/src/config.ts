import type { SiteConfig } from './types';

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
  if (brand && brand.logo != null && typeof brand.logo !== 'string') errors.push('site.brand.logo — путь к файлу логотипа или null');
  if (!Array.isArray(c.stages) || c.stages.length === 0) errors.push('stages: нужен хотя бы один этап');
  if (!Array.isArray(c.equipment)) errors.push('equipment должен быть массивом');
  if (errors.length) return { config: null, errors };

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
  });

  return errors.length ? { config: null, errors } : { config: c as SiteConfig, errors };
}
