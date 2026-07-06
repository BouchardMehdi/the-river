import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('notification_deliveries')
@Index('UQ_notification_deliveries_user_key', ['userId', 'dedupeKey'], { unique: true })
export class NotificationDeliveryEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 190 })
  dedupeKey: string;

  @Column({ type: 'varchar', length: 80 })
  type: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
