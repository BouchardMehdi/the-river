import { BadRequestException, Injectable } from '@nestjs/common';

import type { JwtUser } from '../../auth/jwt.strategy';
import { shuffleInPlace } from '../../common/random';
import { UsersService } from '../../users/users.service';
import { StatsService } from '../stats/stats.service';

export type BaccaratBet = 'PLAYER' | 'BANKER' | 'TIE';
type BaccaratSide = 'PLAYER' | 'BANKER';

type BaccaratCard = {
  rank: string;
  suit: string;
  value: number;
};

const suits = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

@Injectable()
export class BaccaratService {
  constructor(
    private readonly usersService: UsersService,
    private readonly stats: StatsService,
  ) {}

  private cardValue(rank: string) {
    if (rank === 'A') return 1;
    if (['10', 'J', 'Q', 'K'].includes(rank)) return 0;
    return Number(rank);
  }

  private createShoe() {
    const shoe: BaccaratCard[] = [];

    for (let deck = 0; deck < 8; deck += 1) {
      for (const suit of suits) {
        for (const rank of ranks) {
          shoe.push({ rank, suit, value: this.cardValue(rank) });
        }
      }
    }

    return shuffleInPlace(shoe);
  }

  private total(cards: BaccaratCard[]) {
    return cards.reduce((sum, card) => sum + card.value, 0) % 10;
  }

  private shouldBankerDraw(bankerTotal: number, playerThird?: BaccaratCard) {
    if (!playerThird) return bankerTotal <= 5;
    if (bankerTotal <= 2) return true;
    if (bankerTotal === 3) return playerThird.value !== 8;
    if (bankerTotal === 4) return playerThird.value >= 2 && playerThird.value <= 7;
    if (bankerTotal === 5) return playerThird.value >= 4 && playerThird.value <= 7;
    if (bankerTotal === 6) return playerThird.value === 6 || playerThird.value === 7;
    return false;
  }

  private resolveRound() {
    const shoe = this.createShoe();
    const player: BaccaratCard[] = [];
    const banker: BaccaratCard[] = [];
    const dealOrder: Array<{ side: BaccaratSide; card: BaccaratCard }> = [];

    const draw = (side: BaccaratSide) => {
      const card = shoe.pop();
      if (!card) throw new BadRequestException('SHOE_EMPTY');
      if (side === 'PLAYER') player.push(card);
      else banker.push(card);
      dealOrder.push({ side, card });
      return card;
    };

    draw('PLAYER');
    draw('BANKER');
    draw('PLAYER');
    draw('BANKER');

    let playerTotal = this.total(player);
    let bankerTotal = this.total(banker);
    const natural = playerTotal >= 8 || bankerTotal >= 8;
    let playerThird: BaccaratCard | undefined;

    if (!natural) {
      if (playerTotal <= 5) {
        playerThird = draw('PLAYER');
        playerTotal = this.total(player);
      }

      if (this.shouldBankerDraw(bankerTotal, playerThird)) {
        draw('BANKER');
        bankerTotal = this.total(banker);
      }
    }

    const winner: BaccaratBet =
      playerTotal > bankerTotal ? 'PLAYER' : bankerTotal > playerTotal ? 'BANKER' : 'TIE';

    return {
      banker,
      bankerTotal,
      dealOrder,
      natural,
      player,
      playerTotal,
      winner,
    };
  }

  private payoutFor(bet: number, betOn: BaccaratBet, winner: BaccaratBet) {
    if (winner === 'TIE') {
      if (betOn === 'TIE') return bet * 9;
      return bet;
    }

    if (betOn !== winner) return 0;
    if (betOn === 'BANKER') return Math.floor(bet * 1.95);
    return bet * 2;
  }

  async play(user: JwtUser, dto: { bet?: number; betOn?: BaccaratBet }) {
    const bet = Math.trunc(Number(dto?.bet ?? 0));
    if (!Number.isFinite(bet) || bet <= 0) throw new BadRequestException('INVALID_BET');

    const betOn = String(dto?.betOn ?? '').toUpperCase() as BaccaratBet;
    if (!['PLAYER', 'BANKER', 'TIE'].includes(betOn)) throw new BadRequestException('INVALID_BET_ON');

    const dbUser = await this.usersService.findByUsername(user.username);
    if (!dbUser) throw new BadRequestException('USER_NOT_FOUND');

    await this.usersService.debitCreditsByUsername(user.username, bet);

    const round = this.resolveRound();
    const payout = this.payoutFor(bet, betOn, round.winner);
    const net = payout - bet;

    if (payout > 0) {
      await this.usersService.creditCreditsByUsername(user.username, payout);
    }

    await this.stats.recordEvent(user.username, {
      game: 'BACCARAT',
      deltaCredits: net,
      meta: {
        bet,
        betOn,
        payout,
        ...round,
      },
    });

    const refreshed = await this.usersService.findByUsername(user.username);

    return {
      bet,
      betOn,
      credits: refreshed?.credits ?? null,
      net,
      payout,
      ...round,
    };
  }
}
