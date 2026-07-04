import { Module } from '@nestjs/common';

import { UsersModule } from '../../users/users.module';
import { StatsModule } from '../stats/stats.module';
import { KenoController } from './keno.controller';
import { KenoService } from './keno.service';

@Module({
  imports: [UsersModule, StatsModule],
  controllers: [KenoController],
  providers: [KenoService],
})
export class KenoModule {}
