import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

import type { JwtUser } from '../../auth/jwt.strategy';
import { randomFloat } from '../../common/random';
import { UsersService } from '../../users/users.service';
import { StatsService } from '../stats/stats.service';

type PachinkoRisk = 'LOW' | 'MEDIUM' | 'HIGH';

type PachinkoDropDto = {
  bet?: number;
  risk?: string;
  rows?: number;
};

type PachinkoSettleDto = {
  finalSlot?: number;
  ticketId?: string;
};

type PendingPachinkoDrop = {
  bet: number;
  createdAt: number;
  multipliers: number[];
  risk: PachinkoRisk;
  rows: number;
  username: string;
};

@Injectable()
export class PachinkoService {
  constructor(
    private readonly usersService: UsersService,
    private readonly stats: StatsService,
  ) {}

  private readonly payouts: Record<PachinkoRisk, Record<number, number[]>> = {
    LOW: {
      8: [2.4, 1.5, 1.1, 0.8, 0.5, 0.8, 1.1, 1.5, 2.4],
      10: [3, 1.8, 1.25, 1, 0.7, 0.45, 0.7, 1, 1.25, 1.8, 3],
      12: [4, 2.3, 1.6, 1.1, 0.8, 0.55, 0.4, 0.55, 0.8, 1.1, 1.6, 2.3, 4],
    },
    MEDIUM: {
      8: [6, 2.4, 1.3, 0.7, 0.25, 0.7, 1.3, 2.4, 6],
      10: [9, 3.2, 1.6, 0.9, 0.45, 0.2, 0.45, 0.9, 1.6, 3.2, 9],
      12: [14, 5, 2.2, 1.1, 0.55, 0.3, 0.15, 0.3, 0.55, 1.1, 2.2, 5, 14],
    },
    HIGH: {
      8: [16, 4, 1.4, 0.25, 0, 0.25, 1.4, 4, 16],
      10: [28, 7, 2, 0.5, 0.1, 0, 0.1, 0.5, 2, 7, 28],
      12: [50, 12, 3.4, 0.8, 0.2, 0, 0, 0, 0.2, 0.8, 3.4, 12, 50],
    },
  };
  private readonly pendingDrops = new Map<string, PendingPachinkoDrop>();
  private readonly pendingDropTtlMs = 90_000;

  private normalizeRisk(value?: string): PachinkoRisk {
    const risk = String(value ?? 'MEDIUM').toUpperCase();
    if (risk === 'LOW' || risk === 'MEDIUM' || risk === 'HIGH') return risk;
    throw new BadRequestException('INVALID_RISK');
  }

  private normalizeRows(value?: number) {
    const rows = Math.trunc(Number(value ?? 10));
    if (![8, 10, 12].includes(rows)) throw new BadRequestException('INVALID_ROWS');
    return rows;
  }

  private buildPath(rows: number) {
    const path: Array<{ direction: 'L' | 'R'; row: number; slot: number }> = [];
    let slot = 0;

    for (let row = 0; row < rows; row += 1) {
      const direction = randomFloat() < 0.5 ? 'L' : 'R';
      if (direction === 'R') slot += 1;
      path.push({ direction, row, slot });
    }

    return { finalSlot: slot, path };
  }

  private cleanupPendingDrops() {
    const now = Date.now();
    for (const [ticketId, ticket] of this.pendingDrops.entries()) {
      if (now - ticket.createdAt > this.pendingDropTtlMs) {
        this.pendingDrops.delete(ticketId);
      }
    }
  }

  private async settleTicket(username: string, ticket: PendingPachinkoDrop, finalSlot: number) {
    if (!Number.isInteger(finalSlot) || finalSlot < 0 || finalSlot >= ticket.multipliers.length) {
      throw new BadRequestException('INVALID_SLOT');
    }

    const multiplier = ticket.multipliers[finalSlot] ?? 0;
    const payout = Math.floor(ticket.bet * multiplier);
    const net = payout - ticket.bet;

    if (payout > 0) {
      await this.usersService.creditCreditsByUsername(username, payout);
    }

    await this.stats.recordEvent(username, {
      game: 'PACHINKO',
      deltaCredits: net,
      meta: {
        bet: ticket.bet,
        finalSlot,
        multiplier,
        payout,
        risk: ticket.risk,
        rows: ticket.rows,
      },
    });

    const refreshed = await this.usersService.findByUsername(username);

    return {
      ok: true,
      bet: ticket.bet,
      credits: refreshed?.credits ?? null,
      finalSlot,
      multiplier,
      multipliers: ticket.multipliers,
      net,
      payout,
      risk: ticket.risk,
      rows: ticket.rows,
    };
  }

  async start(user: JwtUser, dto: PachinkoDropDto) {
    const bet = Math.trunc(Number(dto?.bet ?? 0));
    if (!Number.isFinite(bet) || bet <= 0) throw new BadRequestException('INVALID_BET');

    const risk = this.normalizeRisk(dto?.risk);
    const rows = this.normalizeRows(dto?.rows);
    const multipliers = this.payouts[risk][rows];

    const dbUser = await this.usersService.findByUsername(user.username);
    if (!dbUser) throw new BadRequestException('USER_NOT_FOUND');

    await this.usersService.debitCreditsByUsername(user.username, bet);

    this.cleanupPendingDrops();
    const ticketId = randomBytes(16).toString('hex');
    this.pendingDrops.set(ticketId, {
      bet,
      createdAt: Date.now(),
      multipliers,
      risk,
      rows,
      username: user.username,
    });

    const refreshed = await this.usersService.findByUsername(user.username);

    return {
      ok: true,
      bet,
      credits: refreshed?.credits ?? null,
      multipliers,
      risk,
      rows,
      ticketId,
    };
  }

  async settle(user: JwtUser, dto: PachinkoSettleDto) {
    const ticketId = String(dto?.ticketId ?? '').trim();
    if (!ticketId) throw new BadRequestException('INVALID_TICKET');

    this.cleanupPendingDrops();
    const ticket = this.pendingDrops.get(ticketId);
    if (!ticket || ticket.username !== user.username) {
      throw new BadRequestException('INVALID_TICKET');
    }

    this.pendingDrops.delete(ticketId);
    const finalSlot = Math.trunc(Number(dto?.finalSlot ?? -1));
    return this.settleTicket(user.username, ticket, finalSlot);
  }

  async drop(user: JwtUser, dto: PachinkoDropDto) {
    const bet = Math.trunc(Number(dto?.bet ?? 0));
    if (!Number.isFinite(bet) || bet <= 0) throw new BadRequestException('INVALID_BET');

    const risk = this.normalizeRisk(dto?.risk);
    const rows = this.normalizeRows(dto?.rows);
    const multipliers = this.payouts[risk][rows];

    const dbUser = await this.usersService.findByUsername(user.username);
    if (!dbUser) throw new BadRequestException('USER_NOT_FOUND');

    await this.usersService.debitCreditsByUsername(user.username, bet);

    const { finalSlot, path } = this.buildPath(rows);
    const settled = await this.settleTicket(user.username, {
      bet,
      createdAt: Date.now(),
      multipliers,
      risk,
      rows,
      username: user.username,
    }, finalSlot);

    return { ...settled, path };
  }
}
