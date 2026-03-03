import { IsIn, IsInt, Min } from 'class-validator';

export type SlotMachineType = 'SLOT_3X3' | 'SLOT_3X5' | 'SLOT_5X5';

export class SpinSlotsDto {
  @IsIn(['SLOT_3X3', 'SLOT_3X5', 'SLOT_5X5'])
  machine: SlotMachineType;

  /**
   * SLOT_3X3 : 1 ou 10
   * SLOT_3X5 : 1 ou 10
   * SLOT_5X5 : 1 ou 10
   */
  @IsInt()
  @Min(1)
  spins: number;
}
