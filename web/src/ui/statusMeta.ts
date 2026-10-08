import type { MachineStatus, StatusReason } from '@bakery/shared';

/** Статусные цвета (зарезервированы только под статус, не под серии). */
export const STATUS_COLOR: Record<MachineStatus, string> = {
  running: '#0ca30c',
  idle: '#fab219',
  alarm: '#d03b3b',
  offline: '#898781',
};

export const STATUS_LABEL: Record<MachineStatus, string> = {
  running: 'Работает',
  idle: 'Простой',
  alarm: 'Авария',
  offline: 'Нет связи',
};

export const REASON_LABEL: Record<StatusReason, string> = {
  no_data: 'нет показаний от счётчика',
  overload: 'перегрузка',
  phase_loss: 'обрыв фазы',
  imbalance: 'несимметрия фаз',
  ai_anomaly: 'аномалия потребления',
};


export const STATUS_ORDER: MachineStatus[] = ['running', 'idle', 'alarm', 'offline'];

/** CSS-переменные статусов берутся отсюда же — один источник правды для 3D, SVG и CSS. */
export function applyStatusCssVars(root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--status-good', STATUS_COLOR.running);
  root.style.setProperty('--status-warning', STATUS_COLOR.idle);
  root.style.setProperty('--status-critical', STATUS_COLOR.alarm);
  root.style.setProperty('--status-offline', STATUS_COLOR.offline);
}
