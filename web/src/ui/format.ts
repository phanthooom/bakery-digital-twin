/** Форматирование чисел и времени для интерфейса (русская локаль). */
import type { AiCheck } from '@bakery/shared';

const NB = ' ';
const nf = new Map<number, Intl.NumberFormat>();

export function fmtNum(v: number, digits = 0): string {
  let f = nf.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    nf.set(digits, f);
  }
  // Intl в ru-RU использует U+00A0 или U+202F как разделитель тысяч — приводим к одному
  return f.format(v).replace(/ /g, NB);
}

/** Мощность в кВт: 0,77 · 34,6 · 123 */
export function fmtKw(kw: number): string {
  const a = Math.abs(kw);
  return fmtNum(kw, a < 10 ? 2 : a < 100 ? 1 : 0);
}

/** Подпись деления оси: без лишних нулей — 0 · 0,4 · 1,2 · 40 */
export function fmtAxis(v: number): string {
  return fmtNum(v, 2).replace(/,?0+$/, '') || '0';
}

/** Масса: до тонны — кг, дальше — тонны: 34 кг · 340 кг · 4,2 т */
export function fmtMass(kg: number): string {
  const a = Math.abs(kg);
  if (a >= 1000) return `${fmtNum(kg / 1000, a >= 10_000 ? 0 : 1)}${NB}т`;
  return `${fmtNum(kg, a < 10 ? 1 : 0)}${NB}кг`;
}

export function fmtPct(v: number, digits = 0): string {
  return `${fmtNum(v, digits)}${NB}%`;
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}${NB}с`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}${NB}мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}${NB}ч ${m % 60}${NB}мин` : `${h}${NB}ч`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}${NB}д ${h % 24}${NB}ч` : `${d}${NB}д`;
}

export function fmtAgo(ms: number): string {
  return ms < 3000 ? 'только что' : `${fmtDuration(ms)} назад`;
}

const tf = new Map<string, Intl.DateTimeFormat>();
export function fmtTime(ts: number, timezone: string): string {
  let f = tf.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    tf.set(timezone, f);
  }
  return f.format(ts);
}

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '\u2212' : ''}${fmtNum(Math.abs(v), 1)}`;

/** Итог ИИ-проверки одной строкой: «в норме», «потребление +1,8 % от нормы», «аномалия: …», «обучение». */
export function fmtAiHeadline(ai: AiCheck): string {
  if (ai.state === 'learning' || ai.deviationPct === null) return 'обучение';
  const text = `потребление ${signed(ai.deviationPct)}${NB}% от нормы`;
  if (ai.state === 'anomaly') return `аномалия: ${text}`;
  return Math.abs(ai.deviationPct) < 0.5 ? 'в норме' : text;
}

export function fmtAiLearning(ai: AiCheck, minSamples: number): string {
  return `накоплено ${ai.samples} из ${minSamples}${NB}мин истории для этого часа`;
}
