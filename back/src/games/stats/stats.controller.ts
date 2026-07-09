import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtUser } from '../../auth/jwt.strategy';

import { StatsService } from './stats.service';
import type { DashboardLeaderboardMetric, StatsPeriod } from './stats.service';

@Controller()
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /**
   * GET /dashboard/summary?period=week&limit=12
   */
  @UseGuards(JwtAuthGuard)
  @Get('dashboard/summary')
  async dashboardSummary(
    @CurrentUser() user: JwtUser,
    @Query('period') period?: StatsPeriod,
    @Query('limit') limit?: string,
  ) {
    const p: StatsPeriod =
      period === 'day' || period === 'week' || period === 'month' || period === 'year'
        ? period
        : 'week';
    const n = limit ? Number(limit) : 12;

    return this.stats.getDashboardSummary(user.username, p, n);
  }

  /**
   * GET /dashboard/perf?limit=10
   */
  @UseGuards(JwtAuthGuard)
  @Get('dashboard/perf')
  async dashboardPerf(
    @CurrentUser() user: JwtUser,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? Number(limit) : 10;
    return this.stats.getDashboardPerf(user.username, n);
  }

  /**
   * GET /dashboard/leaderboard?metric=credits&period=week&game=GLOBAL&limit=10
   */
  @Get('dashboard/leaderboard')
  async dashboardLeaderboard(
    @Query('metric') metric?: 'credits' | 'points',
    @Query('period') period?: StatsPeriod,
    @Query('game') game?: string,
    @Query('limit') limit?: string,
  ) {
    const m = metric === 'points' ? 'points' : 'credits';

    const p: StatsPeriod =
      period === 'day' || period === 'week' || period === 'month' || period === 'year'
        ? period
        : 'week';

    const g = game ? String(game).toUpperCase() : 'GLOBAL';
    const n = limit ? Number(limit) : 10;

    return this.stats.getLeaderboard({
      metric: m,
      period: p,
      game: g,
      limit: n,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('dashboard/global-leaderboard')
  async dashboardGlobalLeaderboard(
    @CurrentUser() user: JwtUser,
    @Query('metric') metric?: DashboardLeaderboardMetric,
    @Query('limit') limit?: string,
  ) {
    const m: DashboardLeaderboardMetric =
      metric === 'points' || metric === 'score' || metric === 'credits' ? metric : 'credits';
    const n = limit ? Number(limit) : 10;

    return this.stats.getDashboardGlobalLeaderboard({
      metric: m,
      username: user.username,
      limit: n,
    });
  }

  /**
   * ✅ NEW
   * GET /dashboard/balance-leaderboard?order=asc|desc&limit=200
   *
   * Leaderboard "balance" = crédits actuels (users.credits)
   * - pas de period
   * - pas de game
   */
  @Get('dashboard/balance-leaderboard')
  async balanceLeaderboard(
    @Query('order') order?: 'asc' | 'desc',
    @Query('limit') limit?: string,
  ) {
    const o = order === 'asc' ? 'asc' : 'desc';
    const n = limit ? Number(limit) : 200;
    return this.stats.getBalanceLeaderboard({ order: o, limit: n });
  }
}
