import { BadRequestException, Injectable } from '@nestjs/common';

import type { JwtUser } from '../../auth/jwt.strategy';
import { randomInt } from '../../common/random';
import { UsersService } from '../../users/users.service';
import { StatsService } from '../stats/stats.service';

type CrapsBetType =
  | 'PASS_LINE'
  | 'DONT_PASS'
  | 'FIELD'
  | 'ANY_SEVEN'
  | 'ANY_CRAPS'
  | 'YO'
  | 'EXACT_TOTAL'
  | 'HARDWAY';

type CrapsBetDto = {
  amount: number;
  target?: number;
  type: CrapsBetType;
};

type SettledCrapsBet = CrapsBetDto & {
  label: string;
  net: number;
  outcome: 'win' | 'lose' | 'push';
  payout: number;
};

@Injectable()
export class CrapsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly stats: StatsService,
  ) {}

  private rollDie(): number {
    return randomInt(1, 6);
  }

  private normalizeBets(dto: { bets?: CrapsBetDto[]; guessTotal?: number; bet?: number }) {
    if (Array.isArray(dto?.bets) && dto.bets.length > 0) return dto.bets;

    return [
      {
        amount: Number(dto?.bet),
        target: Number(dto?.guessTotal),
        type: 'EXACT_TOTAL' as const,
      },
    ];
  }

  private betLabel(bet: CrapsBetDto) {
    if (bet.type === 'PASS_LINE') return 'Pass line';
    if (bet.type === 'DONT_PASS') return "Don't pass";
    if (bet.type === 'FIELD') return 'Field';
    if (bet.type === 'ANY_SEVEN') return 'Any 7';
    if (bet.type === 'ANY_CRAPS') return 'Any craps';
    if (bet.type === 'YO') return 'Yo 11';
    if (bet.type === 'HARDWAY') return `Hard ${bet.target}`;
    return `Total ${bet.target}`;
  }

  private exactTotalOdds(total: number) {
    if (total === 2 || total === 12) return 30;
    if (total === 3 || total === 11) return 15;
    if (total === 4 || total === 10) return 7;
    if (total === 5 || total === 9) return 6;
    if (total === 6 || total === 8) return 6;
    return 4;
  }

  private settleBet(bet: CrapsBetDto, dice: number[], total: number): SettledCrapsBet {
    const amount = Math.trunc(Number(bet.amount ?? 0) || 0);
    const target = bet.target === undefined ? undefined : Math.trunc(Number(bet.target));
    const hardwayHit = dice[0] === dice[1] && total === target;

    let outcome: SettledCrapsBet['outcome'] = 'lose';
    let odds = 0;

    if (bet.type === 'PASS_LINE') {
      if (total === 7 || total === 11) {
        outcome = 'win';
        odds = 1;
      } else if (![2, 3, 12].includes(total)) {
        outcome = 'push';
      }
    } else if (bet.type === 'DONT_PASS') {
      if (total === 2 || total === 3) {
        outcome = 'win';
        odds = 1;
      } else if (total === 12 || ![7, 11].includes(total)) {
        outcome = 'push';
      }
    } else if (bet.type === 'FIELD') {
      if ([2, 3, 4, 9, 10, 11, 12].includes(total)) {
        outcome = 'win';
        odds = total === 2 || total === 12 ? 2 : 1;
      }
    } else if (bet.type === 'ANY_SEVEN') {
      if (total === 7) {
        outcome = 'win';
        odds = 4;
      }
    } else if (bet.type === 'ANY_CRAPS') {
      if ([2, 3, 12].includes(total)) {
        outcome = 'win';
        odds = 7;
      }
    } else if (bet.type === 'YO') {
      if (total === 11) {
        outcome = 'win';
        odds = 15;
      }
    } else if (bet.type === 'HARDWAY') {
      if (![4, 6, 8, 10].includes(Number(target))) throw new BadRequestException('INVALID_HARDWAY_TARGET');
      if (hardwayHit) {
        outcome = 'win';
        odds = target === 4 || target === 10 ? 7 : 9;
      }
    } else if (bet.type === 'EXACT_TOTAL') {
      if (!Number.isFinite(target) || Number(target) < 2 || Number(target) > 12) {
        throw new BadRequestException('INVALID_GUESS_TOTAL');
      }
      if (total === target) {
        outcome = 'win';
        odds = this.exactTotalOdds(total);
      }
    }

    const payout = outcome === 'win' ? amount * (odds + 1) : outcome === 'push' ? amount : 0;

    return {
      ...bet,
      amount,
      label: this.betLabel({ ...bet, target }),
      net: payout - amount,
      outcome,
      payout,
      target,
    };
  }

  async play(user: JwtUser, dto: { bets?: CrapsBetDto[]; guessTotal?: number; bet?: number }) {
    const bets = this.normalizeBets(dto).map((bet) => ({
      amount: Math.trunc(Number(bet.amount ?? 0) || 0),
      target: bet.target === undefined ? undefined : Math.trunc(Number(bet.target)),
      type: String(bet.type ?? '').toUpperCase() as CrapsBetType,
    }));

    if (bets.length < 1 || bets.length > 12) throw new BadRequestException('INVALID_BETS');

    const allowedTypes: CrapsBetType[] = [
      'PASS_LINE',
      'DONT_PASS',
      'FIELD',
      'ANY_SEVEN',
      'ANY_CRAPS',
      'YO',
      'EXACT_TOTAL',
      'HARDWAY',
    ];

    for (const bet of bets) {
      if (!allowedTypes.includes(bet.type)) throw new BadRequestException('INVALID_BET_TYPE');
      if (!Number.isFinite(bet.amount) || bet.amount <= 0) throw new BadRequestException('INVALID_BET');
    }

    const dbUser = await this.usersService.findByUsername(user.username);
    if (!dbUser) throw new BadRequestException('USER_NOT_FOUND');

    const totalBet = bets.reduce((sum, bet) => sum + bet.amount, 0);
    await this.usersService.debitCreditsByUsername(user.username, totalBet);

    const d1 = this.rollDie();
    const d2 = this.rollDie();
    const total = d1 + d2;

    const results = bets.map((bet) => this.settleBet(bet, [d1, d2], total));
    const payout = results.reduce((sum, bet) => sum + bet.payout, 0);
    const net = payout - totalBet;

    if (payout > 0) {
      await this.usersService.creditCreditsByUsername(user.username, payout);
    }

    await this.stats.recordEvent(user.username, {
      game: 'CRAPS',
      deltaCredits: net,
      meta: {
        bets: results,
        dice: [d1, d2],
        total,
        totalBet,
      },
    });

    const refreshed = await this.usersService.findByUsername(user.username);

    return {
      ok: true,
      credits: refreshed?.credits ?? null,
      dice: [d1, d2],
      net,
      payout,
      results,
      total,
      totalBet,
      win: net > 0,
    };
  }
}
