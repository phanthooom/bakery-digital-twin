import type { MachineKind, MachineStatus } from '@bakery/shared';

export interface MachineSpec {
  /** Высота корпуса, м (до верха без сигнальной колонны). */
  height: number;
  /** Радиус кольца статуса на полу. */
  ringRadius: number;
  /** Где стоит сигнальная колонна (относительно центра станка). */
  tower: [number, number, number];
}

export const SPECS: Record<MachineKind, MachineSpec> = {
  mixer: { height: 1.6, ringRadius: 0.95, tower: [0.3, 1.62, -0.42] },
  moulder: { height: 1.5, ringRadius: 0.85, tower: [0.3, 1.12, 0.22] },
  conveyor: { height: 0.95, ringRadius: 1.75, tower: [1.35, 0.93, -0.25] },
  proofer: { height: 2.2, ringRadius: 1.05, tower: [0.5, 2.2, 0.3] },
  oven: { height: 2.45, ringRadius: 1.25, tower: [0.45, 2.45, 0.55] },
  icemaker: { height: 1.2, ringRadius: 0.7, tower: [0.25, 1.2, 0.2] },
  blastfreezer: { height: 2.35, ringRadius: 0.9, tower: [-0.3, 2.35, 0.3] },
  coldroom: { height: 2.92, ringRadius: 1.75, tower: [-1.15, 2.5, 0.85] },
  generic: { height: 1.2, ringRadius: 0.8, tower: [0.3, 1.2, 0.3] },
};

/** Живые данные, которые нужны процедурной модели для анимации. */
export interface MachineLive {
  status: MachineStatus;
  powerKw: number;
  /** 0…1+ — доля номинала */
  load: number;
  statusColor: string;
}

export interface BodyProps {
  live: MachineLive;
}
