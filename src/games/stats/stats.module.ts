import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GameEventEntity } from './entities/game-event.entity';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { UsersModule } from '../../users/users.module';
import { UserEntity } from '../../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameEventEntity, UserEntity]),
    UsersModule,
  ],
  providers: [StatsService],
  controllers: [StatsController],
  exports: [StatsService],
})
export class StatsModule {}
