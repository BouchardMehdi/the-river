import { BadRequestException, Injectable } from '@nestjs/common';

import type { JwtUser } from '../../auth/jwt.strategy';
import { randomFloat } from '../../common/random';
import { UsersService } from '../../users/users.service';
import { StatsService } from '../stats/stats.service';

type WheelSegment = {
  color: string;
  label: string;
  multiplier: number;
  weight: number;
};

const SEGMENTS: WheelSegment[] = [
  { color: '#ff625a', label: '0x', multiplier: 0, weight: 14 },
  { color: '#8ad8ff', label: '1.2x', multiplier: 1.2, weight: 12 },
  { color: '#f1d28a', label: '2x', multiplier: 2, weight: 7 },
  { color: '#1de59d', label: '1.5x', multiplier: 1.5, weight: 10 },
  { color: '#ff625a', label: '0.5x', multiplier: 0.5, weight: 13 },
  { color: '#d8a84f', label: '5x', multiplier: 5, weight: 3 },
  { color: '#8ad8ff', label: '1x', multiplier: 1, weight: 13 },
  { color: '#a58cff', label: '3x', multiplier: 3, weight: 5 },
  { color: '#ff625a', label: '0x', multiplier: 0, weight: 14 },
  { color: '#1de59d', label: '1.8x', multiplier: 1.8, weight: 8 },
  { color: '#f1d28a', label: '10x', multiplier: 10, weight: 2 },
  { color: '#8ad8ff', label: '1.2x', multiplier: 1.2, weight: 12 },
  { color: '#ff625a', label: '0.5x', multiplier: 0.5, weight: 13 },
  { color: '#d8a84f', label: '20x', multiplier: 20, weight: 1 },
  { color: '#1de59d', label: '2.5x', multiplier: 2.5, weight: 6 },
  { color: '#f1d28a', label: '50x', multiplier: 50, weight: 0.35 },
];

@Injectable()
export class WheelService {
  constructor(
    private readonly usersService: UsersService,
    private readonly stats: StatsService,
  ) {}

  config() {
    return {
      segments: SEGMENTS.map(({ color, label, multiplier }) => ({ color, label, multiplier })),
    };
  }

  private pickSegment() {
    const totalWeight = SEGMENTS.reduce((sum, segment) => sum + segment.weight, 0);
    let cursor = randomFloat() * totalWeight;

    for (let index = 0; index < SEGMENTS.length; index += 1) {
      cursor -= SEGMENTS[index].weight;
      if (cursor <= 0) return { index, segment: SEGMENTS[index] };
    }

    return { index: SEGMENTS.length - 1, segment: SEGMENTS[SEGMENTS.length - 1] };
  }

  async spin(user: JwtUser, dto: { bet?: number }) {
    const bet = Math.trunc(Number(dto?.bet ?? 0));
    if (!Number.isFinite(bet) || bet <= 0) throw new BadRequestException('INVALID_BET');

    const dbUser = await this.usersService.findByUsername(user.username);
    if (!dbUser) throw new BadRequestException('USER_NOT_FOUND');

    await this.usersService.debitCreditsByUsername(user.username, bet);

    const { index, segment } = this.pickSegment();
    const payout = Math.floor(bet * segment.multiplier);
    const net = payout - bet;

    if (payout > 0) {
      await this.usersService.creditCreditsByUsername(user.username, payout);
    }

    await this.stats.recordEvent(user.username, {
      game: 'WHEEL',
      deltaCredits: net,
      meta: {
        bet,
        payout,
        segment: {
          color: segment.color,
          index,
          label: segment.label,
          multiplier: segment.multiplier,
        },
      },
    });

    const refreshed = await this.usersService.findByUsername(user.username);

    return {
      bet,
      credits: refreshed?.credits ?? null,
      net,
      payout,
      segment: {
        color: segment.color,
        index,
        label: segment.label,
        multiplier: segment.multiplier,
      },
      segments: this.config().segments,
    };
  }
}
