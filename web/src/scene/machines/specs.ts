import type { EquipmentConfig, MachineKind, MachineStatus } from '@bakery/shared';

export interface MachineSpec {
  /** Высота корпуса, м (до верха без сигнальной колонны). */
  height: number;
  /** Глубина корпуса, м (куда подводить кабель сзади). */
  depth: number;
  /** Радиус кольца статуса на полу. */
  ringRadius: number;
  /** Где стоит сигнальная колонна (относительно центра станка). */
  tower: [number, number, number];
}

export const SPECS: Record<MachineKind, MachineSpec> = {
  mixer: { depth: 1.15, height: 1.6, ringRadius: 0.95, tower: [0.3, 1.62, -0.42] },
  moulder: { depth: 0.75, height: 1.5, ringRadius: 0.85, tower: [0.3, 1.12, 0.22] },
  conveyor: { depth: 0.6, height: 0.95, ringRadius: 1.75, tower: [1.35, 0.93, -0.25] },
  proofer: { depth: 1.05, height: 2.2, ringRadius: 1.05, tower: [0.5, 2.2, 0.3] },
  oven: { depth: 1.6, height: 2.45, ringRadius: 1.25, tower: [0.45, 2.45, 0.55] },
  icemaker: { depth: 0.7, height: 1.2, ringRadius: 0.7, tower: [0.25, 1.2, 0.2] },
  blastfreezer: { depth: 1.05, height: 2.35, ringRadius: 0.9, tower: [-0.3, 2.35, 0.3] },
  coldroom: { depth: 2.0, height: 2.92, ringRadius: 1.75, tower: [-1.15, 2.5, 0.85] },
  packer: { depth: 0.72, height: 1.8, ringRadius: 1.6, tower: [0.55, 1.48, -0.25] },
  silo: { depth: 2.3, height: 4.8, ringRadius: 1.5, tower: [0.95, 4.8, 0.95] },
  hvac: { depth: 2.2, height: 1.8, ringRadius: 2.0, tower: [1.2, 1.8, 0.8] },
  generic: { depth: 0.8, height: 1.2, ringRadius: 0.8, tower: [0.3, 1.2, 0.3] },
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
  eq?: EquipmentConfig;
}
