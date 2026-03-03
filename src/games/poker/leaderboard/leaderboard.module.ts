import { Module } from '@nestjs/common';
import { UsersModule } from '../../../users/users.module';
import { LeaderboardController } from './leaderboard.controller';
import { StatsModule } from '../../stats/stats.module';

@Module({
  imports: [UsersModule, StatsModule],
  controllers: [LeaderboardController],
})
export class LeaderboardModule {}
