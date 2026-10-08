import { assessLine, feederFor, type EquipmentConfig, type EquipmentState, type Feeder, type LineHealth, type LineLevel, type LineProblem, type SiteConfig } from '@bakery/shared';
import { fmtNum } from './format';
import { STATUS_COLOR } from './statusMeta';

export const LINE_LABEL: Record<LineLevel, string> = {
  ok: 'Норма',
  idle: 'Без нагрузки',
  warning: 'Предупреждение',
  critical: 'Авария',
  offline: 'Нет данных',
};

/** Цвет линии: статусная палитра (предупреждение — жёлтый, авария — красный), норма — цвет тока. */
export const LINE_COLOR: Record<LineLevel, string> = {
  ok: '#3b8cff',
  idle: '#8f8d86',
  warning: STATUS_COLOR.idle,
  critical: STATUS_COLOR.alarm,
  offline: STATUS_COLOR.offline,
};

export function problemText(p: LineProblem): string {
  const ph = p.phase ? `L${p.phase}` : '';
  switch (p.code) {
    case 'breaker_overload':
      return `ток ${fmtNum(p.value)} % автомата — автомат может отключить линию`;
    case 'breaker_high':
      return `загрузка автомата ${fmtNum(p.value)} % (выше 80 %)`;
    case 'phase_loss':
      return `обрыв фазы ${ph}: ток ${fmtNum(p.value, 2)} А`;
    case 'imbalance':
      return `несимметрия токов ${fmtNum(p.value)} % под нагрузкой`;
    case 'undervoltage':
      return `просадка напряжения на ${ph}: ${fmtNum(p.value, 1)} В (норма 207–253 В)`;
    case 'overvoltage':
      return `перенапряжение на ${ph}: ${fmtNum(p.value, 1)} В (норма 207–253 В)`;
  }
}

export interface LineInfo {
  eq: EquipmentConfig;
  feeder: Feeder;
  health: LineHealth;
}

export function lineInfo(config: SiteConfig, eq: EquipmentConfig, state: EquipmentState | undefined): LineInfo {
  const index = config.equipment.indexOf(eq) + 1;
  const feeder = feederFor(eq, index);
  const health = assessLine({
    reading: state?.lastReading ?? null,
    offline: !state || state.status === 'offline',
    feeder,
    phases: eq.phases,
    nominalKw: eq.nominalKw,
    thresholds: config.thresholds,
  });
  return { eq, feeder, health };
}
