import { Column, Entity, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('email_verifications')
@Index(['userId', 'usedAt'])
export class EmailVerificationEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Index()
  @Column({ type: 'varchar', length: 190 })
  email: string;

  // ✅ hash du code (jamais en clair)
  @Column({ type: 'varchar', length: 64 })
  codeHash: string;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
