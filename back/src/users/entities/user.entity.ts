import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn()
  userId: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, unique: true })
  username: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 190, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ type: 'int', default: 1000 })
  credits: number;

  @Column({ type: 'int', default: 0 })
  points: number;

  @Column({ type: 'tinyint', default: 0 })
  emailVerified: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
