import { Module } from '@nestjs/common';
import { UsersModule } from '../../users/users.module';
import { StatsModule } from '../stats/stats.module';
import { CrapsController } from './craps.controller';
import { CrapsService } from './craps.service';

@Module({
  imports: [UsersModule, StatsModule],
  controllers: [CrapsController],
  providers: [CrapsService],
})
export class CrapsModule {}
