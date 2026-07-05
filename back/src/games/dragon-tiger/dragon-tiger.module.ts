import { Module } from '@nestjs/common';

import { UsersModule } from '../../users/users.module';
import { EasterEggModule } from '../easter-egg/easter-egg.module';
import { StatsModule } from '../stats/stats.module';
import { DragonTigerController } from './dragon-tiger.controller';
import { DragonTigerService } from './dragon-tiger.service';

@Module({
  imports: [UsersModule, StatsModule, EasterEggModule],
  controllers: [DragonTigerController],
  providers: [DragonTigerService],
})
export class DragonTigerModule {}
