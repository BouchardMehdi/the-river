import { Module } from '@nestjs/common';

import { UsersModule } from '../../users/users.module';
import { StatsModule } from '../stats/stats.module';
import { PachinkoController } from './pachinko.controller';
import { PachinkoService } from './pachinko.service';

@Module({
  imports: [UsersModule, StatsModule],
  controllers: [PachinkoController],
  providers: [PachinkoService],
})
export class PachinkoModule {}
