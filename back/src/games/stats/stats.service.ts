import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

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

  private normalizeGame(game: string) {
    const key = String(game ?? '').trim().toUpperCase();
    if (key.includes('SLOT')) return 'SLOTS';
    if (key.includes('ROULETTE')) return 'ROULETTE';
    if (key.includes('POKER')) return 'POKER';
    if (key.includes('BLACKJACK')) return 'BLACKJACK';
    if (key.includes('CRAPS')) return 'CRAPS';
    if (key.includes('PACHINKO')) return 'PACHINKO';
    if (key.includes('HILO') || key.includes('HI_LO') || key.includes('HI-LO')) return 'HILO';
    if (key.includes('MINES')) return 'MINES';
    if (key.includes('KENO')) return 'KENO';
    if (key.includes('BACCARAT')) return 'BACCARAT';
    if (key.includes('WHEEL')) return 'WHEEL';
    if (key.includes('CRASH')) return 'CRASH';
    if (key.includes('DRAGON') || key.includes('TIGER')) return 'DRAGON_TIGER';
    return key || 'CASINO';
  }

  private parseMeta(metaJson?: string | null) {
    if (!metaJson) return null;

    try {
      return JSON.parse(metaJson);
    } catch {
      return null;
    }
  }

  private getDashboardStart(period: StatsPeriod) {
    const now = new Date();
    const d = new Date(now);

    if (period === 'day') d.setHours(d.getHours() - 24);
    else if (period === 'week') d.setDate(d.getDate() - 7);
    else if (period === 'month') d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);

    return d;
  }

  private getChartBucketCount(period: StatsPeriod) {
    if (period === 'day') return 12;
    if (period === 'week') return 14;
    if (period === 'month') return 15;
    return 18;
  }

  getPeriodStart(period: StatsPeriod) {
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

  async getDashboardSummary(username: string, period: StatsPeriod = 'week', limit = 12) {
    const u = await this.usersService.findByUsername(username);
    if (!u) throw new BadRequestException('USER_NOT_FOUND');

    const take = this.clamp(Math.floor(Number(limit) || 12), 1, 80);
    const start = this.getDashboardStart(period);
    const now = new Date();

    const rows = await this.eventsRepo
      .createQueryBuilder('e')
      .where('e.userId = :userId', { userId: u.userId })
      .andWhere('e.createdAt >= :start', { start: start.toISOString() })
      .orderBy('e.createdAt', 'DESC')
      .getMany();

    const byGame = new Map<
      string,
      { events: number; gains: number; losses: number; net: number; volume: number }
    >();

    let gains = 0;
    let losses = 0;

    for (const row of rows) {
      const delta = Number(row.deltaCredits || 0);
      const key = this.normalizeGame(row.game);
      const current = byGame.get(key) ?? {
        events: 0,
        gains: 0,
        losses: 0,
        net: 0,
        volume: 0,
      };

      current.events += 1;
      current.gains += delta > 0 ? delta : 0;
      current.losses += delta < 0 ? Math.abs(delta) : 0;
      current.net += delta;
      current.volume += Math.abs(delta);
      byGame.set(key, current);

      gains += delta > 0 ? delta : 0;
      losses += delta < 0 ? Math.abs(delta) : 0;
    }

    const volume = gains + losses;
    const net = gains - losses;

    const serializeEvent = (row: GameEventEntity) => ({
      id: row.id,
      userId: row.userId,
      username: row.username,
      game: this.normalizeGame(row.game),
      deltaCredits: Number(row.deltaCredits || 0),
      deltaPoints: Number(row.deltaPoints || 0),
      meta: this.parseMeta(row.metaJson),
      createdAt: row.createdAt,
    });

    const bucketCount = this.getChartBucketCount(period);
    const startTime = start.getTime();
    const endTime = Math.max(now.getTime(), startTime + 1);
    const bucketSize = Math.max(1, Math.ceil((endTime - startTime) / bucketCount));
    const chart = Array.from({ length: bucketCount }, (_, index) => {
      const bucketStart = new Date(startTime + index * bucketSize);
      const bucketEnd = new Date(Math.min(endTime, startTime + (index + 1) * bucketSize));
      return {
        start: bucketStart,
        end: bucketEnd,
        gains: 0,
        losses: 0,
        net: 0,
        volume: 0,
        byGame: {
          SLOTS: 0,
          ROULETTE: 0,
          POKER: 0,
          BLACKJACK: 0,
          CRAPS: 0,
          PACHINKO: 0,
          HILO: 0,
          MINES: 0,
          KENO: 0,
          BACCARAT: 0,
          WHEEL: 0,
          CRASH: 0,
        } as Record<string, number>,
      };
    });

    for (const row of rows) {
      const eventTime = new Date(row.createdAt).getTime();
      const index = this.clamp(Math.floor((eventTime - startTime) / bucketSize), 0, bucketCount - 1);
      const delta = Number(row.deltaCredits || 0);
      const bucket = chart[index];
      bucket.gains += delta > 0 ? delta : 0;
      bucket.losses += delta < 0 ? Math.abs(delta) : 0;
      bucket.net += delta;
      bucket.volume += Math.abs(delta);

      const key = this.normalizeGame(row.game);
      if (key in bucket.byGame) bucket.byGame[key] += delta;
    }

    return {
      period,
      startedAt: start,
      balance: Number((u as any).credits ?? 0),
      totals: {
        events: rows.length,
        gains,
        losses,
        net,
        performance: volume > 0 ? (net / volume) * 100 : 0,
        volume,
      },
      byGame: Array.from(byGame.entries()).map(([game, totals]) => ({
        game,
        ...totals,
        share: volume > 0 ? (totals.volume / volume) * 100 : 0,
      })),
      recent: rows.slice(0, take).map(serializeEvent),
      chart,
    };
  }

  async getGameEventsByUsername(username: string, game: string, since?: Date) {
    const u = await this.usersService.findByUsername(username);
    if (!u) throw new BadRequestException('USER_NOT_FOUND');

    const qb = this.eventsRepo
      .createQueryBuilder('e')
      .where('e.userId = :userId', { userId: u.userId })
      .andWhere('e.game = :game', { game: String(game).toUpperCase() });

    if (since) {
      qb.andWhere('e.createdAt >= :since', { since: since.toISOString() });
    }

    return qb.orderBy('e.createdAt', 'ASC').getMany();
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
    const start = this.getPeriodStart(args.period);

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
    const usernames = rows.map((row: any) => String(row.username ?? '')).filter(Boolean);
    const avatarUsers = usernames.length
      ? await this.usersRepo.find({
          select: ['username', 'avatarUrl'],
          where: { username: In(usernames) } as any,
        })
      : [];
    const avatars = new Map(avatarUsers.map((user) => [user.username, user.avatarUrl ?? null]));

    return rows.map((r: any, idx: number) => ({
      rank: idx + 1,
      username: r.username,
      avatarUrl: avatars.get(r.username) ?? null,
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
        avatarUrl: true,
      } as any,
      order: {
        credits: dir as any,
      },
      take,
    });

    return rows.map((u, idx) => ({
      rank: idx + 1,
      username: (u as any).username,
      avatarUrl: (u as any).avatarUrl ?? null,
      value: Number((u as any).credits ?? 0),
    }));
  }
}
