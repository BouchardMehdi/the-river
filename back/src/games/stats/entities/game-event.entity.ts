import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('game_events')
@Index('IDX_game_events_user_createdAt', ['userId', 'createdAt'])
@Index('IDX_game_events_game_createdAt', ['game', 'createdAt'])
export class GameEventEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 32 })
  username: string;

  // ⚠️ indexable => varchar (pas text)
  @Column({ type: 'varchar', length: 16 })
  game: string;

  @Column({ type: 'int', default: 0 })
  deltaCredits: number;

  @Column({ type: 'int', default: 0 })
  deltaPoints: number;

  @Column({ type: 'text', nullable: true })
  metaJson?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
