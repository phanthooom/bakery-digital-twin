import type { AiState, MachineStatus, StatusReason } from '@bakery/shared';

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

export const AI_LABEL: Record<AiState, string> = {
  learning: 'обучение',
  ok: 'в норме',
  deviation: 'отклонение',
  anomaly: 'аномалия',
};

export const STATUS_ORDER: MachineStatus[] = ['running', 'idle', 'alarm', 'offline'];
