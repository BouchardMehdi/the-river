import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersModule } from '../../users/users.module';
import { UserQuestStateEntity } from '../quests/entities/user-quest-state.entity';
import { EasterEggController } from './easter-egg.controller';
import { EasterEggService } from './easter-egg.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserQuestStateEntity]), UsersModule],
  controllers: [EasterEggController],
  providers: [EasterEggService],
  exports: [EasterEggService],
})
export class EasterEggModule {}
