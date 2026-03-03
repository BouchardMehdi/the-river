import { Injectable } from '@nestjs/common';
import type { ActionType, PokerTableInternal } from '../domain/table.types';
import type { Card } from './deck.service';
import { HandEvaluatorService } from './hand-evaluator.service';
import { BotProfile, BotService } from './bot.service';
import { HandRank } from '../domain/hand-rank';

export type BotDecision = {
  action: ActionType;
  amount?: number; // utilisé pour BET/RAISE
};

@Injectable()
export class BotDecisionService {
  constructor(
    private readonly botService: BotService,
    private readonly handEval: HandEvaluatorService,
  ) {}

  decide(table: PokerTableInternal, botId: string): BotDecision {
    const profile = this.botService.getBotProfile(table.id, botId);

    // Sécurité
    const stack = Number(table.stacks?.[botId] ?? 0);
    if (stack <= 0) return { action: 'CHECK' };

    const myBet = Number(table.bets?.[botId] ?? 0);
    const currentBet = Number(table.currentBet ?? 0);
    const toCall = Math.max(0, currentBet - myBet);

    const hole = (table.hands?.[botId] ?? []) as Card[];
    const board = (table.communityCards ?? []) as Card[];

    // Nombre d’adversaires encore “actifs” (pas fold + stack>0)
    const activePlayers = (table.players ?? []).filter((pid) => {
      const s = Number(table.stacks?.[pid] ?? 0);
      const f = !!table.foldedPlayers?.[pid];
      return s > 0 && !f;
    });
    const opponents = Math.max(0, activePlayers.length - 1);

    // Randomisation légère (anti-bot “robotique”)
    const noise = this.profileNoise(profile);

    // ---- Décision PRE-FLOP (heuristique simple) ----
    if ((table.phase as any) === 'PRE_FLOP' || board.length === 0) {
      const strength = this.preflopStrength(hole); // 0..1

      // Ajuste selon profil + bruit
      const s = this.clamp01(strength + noise);

      return this.decideFromStrength({
        table,
        botId,
        profile,
        strength01: s,
        opponents,
        toCall,
        stack,
      });
    }

    // ---- Post-flop : on évalue la meilleure main possible avec les cartes disponibles ----
    const post = this.postflopStrength(hole, board); // 0..1
    const s = this.clamp01(post + noise * 0.8);

    return this.decideFromStrength({
      table,
      botId,
      profile,
      strength01: s,
      opponents,
      toCall,
      stack,
    });
  }

  // ---------------- Decision policy ----------------

  private decideFromStrength(args: {
    table: PokerTableInternal;
    botId: string;
    profile: BotProfile;
    strength01: number;
    opponents: number;
    toCall: number;
    stack: number;
  }): BotDecision {
    const { table, profile, strength01, opponents, toCall, stack } = args;

    const currentBet = Number(table.currentBet ?? 0);
    const bb = Math.max(1, Number(table.bigBlindAmount ?? 10));
    const pot = Math.max(0, Number(table.pot ?? 0));

    const isAggro = profile.includes('AGGRESSIVE');
    const isLoose = profile.includes('LOOSE');

    // Seuils simples (à ajuster plus tard)
    const strong = isLoose ? 0.62 : 0.68;
    const medium = isLoose ? 0.46 : 0.50;

    // Plus il y a d’adversaires, plus on devient prudent
    const multiwayPenalty = Math.min(0.12, opponents * 0.03);
    const s = this.clamp01(strength01 - multiwayPenalty);

    // --- Si quelqu’un a misé ---
    if (currentBet > 0) {
      // Très fort : raise parfois, sinon call
      if (s >= strong) {
        // Raise plus souvent si agressif
        const raiseChance = isAggro ? 0.45 : 0.22;
        if (Math.random() < raiseChance) {
          const raiseInc = this.pickRaiseIncrement(bb, currentBet, pot, profile);
          return this.raiseOrAllIn(table, args.botId, stack, raiseInc);
        }
        return this.callOrAllIn(stack, toCall);
      }

      // Moyen : call si pas trop cher, sinon fold
      if (s >= medium) {
        // “Pot odds” ultra simplifié : si toCall <= ~25% du pot (ou bb), on call plus souvent
        const cheap = toCall <= Math.max(bb, Math.floor(pot * 0.25));
        if (cheap || Math.random() < 0.35) return this.callOrAllIn(stack, toCall);
        return toCall === 0 ? { action: 'CHECK' } : { action: 'FOLD' };
      }

      // Faible : fold si toCall > 0, check si possible
      return toCall === 0 ? { action: 'CHECK' } : { action: 'FOLD' };
    }

    // --- Personne n’a misé (currentBet == 0) ---
    if (s >= strong) {
      // Value bet
      const bet = this.pickBetSize(bb, pot, profile);
      return this.betOrAllIn(stack, bet);
    }

    if (s >= medium) {
      // Check souvent, bet parfois (surtout si agressif)
      const betChance = isAggro ? 0.25 : 0.12;
      if (Math.random() < betChance) {
        const bet = this.pickBetSize(bb, pot, profile) * 0.75;
        return this.betOrAllIn(stack, Math.max(bb, Math.floor(bet)));
      }
      return { action: 'CHECK' };
    }

    // Faible : check
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
    // betting.service.ts: RAISE attend "raiseAmount" (increment), pas "target"
    const inc = Math.max(1, Math.floor(raiseIncrement));
    const myBet = Number(table.bets?.[botId] ?? 0);
    const currentBet = Number(table.currentBet ?? 0);

    const targetBet = currentBet + inc;
    const toPay = Math.max(0, targetBet - myBet);

    if (toPay >= stack) return { action: 'ALL_IN' };
    return { action: 'RAISE', amount: inc };
  }

  // ---------------- Sizing ----------------

  private pickBetSize(bb: number, pot: number, profile: BotProfile): number {
    const isAggro = profile.includes('AGGRESSIVE');
    const base = Math.max(bb, Math.floor(pot * (isAggro ? 0.65 : 0.5)));
    const jitter = 0.85 + Math.random() * 0.35; // 0.85..1.20
    return Math.max(bb, Math.floor(base * jitter));
  }

  private pickRaiseIncrement(bb: number, currentBet: number, pot: number, profile: BotProfile): number {
    const isAggro = profile.includes('AGGRESSIVE');
    // increment (pas target) : typiquement ~50% du currentBet, ou bb, ou un morceau du pot
    const base = Math.max(bb, Math.floor(currentBet * (isAggro ? 0.75 : 0.55)), Math.floor(pot * 0.25));
    const jitter = 0.85 + Math.random() * 0.35;
    return Math.max(bb, Math.floor(base * jitter));
  }

  // ---------------- Strength evaluators ----------------

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

    // Base
    let s = 0.10;

    // Paires
    if (pair) {
      // 22 -> 0.45, AA -> 0.95
      s = 0.40 + (high - 2) * (0.55 / 12);
      return this.clamp01(s);
    }

    // Broadways (A,K,Q,J,10)
    const isBroadway = (v: number) => v >= 10;
    const bothBroadway = isBroadway(va) && isBroadway(vb);

    if (bothBroadway) s += 0.32;

    // Ax
    if (high === 14) s += 0.18;

    // Suited
    if (suited) s += 0.08;

    // Connecteurs / one-gap
    if (gap === 1) s += 0.10;
    else if (gap === 2) s += 0.06;

    // Hauteur
    s += (high - 2) * (0.24 / 12);

    // Pénalité si trop “gappy”
    if (gap >= 5) s -= 0.10;

    return this.clamp01(s);
  }

  private postflopStrength(hole: Card[], board: Card[]): number {
    const cards = [...(hole ?? []), ...(board ?? [])].filter(Boolean);
    if (cards.length < 5) return 0.2;

    const best = this.bestOfN(cards);
    // HandRank: 1 meilleur ... 10 pire
    // On mappe en 0..1 (monstre -> proche 1)
    const rank = best.rank;

    // Tier simple basé sur HandRank
    if (rank <= HandRank.FULL) return 0.92;          // full+ (très fort)
    if (rank <= HandRank.SUITE) return 0.78;         // couleur/suite
    if (rank <= HandRank.DOUBLE_PAIRE) return 0.62;  // brelan/double paire
    if (rank <= HandRank.PAIRE) return 0.46;         // paire
    return 0.26;                                     // hauteur
  }

  private bestOfN(cards: Card[]) {
    // Best main sur 5 cartes parmi N (N=5..7) avec ton HandEvaluator
    const n = cards.length;
    if (n === 7) return this.handEval.bestHandOf7(cards);

    let best = this.handEval.evaluate5(cards.slice(0, 5));
    const combos = this.combinations(cards, 5);

    for (const c of combos) {
      const s = this.handEval.evaluate5(c);
      if (this.handEval.compareScores(s, best) < 0) best = s;
    }
    return best;
  }

  private combinations<T>(arr: T[], k: number): T[][] {
    const res: T[][] = [];
    const n = arr.length;
    const idx = Array.from({ length: k }, (_, i) => i);

    const push = () => res.push(idx.map((i) => arr[i]));

    if (k > n || k <= 0) return res;
    push();

    while (true) {
      let i = k - 1;
      while (i >= 0 && idx[i] === i + n - k) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
      push();
    }

    return res;
  }

  // ---------------- Helpers ----------------

  private profileNoise(profile: BotProfile): number {
    // valeur ajoutée à la force (0..1) avant décision
    // loose = plus “optimiste”, tight = plus prudent
    switch (profile) {
      case 'LOOSE_AGGRESSIVE':
        return (Math.random() - 0.45) * 0.18; // léger biais positif
      case 'LOOSE_PASSIVE':
        return (Math.random() - 0.48) * 0.16;
      case 'TIGHT_AGGRESSIVE':
        return (Math.random() - 0.55) * 0.16; // léger biais négatif
      case 'TIGHT_PASSIVE':
        return (Math.random() - 0.58) * 0.14;
      case 'BALANCED':
      default:
        return (Math.random() - 0.5) * 0.16;
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
