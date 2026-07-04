import { BadRequestException, Injectable } from '@nestjs/common';

import type { JwtUser } from '../../auth/jwt.strategy';
import { randomInt } from '../../common/random';
import { UsersService } from '../../users/users.service';
import { StatsService } from '../stats/stats.service';

type MinesSession = {
  bet: number;
  createdAt: number;
  mineCells: Set<number>;
  mines: number;
  revealed: Set<number>;
  username: string;
};

@Injectable()
export class MinesService {
  constructor(
    private readonly usersService: UsersService,
    private readonly stats: StatsService,
  ) {}

  private readonly boardSize = 25;
  private readonly houseEdge = 0.96;
  private readonly maxMines = 24;
  private readonly minMines = 1;
  private readonly sessions = new Map<string, MinesSession>();
  private readonly sessionTtlMs = 20 * 60 * 1000;

  private cleanup() {
    const now = Date.now();
    for (const [username, session] of this.sessions.entries()) {
      if (now - session.createdAt > this.sessionTtlMs) {
        this.sessions.delete(username);
      }
    }
  }

  private makeMineCells(mines: number) {
    const cells = new Set<number>();
    while (cells.size < mines) {
      cells.add(randomInt(0, this.boardSize - 1));
    }
    return cells;
  }

  private multiplierFor(mines: number, safeRevealed: number) {
    if (safeRevealed <= 0) return 1;

    let survivalProbability = 1;
    const safeCells = this.boardSize - mines;

    for (let step = 0; step < safeRevealed; step += 1) {
      survivalProbability *= (safeCells - step) / (this.boardSize - step);
    }

    const raw = this.houseEdge / Math.max(survivalProbability, 0.000001);
    return Math.max(1.01, Math.floor(raw * 100) / 100);
  }

  private publicSession(session: MinesSession, extra: Record<string, unknown> = {}) {
    const revealed = [...session.revealed].sort((a, b) => a - b);
    const multiplier = this.multiplierFor(session.mines, revealed.length);
    const potentialPayout = revealed.length > 0 ? Math.floor(session.bet * multiplier) : 0;

    return {
      active: true,
      bet: session.bet,
      boardSize: this.boardSize,
      mines: session.mines,
      multiplier,
      potentialPayout,
      revealed,
      safeLeft: this.boardSize - session.mines - revealed.length,
      ...extra,
    };
  }

  session(user: JwtUser) {
    this.cleanup();
    const existing = this.sessions.get(user.username);
    if (!existing) return { active: false, boardSize: this.boardSize };
    return this.publicSession(existing, { resumed: true });
  }

  async start(user: JwtUser, dto: { bet?: number; mines?: number }) {
    this.cleanup();

    const existing = this.sessions.get(user.username);
    if (existing) return this.publicSession(existing, { resumed: true });

    const bet = Math.trunc(Number(dto?.bet ?? 0));
    const mines = Math.trunc(Number(dto?.mines ?? 3));

    if (!Number.isFinite(bet) || bet <= 0) throw new BadRequestException('INVALID_BET');
    if (!Number.isInteger(mines) || mines < this.minMines || mines > this.maxMines) {
      throw new BadRequestException('INVALID_MINES');
    }

    const dbUser = await this.usersService.findByUsername(user.username);
    if (!dbUser) throw new BadRequestException('USER_NOT_FOUND');

    await this.usersService.debitCreditsByUsername(user.username, bet);

    const session: MinesSession = {
      bet,
      createdAt: Date.now(),
      mineCells: this.makeMineCells(mines),
      mines,
      revealed: new Set<number>(),
      username: user.username,
    };

    this.sessions.set(user.username, session);
    return this.publicSession(session);
  }

  async reveal(user: JwtUser, dto: { cell?: number }) {
    this.cleanup();

    const session = this.sessions.get(user.username);
    if (!session) throw new BadRequestException('NO_ACTIVE_SESSION');

    const cell = Math.trunc(Number(dto?.cell ?? -1));
    if (!Number.isInteger(cell) || cell < 0 || cell >= this.boardSize) {
      throw new BadRequestException('INVALID_CELL');
    }
    if (session.revealed.has(cell)) throw new BadRequestException('CELL_ALREADY_REVEALED');

    if (session.mineCells.has(cell)) {
      this.sessions.delete(user.username);

      await this.stats.recordEvent(user.username, {
        game: 'MINES',
        deltaCredits: -session.bet,
        meta: {
          bet: session.bet,
          cell,
          mines: session.mines,
          mineCells: [...session.mineCells].sort((a, b) => a - b),
          result: 'MINE',
          revealed: [...session.revealed].sort((a, b) => a - b),
        },
      });

      const refreshed = await this.usersService.findByUsername(user.username);
      return {
        active: false,
        bet: session.bet,
        boardSize: this.boardSize,
        cell,
        credits: refreshed?.credits ?? null,
        mineCells: [...session.mineCells].sort((a, b) => a - b),
        mines: session.mines,
        multiplier: this.multiplierFor(session.mines, session.revealed.size),
        net: -session.bet,
        outcome: 'MINE',
        payout: 0,
        revealed: [...session.revealed].sort((a, b) => a - b),
      };
    }

    session.revealed.add(cell);

    const safeCells = this.boardSize - session.mines;
    if (session.revealed.size >= safeCells) {
      return this.cashout(user, { completed: true, lastCell: cell });
    }

    return this.publicSession(session, { cell, outcome: 'SAFE' });
  }

  async cashout(user: JwtUser, meta: { completed?: boolean; lastCell?: number } = {}) {
    this.cleanup();

    const session = this.sessions.get(user.username);
    if (!session) throw new BadRequestException('NO_ACTIVE_SESSION');
    if (session.revealed.size <= 0) throw new BadRequestException('NOTHING_TO_CASHOUT');

    this.sessions.delete(user.username);

    const multiplier = this.multiplierFor(session.mines, session.revealed.size);
    const payout = Math.floor(session.bet * multiplier);
    const net = payout - session.bet;

    await this.usersService.creditCreditsByUsername(user.username, payout);
    await this.stats.recordEvent(user.username, {
      game: 'MINES',
      deltaCredits: net,
      meta: {
        bet: session.bet,
        completed: Boolean(meta.completed),
        lastCell: meta.lastCell,
        mines: session.mines,
        multiplier,
        payout,
        result: 'CASHOUT',
        revealed: [...session.revealed].sort((a, b) => a - b),
      },
    });

    const refreshed = await this.usersService.findByUsername(user.username);

    return {
      active: false,
      bet: session.bet,
      boardSize: this.boardSize,
      completed: Boolean(meta.completed),
      credits: refreshed?.credits ?? null,
      mines: session.mines,
      multiplier,
      net,
      outcome: 'CASHOUT',
      payout,
      revealed: [...session.revealed].sort((a, b) => a - b),
    };
  }
}
