import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { StatsService } from '../stats/stats.service';

import {
  isBlack,
  isEven,
  isHigh,
  isLow,
  isOdd,
  isRed,
  columnNumbers,
  dozenNumbers,
  ROULETTE_MAX,
  ROULETTE_MIN,
} from './roulette.constants';

import {
  BetType,
  RouletteBet,
  RouletteSettlementLine,
  RouletteSpinResult,
} from './roulette.types';

type ValidSetKey = string;

@Injectable()
export class RouletteService {
  constructor(
    private readonly usersService: UsersService,
    private readonly statsService: StatsService
  ) {
    this.buildValidInsideBets();
  }

  private readonly payouts: Record<BetType, number> = {
    [BetType.STRAIGHT]: 35,
    [BetType.SPLIT]: 17,
    [BetType.STREET]: 11,
    [BetType.CORNER]: 8,
    [BetType.SIX_LINE]: 5,

    [BetType.DOZEN]: 2,
    [BetType.COLUMN]: 2,

    [BetType.RED]: 1,
    [BetType.BLACK]: 1,
    [BetType.EVEN]: 1,
    [BetType.ODD]: 1,
    [BetType.LOW]: 1,
    [BetType.HIGH]: 1,
  };

  private readonly validSplits = new Set<ValidSetKey>();
  private readonly validStreets = new Set<ValidSetKey>();
  private readonly validCorners = new Set<ValidSetKey>();
  private readonly validSixLines = new Set<ValidSetKey>();

  async soloSpin(username: string, bets: RouletteBet[]) {
    if (!username) throw new UnauthorizedException('Invalid user');
    if (!Array.isArray(bets) || bets.length === 0) throw new BadRequestException('No bets');

    // 1) validate bets
    const normalized = bets.map(b => this.normalizeAndValidateBet(b));
    const totalStaked = normalized.reduce((s, b) => s + b.amount, 0);

    // 2) check user exists + credits
    const user = await this.usersService.findByUsername(username);
    if (!user) throw new UnauthorizedException('User not found');

    const credits = Number(user.credits ?? 0);
    if (!Number.isFinite(credits)) throw new BadRequestException('User credits invalid');

    // 3) debit (DB)
    await this.usersService.debitCreditsByUsername(username, totalStaked);

    // 4) spin
    const result = this.spinWheel();

    // 5) settlement
    const settlement = this.settleSolo(username, normalized, result);

    // 6) credit winnings (DB)
    if (settlement.totalReturn > 0) {
      await this.usersService.creditCreditsByUsername(username, settlement.totalReturn);
    }

    // 7) fetch final balance
    const userAfter = await this.usersService.findByUsername(username);
    const balance = Number(userAfter?.credits ?? 0);

    // 📈 Stats dashboard (gain/perte net)
    const net = (settlement.totalReturn ?? 0) - totalStaked;
    try {
      this.statsService.recordEvent(username, {
        game: 'ROULETTE',
        deltaCredits: net,
        meta: { number: result.number, color: result.color },
      });
    } catch {
      // ignore
    }

    return { result, settlement, balance };
  }

  private spinWheel(): RouletteSpinResult {
    const number = this.randomInt(ROULETTE_MIN, ROULETTE_MAX);
    const color: RouletteSpinResult['color'] =
      number === 0 ? 'GREEN' : (isRed(number) ? 'RED' : 'BLACK');
    return { number, color };
  }

  private settleSolo(username: string, bets: RouletteBet[], result: RouletteSpinResult): RouletteSettlementLine {
    const totalStaked = bets.reduce((s, b) => s + b.amount, 0);

    const winningBets: RouletteSettlementLine['winningBets'] = [];
    let totalProfit = 0;
    let totalReturn = 0;

    for (const bet of bets) {
      const won = this.isWinningBet(bet, result.number);
      if (!won) continue;

      const profit = bet.amount * this.payouts[bet.type];
      const returned = bet.amount + profit;

      totalProfit += profit;
      totalReturn += returned;

      winningBets.push({ bet, profit, returned });
    }

    return {
      playerId: username,
      totalStaked,
      totalProfit,
      totalReturn,
      winningBets,
    };
  }

  private isWinningBet(bet: RouletteBet, n: number): boolean {
    const sel = (bet.selection ?? {}) as any;

    switch (bet.type) {
      case BetType.STRAIGHT:
        return sel.number === n;

      case BetType.SPLIT:
      case BetType.STREET:
      case BetType.CORNER:
      case BetType.SIX_LINE:
        return Array.isArray(sel.numbers) && sel.numbers.includes(n);

      case BetType.DOZEN:
        return dozenNumbers(sel.dozen).includes(n);

      case BetType.COLUMN:
        return columnNumbers(sel.column).includes(n);

      case BetType.RED:
        return isRed(n);
      case BetType.BLACK:
        return isBlack(n);
      case BetType.EVEN:
        return isEven(n);
      case BetType.ODD:
        return isOdd(n);
      case BetType.LOW:
        return isLow(n);
      case BetType.HIGH:
        return isHigh(n);

      default:
        return false;
    }
  }

  // ---------------- validation ----------------

  private normalizeAndValidateBet(bet: RouletteBet): RouletteBet {
    if (!bet || typeof bet !== 'object') throw new BadRequestException('Invalid bet');
    if (!Object.values(BetType).includes(bet.type)) throw new BadRequestException('Invalid bet type');
    if (typeof bet.amount !== 'number' || !Number.isFinite(bet.amount) || bet.amount < 1) {
      throw new BadRequestException('Invalid bet amount');
    }

    const sel = (bet.selection ?? {}) as Record<string, any>;

    switch (bet.type) {
      case BetType.STRAIGHT: {
        const n = sel.number;
        this.assertNumberInRange(n);
        return { type: bet.type, amount: bet.amount, selection: { number: n } };
      }
      case BetType.SPLIT: {
        const nums = sel.numbers;
        this.assertExactNumbersArray(nums, 2);
        this.assertInsideBetKeyIsValid(nums, this.validSplits, 'Invalid split');
        return { type: bet.type, amount: bet.amount, selection: { numbers: [nums[0], nums[1]] } };
      }
      case BetType.STREET: {
        const nums = sel.numbers;
        this.assertExactNumbersArray(nums, 3);
        this.assertInsideBetKeyIsValid(nums, this.validStreets, 'Invalid street');
        return { type: bet.type, amount: bet.amount, selection: { numbers: [nums[0], nums[1], nums[2]] } };
      }
      case BetType.CORNER: {
        const nums = sel.numbers;
        this.assertExactNumbersArray(nums, 4);
        this.assertInsideBetKeyIsValid(nums, this.validCorners, 'Invalid corner');
        return { type: bet.type, amount: bet.amount, selection: { numbers: [nums[0], nums[1], nums[2], nums[3]] } };
      }
      case BetType.SIX_LINE: {
        const nums = sel.numbers;
        this.assertExactNumbersArray(nums, 6);
        this.assertInsideBetKeyIsValid(nums, this.validSixLines, 'Invalid six-line');
        return { type: bet.type, amount: bet.amount, selection: { numbers: [...nums] } };
      }
      case BetType.DOZEN: {
        const d = sel.dozen;
        if (![1, 2, 3].includes(d)) throw new BadRequestException('Invalid dozen (1|2|3)');
        return { type: bet.type, amount: bet.amount, selection: { dozen: d } };
      }
      case BetType.COLUMN: {
        const c = sel.column;
        if (![1, 2, 3].includes(c)) throw new BadRequestException('Invalid column (1|2|3)');
        return { type: bet.type, amount: bet.amount, selection: { column: c } };
      }
      case BetType.RED:
      case BetType.BLACK:
      case BetType.EVEN:
      case BetType.ODD:
      case BetType.LOW:
      case BetType.HIGH:
        return { type: bet.type, amount: bet.amount, selection: {} };

      default:
        throw new BadRequestException('Unsupported bet type');
    }
  }

  private assertNumberInRange(n: any): void {
    if (!Number.isInteger(n) || n < 0 || n > 36) {
      throw new BadRequestException('Number must be an integer between 0 and 36');
    }
  }

  private assertExactNumbersArray(arr: any, len: number): void {
    if (!Array.isArray(arr) || arr.length !== len) {
      throw new BadRequestException(`selection.numbers must be an array of ${len} numbers`);
    }
    for (const x of arr) this.assertNumberInRange(x);
  }

  private keyOf(nums: number[]): ValidSetKey {
    return [...nums].sort((a, b) => a - b).join(',');
  }

  private assertInsideBetKeyIsValid(nums: number[], set: Set<ValidSetKey>, msg: string): void {
    const key = this.keyOf(nums);
    if (!set.has(key)) throw new BadRequestException(msg);
  }

  private buildValidInsideBets(): void {
    const numAt = (row: number, col: number) => row * 3 + (col + 1);

    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 3; col++) {
        const n = numAt(row, col);
        if (col < 2) this.validSplits.add(this.keyOf([n, numAt(row, col + 1)]));
        if (row < 11) this.validSplits.add(this.keyOf([n, numAt(row + 1, col)]));
      }
    }

    for (let row = 0; row < 12; row++) {
      this.validStreets.add(this.keyOf([numAt(row, 0), numAt(row, 1), numAt(row, 2)]));
    }

    for (let row = 0; row < 11; row++) {
      for (let col = 0; col < 2; col++) {
        this.validCorners.add(this.keyOf([
          numAt(row, col),
          numAt(row, col + 1),
          numAt(row + 1, col),
          numAt(row + 1, col + 1),
        ]));
      }
    }

    for (let row = 0; row < 11; row++) {
      this.validSixLines.add(this.keyOf([
        numAt(row, 0), numAt(row, 1), numAt(row, 2),
        numAt(row + 1, 0), numAt(row + 1, 1), numAt(row + 1, 2),
      ]));
    }
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
