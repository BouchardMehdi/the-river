import { Module } from '@nestjs/common';

import { UsersModule } from '../../users/users.module';
import { StatsModule } from '../stats/stats.module';
import { HiLoController } from './hilo.controller';
import { HiLoService } from './hilo.service';

@Module({
  imports: [UsersModule, StatsModule],
  controllers: [HiLoController],
  providers: [HiLoService],
})
export class HiLoModule {}
