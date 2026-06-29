import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { BlackjackTable } from './blackjack-table.entity';

@Entity('blackjack_table_players')
@Index('UQ_blackjack_table_players_table_user', ['tableId', 'userId'], { unique: true })
@Index('IDX_blackjack_table_players_tableId', ['tableId'])
@Index('IDX_blackjack_table_players_userId', ['userId'])
export class BlackjackTablePlayer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36 })
  tableId: string;

  @ManyToOne(() => BlackjackTable, (t) => t.players, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tableId' })
  table: BlackjackTable;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 32 })
  username: string;

  @CreateDateColumn()
  joinedAt: Date;
}
