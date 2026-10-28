import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  SEMI_TIMING,
  VAN_TIMING,
  type DockVisit,
  type EquipmentState,
  type SiteConfig,
} from '@bakery/shared';
import { useDockPlan } from '../data/useDockPlan';
import { useGas, useStates } from '../data/store';
import { sceneNow } from '../data/timeCursor';
import { calculatePannerParams, detectStateTransitions, isGasAlarmActive } from '../audio/audioMath';
import { soundManager } from '../audio/audioManager';
import { updateListener } from '../audio/spatialAudio';
import {
  AlarmSirenSynth,
  ContactorSynth,
  MixerSynth,
  OvenSynth,
  ReverseBeeperSynth,
  RooftopFanSynth,
  type DisposableSynth,
} from '../audio/synthesizers';

export interface SpatialSoundscapeProps {
  config: SiteConfig;
}

function isVisitReversing(v: DockVisit, reverseMs: number, now: number): boolean {
  return v.arriveAt !== null && now >= v.arriveAt - reverseMs && now < v.arriveAt;
}

export function SpatialSoundscape({ config }: SpatialSoundscapeProps) {
  const states = useStates();
  const gas = useGas();
  const dockPlan = useDockPlan();

  const prevStatesRef = useRef<ReadonlyMap<string, EquipmentState> | undefined>(undefined);
  const synthsRef = useRef<Map<string, DisposableSynth>>(new Map());
  const contactorRef = useRef<ContactorSynth | null>(null);
  const reverseBeeperRef = useRef<ReverseBeeperSynth | null>(null);
  const alarmSirenRef = useRef<AlarmSirenSynth | null>(null);

  // Инициализация источников звука при монтировании
  useEffect(() => {
    const ctx = soundManager.getContext();
    const masterGain = soundManager.getMasterGainNode();
    if (!ctx || !masterGain) return;

    const synths = synthsRef.current;

    // 1. Синтезаторы оборудования (печи и тестомесы)
    config.equipment.forEach((eq) => {
      const panner = new PannerNode(ctx, calculatePannerParams(eq.position));
      panner.connect(masterGain);

      if (eq.kind === 'oven') {
        const oven = new OvenSynth(ctx, panner);
        synths.set(eq.id, oven);
      } else if (eq.kind === 'mixer') {
        const mixer = new MixerSynth(ctx, panner);
        synths.set(eq.id, mixer);
      } else if (eq.kind === 'drycooler' || eq.kind === 'chiller') {
        const fan = new RooftopFanSynth(ctx, panner);
        synths.set(eq.id, fan);
      }
    });

    // 2. Силовой контактор в ГРЩ / ЩР-1
    const panelPos = config.power?.panel?.position ?? { x: 18, y: 1.5, z: -10 };
    const panelPanner = new PannerNode(ctx, calculatePannerParams({ x: panelPos.x, y: 1.8, z: panelPos.z }));
    panelPanner.connect(masterGain);
    const contactor = new ContactorSynth(ctx, panelPanner);
    contactorRef.current = contactor;
    synths.set('contactor-panel', contactor);

    // 3. Зуммер заднего хода у рампы во дворе
    const dockFrontZ = config.site.hall.depth / 2 + 1;
    const yardPanner = new PannerNode(ctx, calculatePannerParams({ x: 0, y: 1.5, z: dockFrontZ }));
    yardPanner.connect(masterGain);
    const reverseBeeper = new ReverseBeeperSynth(ctx, yardPanner);
    reverseBeeperRef.current = reverseBeeper;
    synths.set('reverse-beeper', reverseBeeper);

    // 4. Общецеховая аварийная сирена
    const sirenPanner = new PannerNode(ctx, calculatePannerParams({ x: 0, y: config.site.hall.height - 0.5, z: 0 }));
    sirenPanner.connect(masterGain);
    const siren = new AlarmSirenSynth(ctx, sirenPanner);
    alarmSirenRef.current = siren;
    synths.set('alarm-siren', siren);

    return () => {
      synths.forEach((synth) => synth.dispose());
      synths.clear();
      contactorRef.current = null;
      reverseBeeperRef.current = null;
      alarmSirenRef.current = null;
    };
  }, [config]);

  // Реакция на смену состояний оборудования и газа
  useEffect(() => {
    const transitions = detectStateTransitions(prevStatesRef.current, states);
    prevStatesRef.current = states;

    // Щелчок контактора при пуске любого станка
    if (transitions.startedMachines.length > 0) {
      contactorRef.current?.trigger();
    }

    // Управление звуками печей и тестомесов
    for (const [id, synth] of synthsRef.current.entries()) {
      const state = states.get(id);
      if (!state) continue;

      if (synth instanceof OvenSynth) {
        synth.setActive(state.status === 'running', state.pctOfNominal ?? 100);
      } else if (synth instanceof MixerSynth) {
        synth.setActive(state.status === 'running');
      } else if (synth instanceof RooftopFanSynth) {
        synth.setActive(state.status === 'running', state.pctOfNominal ?? 100);
      }
    }

    // Включение сирены тревоги
    const gasAlarm = isGasAlarmActive(gas);
    const shouldAlarm = transitions.hasMachineAlarm || gasAlarm;
    alarmSirenRef.current?.setActive(shouldAlarm);
  }, [states, gas]);

  // Синхронизация ориентации слушателя и динамических звуков в каждом кадре R3F
  useFrame(({ camera }) => {
    const ctx = soundManager.getContext();
    if (ctx) {
      updateListener(ctx, camera);
    }

    // Проверяем статус заднего хода машин у рампы в текущий момент сцены
    if (dockPlan && reverseBeeperRef.current) {
      const now = sceneNow();
      let anyReversing = false;

      for (const vanPlan of dockPlan.vans.values()) {
        if (vanPlan.visits.some((v) => isVisitReversing(v, VAN_TIMING.reverseMs, now))) {
          anyReversing = true;
          break;
        }
      }

      if (!anyReversing) {
        anyReversing = dockPlan.supplier.some((u) => isVisitReversing(u.visit, SEMI_TIMING.reverseMs, now));
      }

      reverseBeeperRef.current.setActive(anyReversing);
    }
  });

  return null;
}
