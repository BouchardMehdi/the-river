import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('blackjack_games')
@Index('UQ_blackjack_games_tableId', ['tableId'], { unique: true })
export class BlackjackGame {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36 })
  tableId: string;

  @Column({ type: 'longtext' })
  stateJson: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
