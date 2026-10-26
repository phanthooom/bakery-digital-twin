import { describe, expect, it, vi } from 'vitest';
import {
  PRODUCTION_STEPS,
  ProductionCycleManager,
  type ProductionCycleState,
  type ProductionStepId,
} from './productionCycle';

describe('ProductionCycleManager (Стейт-машина сквозного производственного цикла)', () => {
  it('1. initial state is idle: начальное состояние idle, индекс шага -1, активный шаг null', () => {
    const mgr = new ProductionCycleManager();
    const st = mgr.getState();

    expect(st.status).toBe('idle');
    expect(st.currentStepId).toBe('idle');
    expect(st.currentStepIndex).toBe(-1);
    expect(st.activeStep).toBeNull();
    expect(st.stepProgress).toBe(0);
    expect(st.totalProgress).toBe(0);
    expect(st.stepElapsedSec).toBe(0);
  });

  it('2. start() transitions to flour_transfer: старт переводит на шаг 1 («Пневмоподача муки»), машина silo-1', () => {
    const mgr = new ProductionCycleManager();
    const sink = vi.fn();
    mgr.subscribe(sink);

    mgr.start(0, 'ПР-20261026-01');
    const st = mgr.getState();

    expect(st.status).toBe('running');
    expect(st.currentStepId).toBe('flour_transfer');
    expect(st.currentStepIndex).toBe(0);
    expect(st.activeStep?.machineId).toBe('silo-1');
    expect(st.activeStep?.stepNumber).toBe(1);
    expect(st.batchNumber).toBe('ПР-20261026-01');
    expect(sink).toHaveBeenCalled();
  });

  it('3. tick() advances time and auto-transitions through all 6 stages to completed', () => {
    const mgr = new ProductionCycleManager();
    mgr.start();

    const expectedSteps: ProductionStepId[] = [
      'flour_transfer',
      'mixing',
      'forming_proofing',
      'baking',
      'packing',
      'dispatch',
    ];

    for (let i = 0; i < expectedSteps.length; i++) {
      const stepId = expectedSteps[i]!;
      expect(mgr.getState().currentStepId).toBe(stepId);
      expect(mgr.getState().currentStepIndex).toBe(i);

      const duration = mgr.getState().stepDurationSec;
      expect(duration).toBeGreaterThan(0);

      // Шагаем половину этапа
      mgr.tick(duration / 2);
      expect(mgr.getState().stepProgress).toBeCloseTo(0.5, 2);
      expect(mgr.getState().status).toBe('running');

      // Завершаем оставшуюся половину этапа
      mgr.tick(duration / 2);
    }

    // После 6 шагов цикл завершён
    expect(mgr.getState().status).toBe('completed');
    expect(mgr.getState().currentStepId).toBe('completed');
    expect(mgr.getState().stepProgress).toBe(1);
    expect(mgr.getState().totalProgress).toBe(1);
  });

  it('4. pause() and resume(): корректная остановка и возобновление таймера', () => {
    const mgr = new ProductionCycleManager();
    mgr.start();

    mgr.tick(2);
    const elapsed1 = mgr.getState().stepElapsedSec;
    expect(elapsed1).toBe(2);

    mgr.pause();
    expect(mgr.getState().status).toBe('paused');

    // Во время паузы tick не увеличивает время
    mgr.tick(5);
    expect(mgr.getState().stepElapsedSec).toBe(2);

    mgr.resume();
    expect(mgr.getState().status).toBe('running');

    mgr.tick(3);
    expect(mgr.getState().stepElapsedSec).toBe(5);
  });

  it('5. skip(): мгновенный переход к следующему этапу и завершение на последнем шаге', () => {
    const mgr = new ProductionCycleManager();
    mgr.start();

    expect(mgr.getState().currentStepId).toBe('flour_transfer');
    mgr.skip();
    expect(mgr.getState().currentStepId).toBe('mixing');
    mgr.skip();
    expect(mgr.getState().currentStepId).toBe('forming_proofing');
    mgr.skip();
    expect(mgr.getState().currentStepId).toBe('baking');
    mgr.skip();
    expect(mgr.getState().currentStepId).toBe('packing');
    mgr.skip();
    expect(mgr.getState().currentStepId).toBe('dispatch');
    mgr.skip();
    expect(mgr.getState().status).toBe('completed');
  });

  it('6. stop(): сброс цикла в начальное состояние idle', () => {
    const mgr = new ProductionCycleManager();
    mgr.start();
    mgr.tick(4);
    mgr.skip();

    expect(mgr.getState().status).toBe('running');
    mgr.stop();

    const st = mgr.getState();
    expect(st.status).toBe('idle');
    expect(st.currentStepId).toBe('idle');
    expect(st.currentStepIndex).toBe(-1);
    expect(st.activeStep).toBeNull();
    expect(st.totalElapsedSec).toBe(0);
  });

  it('7. listeners notification: подписчики получают снимок состояния при изменении шага и прогресса', () => {
    const mgr = new ProductionCycleManager();
    const states: ProductionCycleState[] = [];
    const unsub = mgr.subscribe((s) => states.push(s));

    mgr.start();
    mgr.tick(1);
    mgr.pause();
    unsub();
    mgr.resume();

    expect(states.length).toBe(3);
    expect(states[0]!.status).toBe('running');
    expect(states[1]!.stepElapsedSec).toBe(1);
    expect(states[2]!.status).toBe('paused');
  });

  it('8. setSpeed(): изменение скорости масштабирует прошедшее время', () => {
    const mgr = new ProductionCycleManager();
    mgr.start();
    mgr.setSpeed(2.5);

    mgr.tick(2); // 2 сек * 2.5 = 5 сек
    expect(mgr.getState().stepElapsedSec).toBe(5);
  });
});
