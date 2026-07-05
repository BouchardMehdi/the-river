import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import type { JwtUser } from '../../auth/jwt.strategy';
import { shuffleInPlace } from '../../common/random';
import { UsersService } from '../../users/users.service';
import { EasterEggService } from '../easter-egg/easter-egg.service';
import { StatsService } from '../stats/stats.service';

export type DragonTigerBet = 'DRAGON' | 'TIGER' | 'TIE';

type DragonTigerCard = {
  rank: string;
  suit: string;
  value: number;
};

const suits = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

@Injectable()
export class DragonTigerService {
  constructor(
    private readonly usersService: UsersService,
    private readonly stats: StatsService,
    private readonly easterEgg: EasterEggService,
  ) {}

  private cardValue(rank: string) {
    if (rank === 'A') return 1;
    if (rank === 'J') return 11;
    if (rank === 'Q') return 12;
    if (rank === 'K') return 13;
    return Number(rank);
  }

  private createShoe() {
    const shoe: DragonTigerCard[] = [];

    for (let deck = 0; deck < 6; deck += 1) {
      for (const suit of suits) {
        for (const rank of ranks) {
          shoe.push({ rank, suit, value: this.cardValue(rank) });
        }
      }
    }

    return shuffleInPlace(shoe);
  }

  private payoutFor(bet: number, betOn: DragonTigerBet, winner: DragonTigerBet) {
    if (winner === 'TIE') {
      if (betOn === 'TIE') return bet * 9;
      return bet;
    }

    if (betOn !== winner) return 0;
    return bet * 2;
  }

  async play(user: JwtUser, dto: { bet?: number; betOn?: DragonTigerBet }) {
    const status = await this.easterEgg.getStatus(user.userId);
    if (!status.unlocked) throw new ForbiddenException('DRAGON_INVITATION_REQUIRED');

    const bet = Math.trunc(Number(dto?.bet ?? 0));
    if (!Number.isFinite(bet) || bet <= 0) throw new BadRequestException('INVALID_BET');

    const betOn = String(dto?.betOn ?? '').toUpperCase() as DragonTigerBet;
    if (!['DRAGON', 'TIGER', 'TIE'].includes(betOn)) throw new BadRequestException('INVALID_BET_ON');

    const dbUser = await this.usersService.findByUsername(user.username);
    if (!dbUser) throw new BadRequestException('USER_NOT_FOUND');

    await this.usersService.debitCreditsByUsername(user.username, bet);

    const shoe = this.createShoe();
    const dragon = shoe.pop();
    const tiger = shoe.pop();
    if (!dragon || !tiger) throw new BadRequestException('SHOE_EMPTY');

    const winner: DragonTigerBet =
      dragon.value > tiger.value ? 'DRAGON' : tiger.value > dragon.value ? 'TIGER' : 'TIE';
    const payout = this.payoutFor(bet, betOn, winner);
    const net = payout - bet;

    if (payout > 0) {
      await this.usersService.creditCreditsByUsername(user.username, payout);
    }

    await this.stats.recordEvent(user.username, {
      game: 'DRAGON_TIGER',
      deltaCredits: net,
      meta: {
        bet,
        betOn,
        dragon,
        payout,
        tiger,
        winner,
      },
    });

    const refreshed = await this.usersService.findByUsername(user.username);

    return {
      bet,
      betOn,
      credits: refreshed?.credits ?? null,
      dragon,
      net,
      payout,
      tiger,
      winner,
    };
  }
}
