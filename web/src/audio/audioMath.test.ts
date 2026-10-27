import { describe, expect, it } from 'vitest';
import type { EquipmentState, GasState } from '@bakery/shared';
import {
  calculatePannerParams,
  createNoiseBuffer,
  detectStateTransitions,
  isGasAlarmActive,
  type AudioBufferFactory,
} from './audioMath';

describe('audioMath: чистые функции и аудио-математика (Стык 8)', () => {
  describe('createNoiseBuffer', () => {
    it('создает моно-буфер корректной длины с частотой дискретизации контекста', () => {
      const mockFactory: AudioBufferFactory = {
        sampleRate: 44100,
        createBuffer: (_channels, length, sampleRate) => {
          const channelData = new Float32Array(length);
          return {
            numberOfChannels: 1,
            length,
            sampleRate,
            duration: length / sampleRate,
            getChannelData: () => channelData,
          } as unknown as AudioBuffer;
        },
      };

      const buffer = createNoiseBuffer(mockFactory, 0.5);
      expect(buffer.numberOfChannels).toBe(1);
      expect(buffer.sampleRate).toBe(44100);
      expect(buffer.length).toBe(22050);

      const data = buffer.getChannelData(0);
      expect(data.length).toBe(22050);

      // Все значения амплитуд должны лежать строго в диапазоне [-1.0, 1.0]
      let hasNonZero = false;
      for (let i = 0; i < data.length; i++) {
        expect(data[i]).toBeGreaterThanOrEqual(-1);
        expect(data[i]).toBeLessThanOrEqual(1);
        if (data[i] !== 0) hasNonZero = true;
      }
      expect(hasNonZero).toBe(true);
    });

    it('по умолчанию генерирует 1 секунду шума', () => {
      const mockFactory: AudioBufferFactory = {
        sampleRate: 48000,
        createBuffer: (_channels, length, sampleRate) => {
          return {
            numberOfChannels: 1,
            length,
            sampleRate,
            getChannelData: () => new Float32Array(length),
          } as unknown as AudioBuffer;
        },
      };

      const buffer = createNoiseBuffer(mockFactory);
      expect(buffer.length).toBe(48000);
    });
  });

  describe('calculatePannerParams', () => {
    it('рассчитывает корректные параметры пространственного затухания HRTF по координатам станка', () => {
      const params = calculatePannerParams({ x: 9.8, y: 1.5, z: -15.7 });
      expect(params.panningModel).toBe('HRTF');
      expect(params.distanceModel).toBe('inverse');
      expect(params.refDistance).toBe(3);
      expect(params.maxDistance).toBe(45);
      expect(params.rolloffFactor).toBe(1.1);
      expect(params.positionX).toBe(9.8);
      expect(params.positionY).toBe(1.5);
      expect(params.positionZ).toBe(-15.7);
    });

    it('подставляет y=0 если координата y не задана', () => {
      const params = calculatePannerParams({ x: -2.3, z: -17.15 });
      expect(params.positionY).toBe(0);
      expect(params.positionX).toBe(-2.3);
      expect(params.positionZ).toBe(-17.15);
    });
  });

  describe('detectStateTransitions', () => {
    const makeState = (id: string, status: EquipmentState['status']): EquipmentState => ({
      id,
      status,
      reasons: [],
      statusSince: 1000,
      lastReading: null,
      pctOfNominal: 100,
      imbalancePct: null,
      ratedCurrentA: 10,
      ai_check: { state: 'ok', deviationPct: null, baselineKw: null, currentKw: null, samples: 0, checkedAt: 0 },
      updatedAt: 1000,
    });

    it('при первичном рендере (prevStates === undefined) не вызывает щелчок контактора', () => {
      const next = new Map<string, EquipmentState>([
        ['oven-1', makeState('oven-1', 'running')],
        ['mixer-1', makeState('mixer-1', 'idle')],
      ]);

      const res = detectStateTransitions(undefined, next);
      expect(res.startedMachines).toEqual([]);
      expect(res.hasMachineAlarm).toBe(false);
    });

    it('детектирует пуск станка (idle -> running) для щелчка контактора', () => {
      const prev = new Map<string, EquipmentState>([
        ['oven-1', makeState('oven-1', 'idle')],
        ['mixer-1', makeState('mixer-1', 'running')],
      ]);
      const next = new Map<string, EquipmentState>([
        ['oven-1', makeState('oven-1', 'running')],
        ['mixer-1', makeState('mixer-1', 'running')],
      ]);

      const res = detectStateTransitions(prev, next);
      expect(res.startedMachines).toEqual(['oven-1']);
      expect(res.hasMachineAlarm).toBe(false);
    });

    it('детектирует пуск станка из offline в running', () => {
      const prev = new Map<string, EquipmentState>([
        ['mixer-2', makeState('mixer-2', 'offline')],
      ]);
      const next = new Map<string, EquipmentState>([
        ['mixer-2', makeState('mixer-2', 'running')],
      ]);

      const res = detectStateTransitions(prev, next);
      expect(res.startedMachines).toEqual(['mixer-2']);
    });

    it('детектирует появление аварийного оборудования для сирены', () => {
      const prev = new Map<string, EquipmentState>([
        ['oven-1', makeState('oven-1', 'running')],
      ]);
      const next = new Map<string, EquipmentState>([
        ['oven-1', makeState('oven-1', 'alarm')],
      ]);

      const res = detectStateTransitions(prev, next);
      expect(res.hasMachineAlarm).toBe(true);
      expect(res.alarmMachines).toEqual(['oven-1']);
    });
  });

  describe('isGasAlarmActive', () => {
    it('возвращает true при критической загазованности или утечке газа', () => {
      const gasCritical: GasState = {
        level: 'critical',
        alerts: [{ kind: 'detector', level: 'critical', since: 1000 }],
        lastReading: null,
        expected: { m3h: 0, consumers: [], anyOn: false, known: true },
        updatedAt: 1000,
      };
      expect(isGasAlarmActive(gasCritical)).toBe(true);
    });

    it('возвращает false при нормальном уровне газа или offline', () => {
      const gasOk: GasState = {
        level: 'ok',
        alerts: [],
        lastReading: null,
        expected: { m3h: 0, consumers: [], anyOn: false, known: true },
        updatedAt: 1000,
      };
      expect(isGasAlarmActive(gasOk)).toBe(false);
      expect(isGasAlarmActive(null)).toBe(false);
      expect(isGasAlarmActive(undefined)).toBe(false);
    });
  });
});
