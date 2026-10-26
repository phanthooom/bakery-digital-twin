/**
 * Стейт-машина непрерывного сквозного цикла производства «от А до Я».
 * Строго соответствует GLOSSARY.md («Цех», «Этап», «Станок», «Партия», «Рейс»).
 */

export type ProductionStepId =
  | 'idle'
  | 'flour_transfer'
  | 'mixing'
  | 'forming_proofing'
  | 'baking'
  | 'packing'
  | 'dispatch'
  | 'completed';

export type ActiveProductionStepId =
  | 'flour_transfer'
  | 'mixing'
  | 'forming_proofing'
  | 'baking'
  | 'packing'
  | 'dispatch';

export type ProductionCycleStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface ProductionCameraFocus {
  x: number;
  z: number;
  lookY: number;
  dist: number;
  dir?: [number, number, number];
}

export interface ProductionStepMeta {
  readonly id: ActiveProductionStepId;
  readonly stepNumber: number; // 1..6
  readonly name: string;
  readonly stageName: string;
  readonly machineId: string;
  readonly nominalDurationSec: number;
  readonly description: string;
  readonly cameraFocus: ProductionCameraFocus;
}

export const PRODUCTION_STEPS: readonly ProductionStepMeta[] = [
  {
    id: 'flour_transfer',
    stepNumber: 1,
    name: 'Пневмоподача муки',
    stageName: 'Этап 1 · Пневмоподача муки',
    machineId: 'silo-1',
    nominalDurationSec: 10,
    description: 'Подача муки пшеничной в/с из силоса №1 по пневмопроводам сквозь перекрытие антресоли в дежу тестомеса mixer-1',
    cameraFocus: {
      x: -23.0,
      z: -12.75,
      lookY: 4.6,
      dist: 10.5,
      dir: [0.15, 0.45, 0.9],
    },
  },
  {
    id: 'mixing',
    stepNumber: 2,
    name: 'Замес теста',
    stageName: 'Этап 2 · Замес теста',
    machineId: 'mixer-1',
    nominalDurationSec: 14,
    description: 'Вращение дежи и спирали тестомеса mixer-1, смешивание муки с ингредиентами, замес партии багетов',
    cameraFocus: {
      x: -23.0,
      z: -15.4,
      lookY: 1.2,
      dist: 5.5,
      dir: [0.35, 0.5, 0.85],
    },
  },
  {
    id: 'forming_proofing',
    stepNumber: 3,
    name: 'Формовка и расстойка',
    stageName: 'Этап 3 · Формовка и расстойка',
    machineId: 'moulder-1',
    nominalDurationSec: 12,
    description: 'Деление и формовка заготовок на тестоделителе moulder-1 с технологической выдержкой в расстоечном шкафу proofer-1',
    cameraFocus: {
      x: -4.0,
      z: -15.7,
      lookY: 1.5,
      dist: 9.5,
      dir: [0.0, 0.55, 0.85],
    },
  },
  {
    id: 'baking',
    stepNumber: 4,
    name: 'Выпекание',
    stageName: 'Этап 4 · Выпекание',
    machineId: 'oven-1',
    nominalDurationSec: 16,
    description: 'Закатка тележки с багетами в ротационную печь MIWE oven-1, пик мощности ТЭНов до 28–36 кВт, выход пара',
    cameraFocus: {
      x: 9.8,
      z: -15.7,
      lookY: 1.8,
      dist: 6.8,
      dir: [-0.25, 0.45, 0.88],
    },
  },
  {
    id: 'packing',
    stepNumber: 5,
    name: 'Охлаждение и упаковка',
    stageName: 'Этап 5 · Охлаждение и упаковка',
    machineId: 'packer-1',
    nominalDurationSec: 12,
    description: 'Остывание готового хлеба, фасовка в индивидуальную крафтовую упаковку и укладка в гофрокороба',
    cameraFocus: {
      x: 21.5,
      z: -1.0,
      lookY: 1.4,
      dist: 6.2,
      dir: [-0.4, 0.55, 0.75],
    },
  },
  {
    id: 'dispatch',
    stepNumber: 6,
    name: 'Отгрузка и рейс',
    stageName: 'Этап 6 · Отгрузка и рейс',
    machineId: 'van-1',
    nominalDurationSec: 14,
    description: 'Перемещение коробов на рампу отгрузки, погрузка в электрофургон van-1 и выезд фургона в рейс клиентам',
    cameraFocus: {
      x: 17.5,
      z: 18.0,
      lookY: 2.2,
      dist: 12.0,
      dir: [-0.3, 0.5, 0.85],
    },
  },
];

export interface ProductionCycleState {
  readonly status: ProductionCycleStatus;
  readonly currentStepId: ProductionStepId;
  readonly currentStepIndex: number; // 0..5 для активных шагов, иначе -1
  readonly activeStep: ProductionStepMeta | null;
  readonly stepElapsedSec: number;
  readonly stepDurationSec: number;
  readonly stepProgress: number; // 0..1
  readonly totalElapsedSec: number;
  readonly totalDurationSec: number;
  readonly totalProgress: number; // 0..1
  readonly speed: number;
  readonly batchNumber: string;
}

export class ProductionCycleManager {
  private status: ProductionCycleStatus = 'idle';
  private currentStepIndex = -1;
  private stepElapsedSec = 0;
  private speed = 1.0;
  private batchNumber = '';
  private readonly listeners = new Set<(state: ProductionCycleState) => void>();

  constructor() {
    this.batchNumber = this.generateBatchNumber();
  }

  private generateBatchNumber(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `ПР-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-01`;
  }

  getState(): ProductionCycleState {
    const active = this.currentStepIndex >= 0 && this.currentStepIndex < PRODUCTION_STEPS.length
      ? PRODUCTION_STEPS[this.currentStepIndex]!
      : null;

    const currentStepId: ProductionStepId =
      this.status === 'idle'
        ? 'idle'
        : this.status === 'completed'
        ? 'completed'
        : (active?.id ?? 'idle');

    const stepDurationSec = active?.nominalDurationSec ?? 0;
    const stepProgress =
      this.status === 'completed'
        ? 1
        : stepDurationSec > 0
        ? Math.min(1, Math.max(0, this.stepElapsedSec / stepDurationSec))
        : 0;

    const totalDurationSec = PRODUCTION_STEPS.reduce((sum, s) => sum + s.nominalDurationSec, 0);

    let completedStepsDuration = 0;
    for (let i = 0; i < this.currentStepIndex && i < PRODUCTION_STEPS.length; i++) {
      completedStepsDuration += PRODUCTION_STEPS[i]!.nominalDurationSec;
    }
    const totalElapsedSec =
      this.status === 'completed'
        ? totalDurationSec
        : Math.min(totalDurationSec, completedStepsDuration + this.stepElapsedSec);

    const totalProgress =
      this.status === 'completed'
        ? 1
        : totalDurationSec > 0
        ? Math.min(1, Math.max(0, totalElapsedSec / totalDurationSec))
        : 0;

    return {
      status: this.status,
      currentStepId,
      currentStepIndex: this.currentStepIndex,
      activeStep: active,
      stepElapsedSec: this.stepElapsedSec,
      stepDurationSec,
      stepProgress,
      totalElapsedSec,
      totalDurationSec,
      totalProgress,
      speed: this.speed,
      batchNumber: this.batchNumber,
    };
  }

  start(stepIndex = 0, batchNumber?: string): void {
    this.status = 'running';
    this.currentStepIndex = Math.max(0, Math.min(PRODUCTION_STEPS.length - 1, stepIndex));
    this.stepElapsedSec = 0;
    if (batchNumber) this.batchNumber = batchNumber;
    else if (!this.batchNumber) this.batchNumber = this.generateBatchNumber();
    this.notify();
  }

  pause(): void {
    if (this.status === 'running') {
      this.status = 'paused';
      this.notify();
    }
  }

  resume(): void {
    if (this.status === 'paused') {
      this.status = 'running';
      this.notify();
    }
  }

  stop(): void {
    this.status = 'idle';
    this.currentStepIndex = -1;
    this.stepElapsedSec = 0;
    this.notify();
  }

  skip(): void {
    if (this.status !== 'running' && this.status !== 'paused') return;

    if (this.currentStepIndex < PRODUCTION_STEPS.length - 1) {
      this.currentStepIndex++;
      this.stepElapsedSec = 0;
      this.notify();
    } else {
      this.status = 'completed';
      this.currentStepIndex = -1;
      this.stepElapsedSec = 0;
      this.notify();
    }
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(10, speed));
    this.notify();
  }

  tick(dtSec: number): void {
    if (this.status !== 'running' || dtSec <= 0) return;

    const dt = dtSec * this.speed;
    const active = PRODUCTION_STEPS[this.currentStepIndex];
    if (!active) {
      this.status = 'completed';
      this.notify();
      return;
    }

    this.stepElapsedSec += dt;
    if (this.stepElapsedSec >= active.nominalDurationSec) {
      if (this.currentStepIndex < PRODUCTION_STEPS.length - 1) {
        this.currentStepIndex++;
        this.stepElapsedSec = 0;
      } else {
        this.status = 'completed';
        this.currentStepIndex = -1;
        this.stepElapsedSec = 0;
      }
    }
    this.notify();
  }

  subscribe(listener: (state: ProductionCycleState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const st = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(st);
      } catch {
        // Изоляция ошибок подписчиков
      }
    }
  }
}
