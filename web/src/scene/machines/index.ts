import type { ComponentType } from 'react';
import type { MachineKind } from '@bakery/shared';
import { BlastFreezer } from './BlastFreezer';
import { ColdRoom } from './ColdRoom';
import { Conveyor } from './Conveyor';
import { Generic } from './Generic';
import { IceMaker } from './IceMaker';
import { Mixer } from './Mixer';
import { Moulder } from './Moulder';
import { Oven } from './Oven';
import { Proofer } from './Proofer';
import type { BodyProps } from './specs';

/** Процедурные формы по kind. Новый тип станка — добавить компонент сюда и в specs.ts. */
export const BODIES: Record<MachineKind, ComponentType<BodyProps>> = {
  mixer: Mixer,
  moulder: Moulder,
  conveyor: Conveyor,
  proofer: Proofer,
  oven: Oven,
  icemaker: IceMaker,
  blastfreezer: BlastFreezer,
  coldroom: ColdRoom,
  generic: Generic,
};

export { SPECS } from './specs';
export type { BodyProps, MachineLive } from './specs';
