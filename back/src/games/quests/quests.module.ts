import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { QuestsService } from './quests.service';
import { QuestsController } from './quests.controller';

import { UserQuestStateEntity } from './entities/user-quest-state.entity';
import { GameEventEntity } from '../stats/entities/game-event.entity';
import { UserEntity } from '../../users/entities/user.entity';

import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserQuestStateEntity,
      GameEventEntity,
      UserEntity, // ✅ FIX ICI
    ]),
    UsersModule, // pour UsersService
  ],
  providers: [QuestsService],
  controllers: [QuestsController],
  exports: [QuestsService],
})
export class QuestsModule {}
