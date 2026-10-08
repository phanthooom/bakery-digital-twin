import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSiteConfig } from '../config';
import type { SiteConfig } from '../types';

/** Корень репозитория (packages/shared/src/node → ../../../..). */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Подгружает .env из корня репозитория (без зависимостей; переменные окружения важнее). */
export function loadDotEnv(file = path.join(REPO_ROOT, '.env')): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const [, key, rawVal] = m;
    if (process.env[key!] === undefined) process.env[key!] = rawVal!.replace(/^["']|["']$/g, '');
  }
}

export function loadSiteConfig(file = process.env.CONFIG_PATH ?? path.join(REPO_ROOT, 'config', 'equipment.json')): SiteConfig {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const { config, errors } = validateSiteConfig(raw);
  if (!config) throw new Error(`Ошибки в ${file}:\n  - ${errors.join('\n  - ')}`);
  return config;
}

export function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export function envNum(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== '' ? v : fallback;
}
