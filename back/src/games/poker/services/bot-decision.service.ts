import { Injectable } from '@nestjs/common';
import type { ActionType, PokerTableInternal } from '../domain/table.types';
import type { Card } from './deck.service';
import { HandEvaluatorService } from './hand-evaluator.service';
import { BotProfile, BotService } from './bot.service';
import { HandRank } from '../domain/hand-rank';
import { randomFloat } from '../../../common/random';

export type BotDecision = {
  action: ActionType;
  amount?: number;
};

type ProfileConfig = {
  looseness: number;
  aggression: number;
  bluff: number;
  trap: number;
  riskTolerance: number;
  foldDiscipline: number;
};

type DrawInfo = {
  flushDraw: boolean;
  straightDraw: boolean;
  overcards: number;
  equityBoost: number;
  callBonus: number;
  raiseBonus: number;
};

const PROFILE_CONFIG: Record<BotProfile, ProfileConfig> = {
  TIGHT_AGGRESSIVE: {
    looseness: 0.28,
    aggression: 0.75,
    bluff: 0.28,
    trap: 0.14,
    riskTolerance: 0.48,
    foldDiscipline: 0.75,
  },
  LOOSE_AGGRESSIVE: {
    looseness: 0.78,
    aggression: 0.86,
    bluff: 0.48,
    trap: 0.08,
    riskTolerance: 0.72,
    foldDiscipline: 0.38,
  },
  TIGHT_PASSIVE: {
    looseness: 0.22,
    aggression: 0.24,
    bluff: 0.08,
    trap: 0.22,
    riskTolerance: 0.34,
    foldDiscipline: 0.86,
  },
  LOOSE_PASSIVE: {
    looseness: 0.68,
    aggression: 0.32,
    bluff: 0.14,
    trap: 0.18,
    riskTolerance: 0.58,
    foldDiscipline: 0.46,
  },
  BALANCED: {
    looseness: 0.48,
    aggression: 0.52,
    bluff: 0.22,
    trap: 0.12,
    riskTolerance: 0.52,
    foldDiscipline: 0.58,
  },
};

@Injectable()
export class BotDecisionService {
  constructor(
    private readonly botService: BotService,
    private readonly handEval: HandEvaluatorService,
  ) {}

  decide(table: PokerTableInternal, botId: string): BotDecision {
    const profile = this.botService.getBotProfile(table.id, botId);
    const config = PROFILE_CONFIG[profile];
    const stack = Number(table.stacks?.[botId] ?? 0);
    if (stack <= 0) return { action: 'CHECK' };

    const hole = (table.hands?.[botId] ?? []) as Card[];
    const board = (table.communityCards ?? []) as Card[];
    const myBet = Number(table.bets?.[botId] ?? 0);
    const currentBet = Number(table.currentBet ?? 0);
    const toCall = Math.max(0, currentBet - myBet);

    const activePlayers = this.activePlayers(table);
    const opponents = Math.max(0, activePlayers.length - 1);
    const humanOpponents = activePlayers.filter((pid) => pid !== botId && !this.botService.isBotId(pid));
    const tableAggression = this.botService.tableAggression(table.id, humanOpponents);

    const rawStrength = board.length === 0 || (table.phase as any) === 'PRE_FLOP'
      ? this.preflopStrength(hole)
      : this.postflopStrength(hole, board);
    const draw = this.drawPotential(hole, board);
    const position = this.positionScore(table, botId, activePlayers);
    const boardWetness = this.boardWetness(board);
    const multiwayPenalty = Math.min(0.16, opponents * 0.035);
    const aggressionAdjustment = tableAggression > 0.55 ? -0.04 : tableAggression < 0.22 ? 0.035 : 0;
    const looseAdjustment = (config.looseness - 0.5) * 0.12;

    const strength = this.clamp01(
      rawStrength +
        draw.equityBoost +
        position +
        looseAdjustment +
        aggressionAdjustment -
        multiwayPenalty +
        this.profileNoise(profile),
    );

    if (toCall > 0) {
      return this.decideFacingBet({
        table,
        botId,
        profile,
        config,
        strength,
        draw,
        boardWetness,
        stack,
        toCall,
        currentBet,
      });
    }

    return this.decideOpenAction({
      table,
      botId,
      profile,
      config,
      strength,
      draw,
      boardWetness,
      stack,
      position,
    });
  }

  private decideFacingBet(args: {
    table: PokerTableInternal;
    botId: string;
    profile: BotProfile;
    config: ProfileConfig;
    strength: number;
    draw: DrawInfo;
    boardWetness: number;
    stack: number;
    toCall: number;
    currentBet: number;
  }): BotDecision {
    const { table, botId, profile, config, strength, draw, boardWetness, stack, toCall, currentBet } = args;
    const bb = Math.max(1, Number(table.bigBlindAmount ?? 10));
    const pot = Math.max(0, Number(table.pot ?? 0));
    const potOdds = toCall / Math.max(1, pot + toCall);
    const stackPressure = toCall / Math.max(1, stack);
    const scaryBoardPenalty = boardWetness * (0.08 + config.foldDiscipline * 0.05);
    const callScore = strength + draw.callBonus + config.riskTolerance * 0.1 - potOdds * 0.62 - stackPressure * 0.18 - scaryBoardPenalty;
    const raiseScore = strength + draw.raiseBonus + config.aggression * 0.13 - potOdds * 0.22;

    if (strength >= 0.78) {
      const trapChance = config.trap * (1 - boardWetness * 0.5);
      if (randomFloat() > trapChance && randomFloat() < 0.32 + config.aggression * 0.42) {
        return this.raiseOrAllIn(table, botId, stack, this.pickRaiseIncrement(bb, currentBet, pot, stack, strength, profile));
      }
      return this.callOrAllIn(stack, toCall);
    }

    if (raiseScore >= 0.69 && randomFloat() < config.aggression * 0.38) {
      return this.raiseOrAllIn(table, botId, stack, this.pickRaiseIncrement(bb, currentBet, pot, stack, strength, profile));
    }

    const semiBluffSpot = (draw.flushDraw || draw.straightDraw) && potOdds < 0.3 && randomFloat() < config.bluff;
    if (semiBluffSpot && stack > toCall + bb && randomFloat() < config.aggression) {
      return this.raiseOrAllIn(table, botId, stack, this.pickRaiseIncrement(bb, currentBet, pot, stack, strength, profile));
    }

    const callThreshold = config.looseness > 0.6 ? 0.22 : 0.31;
    if (callScore >= callThreshold || (draw.callBonus > 0.08 && potOdds <= 0.24)) {
      return this.callOrAllIn(stack, toCall);
    }

    if (toCall <= Math.max(bb, Math.floor(pot * 0.08)) && randomFloat() < config.riskTolerance) {
      return this.callOrAllIn(stack, toCall);
    }

    return { action: 'FOLD' };
  }

  private decideOpenAction(args: {
    table: PokerTableInternal;
    botId: string;
    profile: BotProfile;
    config: ProfileConfig;
    strength: number;
    draw: DrawInfo;
    boardWetness: number;
    stack: number;
    position: number;
  }): BotDecision {
    const { table, profile, config, strength, draw, boardWetness, stack, position } = args;
    const bb = Math.max(1, Number(table.bigBlindAmount ?? 10));
    const pot = Math.max(0, Number(table.pot ?? 0));
    const phase = String(table.phase ?? 'PRE_FLOP');
    const valueThreshold = phase === 'PRE_FLOP' ? 0.62 - config.looseness * 0.08 : 0.56 - config.aggression * 0.05;
    const stealSpot = position > 0.045 && pot <= bb * 4 && randomFloat() < config.bluff * 0.72;
    const semiBluff = (draw.flushDraw || draw.straightDraw) && randomFloat() < config.bluff * (0.75 + boardWetness * 0.35);

    if (strength >= valueThreshold) {
      return this.betOrAllIn(stack, this.pickBetSize(bb, pot, stack, strength, profile, phase));
    }

    if (semiBluff && stack > bb * 2) {
      return this.betOrAllIn(stack, this.pickBetSize(bb, pot, stack, Math.max(0.42, strength), profile, phase));
    }

    if (stealSpot) {
      return this.betOrAllIn(stack, this.pickBetSize(bb, pot, stack, 0.45, profile, phase));
    }

    if (strength >= 0.43 && randomFloat() < config.aggression * 0.18) {
      return this.betOrAllIn(stack, Math.max(bb, Math.floor(this.pickBetSize(bb, pot, stack, strength, profile, phase) * 0.72)));
    }

    return { action: 'CHECK' };
  }

  private callOrAllIn(stack: number, toCall: number): BotDecision {
    if (toCall <= 0) return { action: 'CHECK' };
    if (toCall >= stack) return { action: 'ALL_IN' };
    return { action: 'CALL' };
  }

  private betOrAllIn(stack: number, amount: number): BotDecision {
    const bet = Math.max(1, Math.floor(amount));
    if (bet >= stack) return { action: 'ALL_IN' };
    return { action: 'BET', amount: bet };
  }

  private raiseOrAllIn(table: PokerTableInternal, botId: string, stack: number, raiseIncrement: number): BotDecision {
    const inc = Math.max(1, Math.floor(raiseIncrement));
    const myBet = Number(table.bets?.[botId] ?? 0);
    const currentBet = Number(table.currentBet ?? 0);
    const toPay = Math.max(0, currentBet + inc - myBet);
    if (toPay >= stack) return { action: 'ALL_IN' };
    return { action: 'RAISE', amount: inc };
  }

  private pickBetSize(bb: number, pot: number, stack: number, strength: number, profile: BotProfile, phase: string): number {
    const config = PROFILE_CONFIG[profile];
    const preflop = phase === 'PRE_FLOP';
    const base = preflop ? bb * (2.2 + config.aggression * 0.9) : Math.max(bb, pot * (0.36 + strength * 0.35 + config.aggression * 0.12));
    const jitter = 0.88 + randomFloat() * 0.24;
    return Math.min(stack, Math.max(bb, Math.floor(base * jitter)));
  }

  private pickRaiseIncrement(
    bb: number,
    currentBet: number,
    pot: number,
    stack: number,
    strength: number,
    profile: BotProfile,
  ): number {
    const config = PROFILE_CONFIG[profile];
    const base = Math.max(
      bb,
      currentBet * (0.55 + config.aggression * 0.28),
      pot * (0.18 + strength * 0.22),
    );
    const jitter = 0.85 + randomFloat() * 0.3;
    return Math.min(stack, Math.max(bb, Math.floor(base * jitter)));
  }

  private preflopStrength(hole: Card[]): number {
    if (!hole || hole.length < 2) return 0;

    const a = hole[0];
    const b = hole[1];
    const va = this.rankToValue(a.rank);
    const vb = this.rankToValue(b.rank);
    const high = Math.max(va, vb);
    const low = Math.min(va, vb);
    const suited = a.suit === b.suit;
    const pair = va === vb;
    const gap = Math.abs(va - vb);

    if (pair) return this.clamp01(0.42 + (high - 2) * (0.53 / 12));

    let s = 0.08;
    if (high === 14) s += 0.18 + low * 0.012;
    if (high >= 13 && low >= 10) s += 0.3;
    else if (high >= 11 && low >= 10) s += 0.22;
    if (suited) s += 0.08;
    if (gap === 1) s += 0.1;
    else if (gap === 2) s += 0.06;
    else if (gap >= 5) s -= 0.1;
    if (low <= 5 && gap >= 4 && high !== 14) s -= 0.08;
    s += (high - 2) * (0.24 / 12);

    return this.clamp01(s);
  }

  private postflopStrength(hole: Card[], board: Card[]): number {
    const cards = [...(hole ?? []), ...(board ?? [])].filter(Boolean);
    if (cards.length < 5) return 0.24;

    const best = this.bestOfN(cards);
    const rank = best.rank;
    const boardOnly = board.length >= 5 ? this.bestOfN(board) : null;
    const boardPlays = boardOnly ? this.handEval.compareScores(best, boardOnly) === 0 : false;

    let strength = 0.26;
    if (rank <= HandRank.FULL) strength = 0.93;
    else if (rank <= HandRank.SUITE) strength = 0.8;
    else if (rank <= HandRank.DOUBLE_PAIRE) strength = 0.64;
    else if (rank <= HandRank.PAIRE) strength = 0.46;

    if (boardPlays) strength -= 0.12;
    if (board.length === 3 && strength >= 0.64) strength += 0.04;
    if (board.length === 5 && strength <= 0.46) strength -= 0.04;

    return this.clamp01(strength);
  }

  private drawPotential(hole: Card[], board: Card[]): DrawInfo {
    const cards = [...(hole ?? []), ...(board ?? [])].filter(Boolean);
    if (cards.length < 4 || board.length >= 5) {
      return { flushDraw: false, straightDraw: false, overcards: 0, equityBoost: 0, callBonus: 0, raiseBonus: 0 };
    }

    const suitCounts = cards.reduce<Record<string, number>>((acc, card) => {
      acc[card.suit] = (acc[card.suit] ?? 0) + 1;
      return acc;
    }, {});
    const flushDraw = Math.max(0, ...Object.values(suitCounts)) >= 4;
    const values = Array.from(new Set(cards.map((card) => this.rankToValue(card.rank)).flatMap((v) => (v === 14 ? [14, 1] : [v])))).sort((a, b) => a - b);
    let straightDraw = false;
    for (let start = 1; start <= 10; start += 1) {
      const window = [start, start + 1, start + 2, start + 3, start + 4];
      const hits = window.filter((v) => values.includes(v)).length;
      if (hits >= 4) straightDraw = true;
    }

    const boardHigh = Math.max(0, ...(board ?? []).map((card) => this.rankToValue(card.rank)));
    const overcards = (hole ?? []).filter((card) => this.rankToValue(card.rank) > boardHigh).length;
    const equityBoost = (flushDraw ? 0.08 : 0) + (straightDraw ? 0.07 : 0) + overcards * 0.025;
    const callBonus = (flushDraw ? 0.1 : 0) + (straightDraw ? 0.08 : 0) + overcards * 0.015;
    const raiseBonus = (flushDraw ? 0.08 : 0) + (straightDraw ? 0.06 : 0);

    return { flushDraw, straightDraw, overcards, equityBoost, callBonus, raiseBonus };
  }

  private boardWetness(board: Card[]): number {
    if (!board || board.length < 3) return 0;

    const suitCounts = board.reduce<Record<string, number>>((acc, card) => {
      acc[card.suit] = (acc[card.suit] ?? 0) + 1;
      return acc;
    }, {});
    const values = Array.from(new Set(board.map((card) => this.rankToValue(card.rank)))).sort((a, b) => a - b);
    const maxSuit = Math.max(0, ...Object.values(suitCounts));
    const paired = values.length < board.length ? 0.12 : 0;
    let connected = 0;
    for (let i = 1; i < values.length; i += 1) {
      if (values[i] - values[i - 1] <= 2) connected += 0.08;
    }
    const suited = maxSuit >= 3 ? 0.2 : maxSuit === 2 ? 0.08 : 0;

    return this.clamp01(paired + connected + suited);
  }

  private positionScore(table: PokerTableInternal, botId: string, activePlayers: string[]): number {
    if (activePlayers.length <= 1) return 0;

    const dealerId = (table as any).dealerPlayerId as string | undefined;
    const dealerIndex = Math.max(0, dealerId ? activePlayers.indexOf(dealerId) : Number((table as any).dealerIndex ?? 0) % activePlayers.length);
    const botIndex = activePlayers.indexOf(botId);
    if (botIndex < 0 || dealerIndex < 0) return 0;

    const distanceFromDealer = (botIndex - dealerIndex + activePlayers.length) % activePlayers.length;
    if (activePlayers.length === 2) return distanceFromDealer === 0 ? 0.045 : -0.015;
    if (distanceFromDealer === 0) return 0.055;
    if (distanceFromDealer >= activePlayers.length - 2) return 0.04;
    return -0.035;
  }

  private activePlayers(table: PokerTableInternal): string[] {
    return (table.players ?? []).filter((pid) => {
      const stack = Number(table.stacks?.[pid] ?? 0);
      const folded = !!table.foldedPlayers?.[pid];
      return stack > 0 && !folded;
    });
  }

  private bestOfN(cards: Card[]) {
    const n = cards.length;
    if (n === 7) return this.handEval.bestHandOf7(cards);

    let best = this.handEval.evaluate5(cards.slice(0, 5));
    const combos = this.combinations(cards, 5);
    for (const combo of combos) {
      const score = this.handEval.evaluate5(combo);
      if (this.handEval.compareScores(score, best) < 0) best = score;
    }
    return best;
  }

  private combinations<T>(arr: T[], k: number): T[][] {
    const res: T[][] = [];
    const n = arr.length;
    const idx = Array.from({ length: k }, (_, i) => i);

    if (k > n || k <= 0) return res;
    const push = () => res.push(idx.map((i) => arr[i]));
    push();

    while (true) {
      let i = k - 1;
      while (i >= 0 && idx[i] === i + n - k) i -= 1;
      if (i < 0) break;
      idx[i] += 1;
      for (let j = i + 1; j < k; j += 1) idx[j] = idx[j - 1] + 1;
      push();
    }

    return res;
  }

  private profileNoise(profile: BotProfile): number {
    switch (profile) {
      case 'LOOSE_AGGRESSIVE':
        return (randomFloat() - 0.42) * 0.16;
      case 'LOOSE_PASSIVE':
        return (randomFloat() - 0.46) * 0.14;
      case 'TIGHT_AGGRESSIVE':
        return (randomFloat() - 0.55) * 0.13;
      case 'TIGHT_PASSIVE':
        return (randomFloat() - 0.6) * 0.12;
      case 'BALANCED':
      default:
        return (randomFloat() - 0.5) * 0.14;
    }
  }

  private rankToValue(rank: string): number {
    const r = String(rank).toUpperCase().trim();
    if (r === 'A') return 14;
    if (r === 'K') return 13;
    if (r === 'Q') return 12;
    if (r === 'J') return 11;
    const n = Number(r);
    if (Number.isFinite(n)) return n;
    return 0;
  }

  private clamp01(x: number): number {
    return Math.max(0, Math.min(1, x));
  }
}
