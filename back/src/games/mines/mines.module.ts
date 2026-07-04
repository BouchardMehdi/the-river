import { Module } from '@nestjs/common';

import { UsersModule } from '../../users/users.module';
import { StatsModule } from '../stats/stats.module';
import { MinesController } from './mines.controller';
import { MinesService } from './mines.service';

@Module({
  imports: [UsersModule, StatsModule],
  controllers: [MinesController],
  providers: [MinesService],
})
export class MinesModule {}
