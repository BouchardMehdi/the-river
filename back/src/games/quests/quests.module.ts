import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { QuestsService } from './quests.service';
import { QuestsController } from './quests.controller';

import { UserQuestStateEntity } from './entities/user-quest-state.entity';
import { GameEventEntity } from '../stats/entities/game-event.entity';
import { UserEntity } from '../../users/entities/user.entity';

import { UsersModule } from '../../users/users.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserQuestStateEntity,
      GameEventEntity,
      UserEntity, // ✅ FIX ICI
    ]),
    UsersModule, // pour UsersService
    NotificationsModule,
  ],
  providers: [QuestsService],
  controllers: [QuestsController],
  exports: [QuestsService],
})
export class QuestsModule {}
