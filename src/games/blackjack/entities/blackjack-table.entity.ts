import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { BlackjackTablePlayer } from './blackjack-table-player.entity';

export type BlackjackTableStatus = 'waiting' | 'in_game' | 'finished';

@Entity('blackjack_tables')
@Index('UQ_blackjack_tables_code', ['code'], { unique: true })
export class BlackjackTable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 6 })
  code: string;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'int', default: 6 })
  maxPlayers: number;

  @Column({ type: 'int' })
  minBet: number;

  @Column({ type: 'int', nullable: true })
  tableMaxBet: number | null;

  @Column({ type: 'varchar', length: 16, default: 'waiting' })
  status: BlackjackTableStatus;

  @Column({ type: 'int' })
  ownerId: number;

  @OneToMany(() => BlackjackTablePlayer, (p) => p.table, { cascade: true })
  players: BlackjackTablePlayer[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
