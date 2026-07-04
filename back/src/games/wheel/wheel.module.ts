import { Module } from '@nestjs/common';

import { UsersModule } from '../../users/users.module';
import { StatsModule } from '../stats/stats.module';
import { WheelController } from './wheel.controller';
import { WheelService } from './wheel.service';

@Module({
  imports: [UsersModule, StatsModule],
  controllers: [WheelController],
  providers: [WheelService],
})
export class WheelModule {}
