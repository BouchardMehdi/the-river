import { Module } from '@nestjs/common';

import { UsersModule } from '../../users/users.module';
import { StatsModule } from '../stats/stats.module';
import { CrashController } from './crash.controller';
import { CrashService } from './crash.service';

@Module({
  imports: [UsersModule, StatsModule],
  controllers: [CrashController],
  providers: [CrashService],
})
export class CrashModule {}
