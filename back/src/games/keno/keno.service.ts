import { BadRequestException, Injectable } from '@nestjs/common';

import type { JwtUser } from '../../auth/jwt.strategy';
import { shuffleInPlace } from '../../common/random';
import { UsersService } from '../../users/users.service';
import { StatsService } from '../stats/stats.service';

const PAYTABLE: Record<number, Record<number, number>> = {
  1: { 1: 3 },
  2: { 1: 1, 2: 9 },
  3: { 2: 2, 3: 16 },
  4: { 2: 1, 3: 4, 4: 40 },
  5: { 3: 2, 4: 10, 5: 100 },
  6: { 3: 1, 4: 4, 5: 40, 6: 300 },
  7: { 3: 1, 4: 3, 5: 20, 6: 100, 7: 700 },
  8: { 4: 2, 5: 10, 6: 50, 7: 250, 8: 1500 },
  9: { 4: 1, 5: 5, 6: 25, 7: 150, 8: 1000, 9: 5000 },
  10: { 0: 1, 5: 2, 6: 15, 7: 80, 8: 500, 9: 2500, 10: 10000 },
};

@Injectable()
export class KenoService {
  constructor(
    private readonly usersService: UsersService,
    private readonly stats: StatsService,
  ) {}

  private readonly drawCount = 20;
  private readonly maxNumber = 80;
  private readonly maxPicks = 10;
  private readonly minPicks = 1;

  rules() {
    return {
      drawCount: this.drawCount,
      maxNumber: this.maxNumber,
      maxPicks: this.maxPicks,
      minPicks: this.minPicks,
      paytable: PAYTABLE,
    };
  }

  private sanitizePicks(picks?: number[]) {
    if (!Array.isArray(picks)) throw new BadRequestException('INVALID_PICKS');

    const clean = picks.map((pick) => Math.trunc(Number(pick)));
    if (clean.length < this.minPicks || clean.length > this.maxPicks) {
      throw new BadRequestException('INVALID_PICK_COUNT');
    }

    const unique = new Set(clean);
    if (unique.size !== clean.length) throw new BadRequestException('DUPLICATE_PICK');

    for (const pick of clean) {
      if (!Number.isInteger(pick) || pick < 1 || pick > this.maxNumber) {
        throw new BadRequestException('INVALID_PICK');
      }
    }

    return clean.sort((a, b) => a - b);
  }

  private drawNumbers() {
    const drawOrder = shuffleInPlace(Array.from({ length: this.maxNumber }, (_, index) => index + 1)).slice(
      0,
      this.drawCount,
    );
    return {
      draw: [...drawOrder].sort((a, b) => a - b),
      drawOrder,
    };
  }

  async play(user: JwtUser, dto: { bet?: number; picks?: number[] }) {
    const bet = Math.trunc(Number(dto?.bet ?? 0));
    if (!Number.isFinite(bet) || bet <= 0) throw new BadRequestException('INVALID_BET');

    const picks = this.sanitizePicks(dto?.picks);
    const dbUser = await this.usersService.findByUsername(user.username);
    if (!dbUser) throw new BadRequestException('USER_NOT_FOUND');

    await this.usersService.debitCreditsByUsername(user.username, bet);

    const { draw, drawOrder } = this.drawNumbers();
    const drawSet = new Set(draw);
    const hits = picks.filter((pick) => drawSet.has(pick));
    const spotCount = picks.length;
    const multiplier = PAYTABLE[spotCount]?.[hits.length] ?? 0;
    const payout = Math.floor(bet * multiplier);
    const net = payout - bet;

    if (payout > 0) {
      await this.usersService.creditCreditsByUsername(user.username, payout);
    }

    await this.stats.recordEvent(user.username, {
      game: 'KENO',
      deltaCredits: net,
      meta: {
        bet,
        draw,
        drawOrder,
        hits,
        multiplier,
        payout,
        picks,
        spotCount,
      },
    });

    const refreshed = await this.usersService.findByUsername(user.username);

    return {
      bet,
      credits: refreshed?.credits ?? null,
      draw,
      drawOrder,
      hits,
      multiplier,
      net,
      payout,
      picks,
      spotCount,
    };
  }
}
