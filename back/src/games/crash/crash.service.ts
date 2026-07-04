import { BadRequestException, Injectable } from '@nestjs/common';

import type { JwtUser } from '../../auth/jwt.strategy';
import { randomFloat } from '../../common/random';
import { UsersService } from '../../users/users.service';
import { StatsService } from '../stats/stats.service';

type CrashSession = {
  bet: number;
  crashAt: number;
  crashPoint: number;
  createdAt: number;
  timeout: ReturnType<typeof setTimeout>;
  username: string;
};

@Injectable()
export class CrashService {
  constructor(
    private readonly usersService: UsersService,
    private readonly stats: StatsService,
  ) {}

  private readonly growthMs = 6500;
  private readonly houseEdge = 0.96;
  private readonly maxCrashPoint = 100;
  private readonly sessions = new Map<string, CrashSession>();

  private multiplierAt(createdAt: number, now = Date.now()) {
    const elapsed = Math.max(0, now - createdAt);
    return Math.max(1, Math.floor(Math.exp(elapsed / this.growthMs) * 100) / 100);
  }

  private crashPoint() {
    const roll = Math.max(0.000001, randomFloat());
    const point = this.houseEdge / Math.max(0.000001, 1 - roll);
    return Math.max(1, Math.min(this.maxCrashPoint, Math.floor(point * 100) / 100));
  }

  private crashDelayMs(crashPoint: number) {
    return Math.max(350, Math.ceil(Math.log(Math.max(1.01, crashPoint)) * this.growthMs));
  }

  private publicSession(session: CrashSession, extra: Record<string, unknown> = {}) {
    const currentMultiplier = Math.min(session.crashPoint, this.multiplierAt(session.createdAt));
    return {
      active: Date.now() < session.crashAt,
      bet: session.bet,
      currentMultiplier,
      elapsedMs: Math.max(0, Date.now() - session.createdAt),
      potentialPayout: Math.floor(session.bet * currentMultiplier),
      startedAt: session.createdAt,
      ...extra,
    };
  }

  private async settleLoss(username: string, reason = 'CRASH') {
    const session = this.sessions.get(username);
    if (!session) return { active: false };

    clearTimeout(session.timeout);
    this.sessions.delete(username);

    await this.stats.recordEvent(username, {
      game: 'CRASH',
      deltaCredits: -session.bet,
      meta: {
        bet: session.bet,
        crashPoint: session.crashPoint,
        payout: 0,
        reason,
        result: 'CRASH',
      },
    });

    const refreshed = await this.usersService.findByUsername(username);

    return {
      active: false,
      bet: session.bet,
      crashPoint: session.crashPoint,
      credits: refreshed?.credits ?? null,
      multiplier: session.crashPoint,
      net: -session.bet,
      outcome: 'CRASH',
      payout: 0,
    };
  }

  async session(user: JwtUser) {
    const existing = this.sessions.get(user.username);
    if (!existing) return { active: false };
    if (Date.now() >= existing.crashAt) return this.settleLoss(user.username, 'SESSION_CHECK');
    return this.publicSession(existing, { resumed: true });
  }

  async start(user: JwtUser, dto: { bet?: number }) {
    const existing = this.sessions.get(user.username);
    if (existing) {
      if (Date.now() < existing.crashAt) return this.publicSession(existing, { resumed: true });
      await this.settleLoss(user.username, 'RESTART_AFTER_CRASH');
    }

    const bet = Math.trunc(Number(dto?.bet ?? 0));
    if (!Number.isFinite(bet) || bet <= 0) throw new BadRequestException('INVALID_BET');

    const dbUser = await this.usersService.findByUsername(user.username);
    if (!dbUser) throw new BadRequestException('USER_NOT_FOUND');

    await this.usersService.debitCreditsByUsername(user.username, bet);

    const crashPoint = this.crashPoint();
    const createdAt = Date.now();
    const crashAt = createdAt + this.crashDelayMs(crashPoint);
    const timeout = setTimeout(() => {
      void this.settleLoss(user.username, 'AUTO_TIMER');
    }, Math.max(0, crashAt - createdAt + 50));

    const session: CrashSession = {
      bet,
      crashAt,
      crashPoint,
      createdAt,
      timeout,
      username: user.username,
    };

    this.sessions.set(user.username, session);
    return this.publicSession(session);
  }

  async cashout(user: JwtUser) {
    const session = this.sessions.get(user.username);
    if (!session) throw new BadRequestException('NO_ACTIVE_SESSION');

    if (Date.now() >= session.crashAt) return this.settleLoss(user.username, 'CASHOUT_TOO_LATE');

    clearTimeout(session.timeout);
    this.sessions.delete(user.username);

    const multiplier = this.multiplierAt(session.createdAt);
    const payout = Math.floor(session.bet * multiplier);
    const net = payout - session.bet;

    await this.usersService.creditCreditsByUsername(user.username, payout);
    await this.stats.recordEvent(user.username, {
      game: 'CRASH',
      deltaCredits: net,
      meta: {
        bet: session.bet,
        crashPoint: session.crashPoint,
        multiplier,
        payout,
        result: 'CASHOUT',
      },
    });

    const refreshed = await this.usersService.findByUsername(user.username);

    return {
      active: false,
      bet: session.bet,
      crashPoint: session.crashPoint,
      credits: refreshed?.credits ?? null,
      multiplier,
      net,
      outcome: 'CASHOUT',
      payout,
    };
  }
}
