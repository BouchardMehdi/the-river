import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('slot_spins')
@Index('IDX_slot_spins_userId', ['userId'])
export class SlotSpinEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 16 })
  machine: string;

  @Column({ type: 'int' })
  spins: number;

  @Column({ type: 'int' })
  totalCost: number;

  @Column({ type: 'int' })
  totalPayout: number;

  @Column({ type: 'int' })
  net: number;

  // ✅ compatible avec ton service (tableau d'objets)
  // ⚠️ pas de default (MySQL + TEXT/BLOB)
  @Column({ type: 'simple-json' })
  results: any;

  @CreateDateColumn()
  createdAt: Date;
}
