/** Электрические расчёты по показаниям счётчика. */

export const PHASE_VOLTAGE_V = 230;
export const LINE_VOLTAGE_V = 400;
export const DEFAULT_POWER_FACTOR = 0.9;

/** Ниже этого среднего тока (А) несимметрия не имеет смысла — станок обесточен. */
const MIN_AVG_CURRENT_A = 0.05;

/**
 * Несимметрия токов по фазам, % (определение NEMA MG-1):
 * максимальное отклонение от среднего, делённое на среднее.
 * null — для однофазных станков и обесточенного оборудования.
 */
export function imbalancePct(currentsA: readonly number[]): number | null {
  if (currentsA.length < 2) return null;
  const avg = currentsA.reduce((s, v) => s + v, 0) / currentsA.length;
  if (avg < MIN_AVG_CURRENT_A) return null;
  const maxDev = Math.max(...currentsA.map((v) => Math.abs(v - avg)));
  return (maxDev / avg) * 100;
}

/** Номинальный ток фазы, А: 3ф — P/(√3·U·cosφ), 1ф — P/(U·cosφ). */
export function ratedCurrentA(nominalKw: number, phases: 1 | 3, powerFactor = DEFAULT_POWER_FACTOR): number {
  const w = nominalKw * 1000;
  return phases === 3 ? w / (Math.sqrt(3) * LINE_VOLTAGE_V * powerFactor) : w / (PHASE_VOLTAGE_V * powerFactor);
}

/** Текущая мощность в % от номинальной. */
export function pctOfNominal(powerKw: number, nominalKw: number): number | null {
  if (!(nominalKw > 0)) return null;
  return (powerKw / nominalKw) * 100;
}
