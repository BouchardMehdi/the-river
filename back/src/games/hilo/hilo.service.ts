import { BadRequestException, Injectable } from '@nestjs/common';

import type { JwtUser } from '../../auth/jwt.strategy';
import { randomInt } from '../../common/random';
import { UsersService } from '../../users/users.service';
import { StatsService } from '../stats/stats.service';

type HiLoGuess = 'HIGHER' | 'LOWER';
type CardSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
type CardRank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

type HiLoCard = {
  rank: CardRank;
  suit: CardSuit;
  value: number;
};

type HiLoSession = {
  bet: number;
  currentCard: HiLoCard;
  createdAt: number;
  history: Array<{
    guess: HiLoGuess;
    nextCard: HiLoCard;
    outcome: 'WIN' | 'LOSE' | 'PUSH';
  }>;
  multiplier: number;
  streak: number;
  username: string;
};

@Injectable()
export class HiLoService {
  constructor(
    private readonly usersService: UsersService,
    private readonly stats: StatsService,
  ) {}

  private readonly sessions = new Map<string, HiLoSession>();
  private readonly sessionTtlMs = 20 * 60 * 1000;
  private readonly suits: CardSuit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
  private readonly ranks: CardRank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  private readonly multipliers = [1.22, 1.55, 1.95, 2.5, 3.2, 4.1, 5.35, 7, 9.25, 12.5, 17, 23];

  private cleanup() {
    const now = Date.now();
    for (const [username, session] of this.sessions.entries()) {
      if (now - session.createdAt > this.sessionTtlMs) {
        this.sessions.delete(username);
      }
    }
  }

  private cardValue(rank: CardRank) {
    if (rank === 'A') return 14;
    if (rank === 'K') return 13;
    if (rank === 'Q') return 12;
    if (rank === 'J') return 11;
    return Number(rank);
  }

  private drawCard(): HiLoCard {
    const rank = this.ranks[randomInt(0, this.ranks.length - 1)];
    const suit = this.suits[randomInt(0, this.suits.length - 1)];
    return { rank, suit, value: this.cardValue(rank) };
  }

  private publicSession(session: HiLoSession, resumed = false) {
    const potentialPayout = Math.floor(session.bet * session.multiplier);

    return {
      active: true,
      bet: session.bet,
      currentCard: session.currentCard,
      history: session.history.slice(-8),
      multiplier: session.multiplier,
      potentialPayout,
      resumed,
      streak: session.streak,
    };
  }

  session(user: JwtUser) {
    this.cleanup();
    const existing = this.sessions.get(user.username);
    if (!existing) return { active: false };
    return this.publicSession(existing);
  }

  async start(user: JwtUser, dto: { bet?: number }) {
    this.cleanup();

    const existing = this.sessions.get(user.username);
    if (existing) return this.publicSession(existing, true);

    const bet = Math.trunc(Number(dto?.bet ?? 0));
    if (!Number.isFinite(bet) || bet <= 0) throw new BadRequestException('INVALID_BET');

    const dbUser = await this.usersService.findByUsername(user.username);
    if (!dbUser) throw new BadRequestException('USER_NOT_FOUND');

    await this.usersService.debitCreditsByUsername(user.username, bet);

    const session: HiLoSession = {
      bet,
      createdAt: Date.now(),
      currentCard: this.drawCard(),
      history: [],
      multiplier: 1,
      streak: 0,
      username: user.username,
    };

    this.sessions.set(user.username, session);
    return this.publicSession(session);
  }

  async guess(user: JwtUser, dto: { guess?: string }) {
    this.cleanup();

    const session = this.sessions.get(user.username);
    if (!session) throw new BadRequestException('NO_ACTIVE_SESSION');

    const guess = String(dto?.guess ?? '').toUpperCase() as HiLoGuess;
    if (guess !== 'HIGHER' && guess !== 'LOWER') throw new BadRequestException('INVALID_GUESS');

    const previousCard = session.currentCard;
    const nextCard = this.drawCard();
    let outcome: 'WIN' | 'LOSE' | 'PUSH' = 'PUSH';

    if (nextCard.value > previousCard.value) outcome = guess === 'HIGHER' ? 'WIN' : 'LOSE';
    else if (nextCard.value < previousCard.value) outcome = guess === 'LOWER' ? 'WIN' : 'LOSE';

    session.history.push({ guess, nextCard, outcome });
    session.currentCard = nextCard;

    if (outcome === 'LOSE') {
      this.sessions.delete(user.username);
      await this.stats.recordEvent(user.username, {
        game: 'HILO',
        deltaCredits: -session.bet,
        meta: {
          bet: session.bet,
          history: session.history,
          result: 'LOSE',
          streak: session.streak,
        },
      });

      const refreshed = await this.usersService.findByUsername(user.username);
      return {
        active: false,
        bet: session.bet,
        credits: refreshed?.credits ?? null,
        currentCard: nextCard,
        history: session.history.slice(-8),
        multiplier: session.multiplier,
        net: -session.bet,
        outcome,
        payout: 0,
        previousCard,
        streak: session.streak,
      };
    }

    if (outcome === 'WIN') {
      session.streak += 1;
      session.multiplier = this.multipliers[Math.min(session.streak - 1, this.multipliers.length - 1)];
    }

    return {
      ...this.publicSession(session),
      outcome,
      previousCard,
    };
  }

  async cashout(user: JwtUser) {
    this.cleanup();

    const session = this.sessions.get(user.username);
    if (!session) throw new BadRequestException('NO_ACTIVE_SESSION');
    if (session.streak <= 0) throw new BadRequestException('NOTHING_TO_CASHOUT');

    this.sessions.delete(user.username);

    const payout = Math.floor(session.bet * session.multiplier);
    const net = payout - session.bet;

    await this.usersService.creditCreditsByUsername(user.username, payout);
    await this.stats.recordEvent(user.username, {
      game: 'HILO',
      deltaCredits: net,
      meta: {
        bet: session.bet,
        history: session.history,
        multiplier: session.multiplier,
        payout,
        result: 'CASHOUT',
        streak: session.streak,
      },
    });

    const refreshed = await this.usersService.findByUsername(user.username);

    return {
      active: false,
      bet: session.bet,
      credits: refreshed?.credits ?? null,
      currentCard: session.currentCard,
      history: session.history.slice(-8),
      multiplier: session.multiplier,
      net,
      outcome: 'CASHOUT',
      payout,
      streak: session.streak,
    };
  }
}
