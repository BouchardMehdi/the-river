import { Controller, Get, Query } from '@nestjs/common';
import { UsersService } from '../../../users/users.service';
import { StatsService } from '../../stats/stats.service';
import type { StatsPeriod } from '../../stats/stats.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(
    private readonly usersService: UsersService,
    private readonly stats: StatsService,
  ) {}

  // ✅ Leaderboard points (existant)
  // GET /leaderboard?limit=50
  @Get()
  async getLeaderboard(@Query('limit') limit?: string) {
    return this.usersService.getLeaderboard(limit ? Number(limit) : 50);
  }

  // ✅ Leaderboard crédits gagnés
  // GET /leaderboard/credits?period=week&game=GLOBAL&limit=10
  @Get('credits')
  async getCreditsLeaderboard(
    @Query('period') period?: StatsPeriod,
    @Query('game') game?: string,
    @Query('limit') limit?: string,
  ) {
    const p: StatsPeriod =
      period === 'day' || period === 'week' || period === 'month' || period === 'year'
        ? period
        : 'week';

    const g = game ? String(game).toUpperCase() : 'GLOBAL';
    const n = limit ? Number(limit) : 10;

    return this.stats.getLeaderboard({
      metric: 'credits',
      period: p,
      game: g,
      limit: n,
    });
  }
}
