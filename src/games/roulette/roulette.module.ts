import { Module } from '@nestjs/common';
import { RouletteController } from './roulette.controller';
import { RouletteService } from './roulette.service';
import { UsersModule } from 'src/users/users.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [UsersModule, StatsModule],
  controllers: [RouletteController],
  providers: [RouletteService],
  exports: [RouletteService],
})
export class RouletteModule {}
