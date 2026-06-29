import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_quest_states')
@Index('UQ_user_quest_states_user_quest', ['userId', 'questKey'], { unique: true })
export class UserQuestStateEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 64 })
  questKey: string;

  @Column({ type: 'datetime', nullable: true })
  lastClaimedAt: Date | null;
}
