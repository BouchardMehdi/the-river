import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GameEventEntity } from './entities/game-event.entity';
import { UsersService } from '../../users/users.service';
import { UserEntity } from '../../users/entities/user.entity';

export type StatsPeriod = 'day' | 'week' | 'month' | 'year';

export type RecordEventPayload = {
  game: string; // 'POKER' | 'BLACKJACK' | 'ROULETTE' | 'SLOTS'
  deltaCredits: number;
  // optionnel (blackjack/roulette/slots n'envoient pas de points)
  deltaPoints?: number;
  meta?: any;
};

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(GameEventEntity)
    private readonly eventsRepo: Repository<GameEventEntity>,

    // ✅ NEW: pour leaderboard balance (users.credits)
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,

    private readonly usersService: UsersService,
  ) {}

  private clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }

  private periodStart(period: StatsPeriod) {
    const now = new Date();

    if (period === 'day') {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    if (period === 'week') {
      const d = new Date(now);
      const day = d.getDay(); // 0 dimanche
      const diff = day === 0 ? 6 : day - 1; // lundi = start
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    if (period === 'month') {
      const d = new Date(now);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    // year
    const d = new Date(now);
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Compatible avec tous tes appels:
   * recordEvent(username, { game, deltaCredits, deltaPoints?, meta })
   */
  async recordEvent(username: string, payload: RecordEventPayload): Promise<void> {
    const u = await this.usersService.findByUsername(username);
    if (!u) throw new BadRequestException('USER_NOT_FOUND');

    const row = this.eventsRepo.create({
      userId: u.userId,
      username: u.username,
      game: String(payload.game ?? '').trim().toUpperCase(),
      deltaCredits: Math.trunc(Number(payload.deltaCredits ?? 0) || 0),
      deltaPoints: Math.trunc(Number(payload.deltaPoints ?? 0) || 0),
      metaJson: payload.meta ? JSON.stringify(payload.meta) : null,
    });

    await this.eventsRepo.save(row);
  }

  async getRecentEventsByUser(userId: number, limit = 40) {
    const take = this.clamp(Math.floor(Number(limit) || 40), 1, 200);
    return this.eventsRepo.find({
      where: { userId } as any,
      order: { createdAt: 'DESC' },
      take,
    });
  }

  /**
   * Dashboard perf graph:
   * 10 derniers events PAR JEU (10 poker + 10 bj + 10 roulette + 10 slots)
   * + une série POINTS = 10 derniers events de points (deltaPoints != 0)
   */
  async getDashboardPerf(username: string, limit = 10) {
    const u = await this.usersService.findByUsername(username);
    if (!u) throw new BadRequestException('USER_NOT_FOUND');

    const take = this.clamp(Math.floor(Number(limit) || 10), 1, 50);
    const games = ['POKER', 'BLACKJACK', 'ROULETTE', 'SLOTS'] as const;

    const labels = Array.from({ length: take }, (_, i) => `#${i + 1}`);

    const series: Record<string, Array<{ deltaCredits: number; deltaPoints: number }>> = {};
    for (const g of [...games, 'POINTS'] as const) {
      series[g] = labels.map(() => ({ deltaCredits: 0, deltaPoints: 0 }));
    }

    const normalize = (
      rows: GameEventEntity[],
      mapFn: (e: GameEventEntity) => { deltaCredits: number; deltaPoints: number },
    ) => {
      const ordered = [...rows].reverse().map(mapFn); // ancien -> récent
      const pad = Math.max(0, take - ordered.length);
      const padded = [
        ...Array.from({ length: pad }, () => ({ deltaCredits: 0, deltaPoints: 0 })),
        ...ordered,
      ];
      return padded.slice(-take);
    };

    for (const g of games) {
      const rows = await this.eventsRepo.find({
        where: { userId: u.userId, game: g } as any,
        order: { createdAt: 'DESC' },
        take,
      });

      series[g] = normalize(rows, (e) => ({
        deltaCredits: Number(e.deltaCredits || 0),
        deltaPoints: Number(e.deltaPoints || 0),
      }));
    }

    // série points : derniers events points != 0
    const pointPool = await this.eventsRepo.find({
      where: { userId: u.userId } as any,
      order: { createdAt: 'DESC' },
      take: Math.max(80, take * 8),
    });

    const onlyPoints = pointPool
      .filter((e) => Number(e.deltaPoints || 0) !== 0)
      .slice(0, take);

    series.POINTS = normalize(onlyPoints, (e) => ({
      deltaCredits: 0,
      deltaPoints: Number(e.deltaPoints || 0),
    }));

    return { labels, series };
  }

  /**
   * Leaderboard (credits OR points) sur période + filtre jeu/global
   */
  async getLeaderboard(args: {
    metric: 'credits' | 'points';
    period: StatsPeriod;
    game: 'GLOBAL' | string;
    limit?: number;
  }) {
    const take = this.clamp(Math.floor(Number(args.limit) || 10), 1, 100);
    const start = this.periodStart(args.period);

    const sumField = args.metric === 'points' ? 'deltaPoints' : 'deltaCredits';

    const qb = this.eventsRepo
      .createQueryBuilder('e')
      .select('e.username', 'username')
      .addSelect(`SUM(e.${sumField})`, 'value')
      .where('e.createdAt >= :start', { start: start.toISOString() });

    if (args.game && String(args.game).toUpperCase() !== 'GLOBAL') {
      qb.andWhere('e.game = :game', { game: String(args.game).toUpperCase() });
    }

    qb.groupBy('e.username').orderBy('value', 'DESC').limit(take);

    const rows = await qb.getRawMany();

    return rows.map((r: any, idx: number) => ({
      rank: idx + 1,
      username: r.username,
      value: Number(r.value || 0),
    }));
  }

  /**
   * ✅ NEW: Leaderboard "balance" (crédits actuels)
   * GET /dashboard/balance-leaderboard?order=asc|desc&limit=200
   */
  async getBalanceLeaderboard(args: { order: 'asc' | 'desc'; limit?: number }) {
    const take = this.clamp(Math.floor(Number(args.limit) || 200), 1, 500);
    const dir = args.order === 'asc' ? 'ASC' : 'DESC';

    const rows = await this.usersRepo.find({
      select: {
        username: true,
        credits: true,
      } as any,
      order: {
        credits: dir as any,
      },
      take,
    });

    return rows.map((u, idx) => ({
      rank: idx + 1,
      username: (u as any).username,
      value: Number((u as any).credits ?? 0),
    }));
  }
}
