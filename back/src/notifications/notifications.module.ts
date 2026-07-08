import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationDeliveryEntity } from './entities/notification-delivery.entity';
import { PushSubscriptionEntity } from './entities/push-subscription.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([PushSubscriptionEntity, NotificationDeliveryEntity]), SettingsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
