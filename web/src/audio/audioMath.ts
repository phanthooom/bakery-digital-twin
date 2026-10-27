import type { EquipmentState, GasState } from '@bakery/shared';

/**
 * Минимальный интерфейс контекста для создания буфера шума (совместим с AudioContext и BaseAudioContext, а также с моками).
 */
export interface AudioBufferFactory {
  sampleRate: number;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer;
}

/**
 * Создаёт циклический буфер белого шума для процедурного синтеза (горелки печей, щелчки контакторов).
 * Значения амплитуд лежат строго в диапазоне [-1.0, 1.0].
 */
export function createNoiseBuffer(ctx: AudioBufferFactory, durationSec = 1): AudioBuffer {
  const sampleRate = ctx.sampleRate || 44100;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Параметры пространственного позиционирования PannerNode на основе координат оборудования (ADR-0007).
 */
export function calculatePannerParams(eqPos: { x: number; y?: number; z: number }): PannerOptions {
  return {
    panningModel: 'HRTF',
    distanceModel: 'inverse',
    refDistance: 3,
    maxDistance: 45,
    rolloffFactor: 1.1,
    positionX: eqPos.x,
    positionY: eqPos.y ?? 0,
    positionZ: eqPos.z,
  };
}

export interface StateTransitionsResult {
  /** Идентификаторы станков, которые перешли в статус running (для звука включения контактора в ЩР-1). */
  startedMachines: string[];
  /** Есть ли хотя бы один станок в аварийном статусе alarm. */
  hasMachineAlarm: boolean;
  /** Идентификаторы станков в аварии. */
  alarmMachines: string[];
}

/**
 * Детектор перехода состояний станков (чистая функция).
 * Фиксирует момент пуска оборудования (idle/offline -> running) для щелчка контактора в щите ЩР-1
 * и наличие аварийного оборудования для включения сирены.
 */
export function detectStateTransitions(
  prevStates: ReadonlyMap<string, EquipmentState> | undefined,
  nextStates: ReadonlyMap<string, EquipmentState>,
): StateTransitionsResult {
  const startedMachines: string[] = [];
  const alarmMachines: string[] = [];

  for (const [id, next] of nextStates.entries()) {
    if (next.status === 'alarm') {
      alarmMachines.push(id);
    }

    if (prevStates) {
      const prev = prevStates.get(id);
      if (prev && prev.status !== 'running' && next.status === 'running') {
        startedMachines.push(id);
      }
    }
  }

  return {
    startedMachines,
    hasMachineAlarm: alarmMachines.length > 0,
    alarmMachines,
  };
}

/**
 * Проверка критической тревоги по газу для аварийной сирены (ADR-0006).
 */
export function isGasAlarmActive(gas: GasState | null | undefined): boolean {
  if (!gas) return false;
  return gas.level === 'critical' || gas.alerts.some((a) => a.level === 'critical');
}
