import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { PokerTableInternal } from '../domain/table.types';
import type { PotWin } from '../domain/table.types';
import { DeckService, type Card } from './deck.service';
import { BettingService } from './betting.service';
import { BotService } from './bot.service';
import { HandEvaluatorService } from './hand-evaluator.service';
import { BotDecisionService } from './bot-decision.service';

@Injectable()
export class GameService {
  constructor(
    private readonly deckService: DeckService,
    private readonly bettingService: BettingService,
    private readonly botService: BotService,
    private readonly handEvaluator: HandEvaluatorService,
    private readonly botDecision: BotDecisionService,
  ) {}

  private createSafeShuffledDeck(): Card[] {
    const suits = ['S', 'H', 'D', 'C'] as const;
    const ranks = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'] as const;

    const deck: Card[] = [];
    for (const s of suits) for (const r of ranks) deck.push({ rank: r as any, suit: s as any });

    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    return deck;
  }

  private ensureDeckValidOrRepair(table: PokerTableInternal): void {
    const deck = (table as any).deck;
    if (!Array.isArray(deck) || deck.length === 0) {
      (table as any).deck = this.createSafeShuffledDeck();
      return;
    }

    const key = (c: any) => (c && c.rank && c.suit) ? `${c.rank}${c.suit}` : '';
    const keys = deck.map(key);
    const valid = keys.every((k) => k.length > 0);
    const unique = new Set(keys).size === keys.length;
    if (valid && unique) return;

    const used = new Set<string>();
    const hands = (table as any).hands ?? {};
    for (const pid of Object.keys(hands)) {
      for (const c of (hands[pid] ?? [])) used.add(key(c));
    }
    for (const c of ((table as any).communityCards ?? [])) used.add(key(c));

    (table as any).deck = this.createSafeShuffledDeck().filter((c) => !used.has(key(c)));
  }

  startGame(table: PokerTableInternal, playerId: string): void {
    if (table.status !== 'WAITING') throw new BadRequestException('La table est déjà en jeu');
    if (!table.ownerPlayerId) throw new BadRequestException('Pas de owner de table défini');
    if (table.ownerPlayerId !== playerId) throw new ForbiddenException('Seulement le owner peut démarrer la partie');

    const buyIn = table.buyInAmount ?? 100;
    if ((table as any).fillWithBots === true) {
      this.botService.fillFreeSeatsWithBots(table, buyIn);
    }

    table.bustedPlayers ??= {};
    for (const pid of table.players) table.bustedPlayers[pid] = (table.stacks[pid] ?? 0) === 0;

    this.startNewHand(table);
  }

  revealFlop(table: PokerTableInternal, playerId: string): void {
    this.ensureOwner(table, playerId);
    this.ensureInGame(table);
    this.clearLastWinnerInfoIfPresent(table);

    if (table.phase !== 'PRE_FLOP') throw new BadRequestException('Flop seulment après le PRE_FLOP');

    this.ensureBettingRoundCompleteOrThrow(table);
    this.burnCard(table);
    this.dealToCommunity(table, 3);

    table.phase = 'FLOP';
    this.bettingService.resetBettingRound(table);
    this.autoActBotsUntilReady(table);
  }

  revealTurn(table: PokerTableInternal, playerId: string): void {
    this.ensureOwner(table, playerId);
    this.ensureInGame(table);
    this.clearLastWinnerInfoIfPresent(table);

    if (table.phase !== 'FLOP') throw new BadRequestException('Turn seulement après le FLOP');

    this.ensureBettingRoundCompleteOrThrow(table);
    this.burnCard(table);
    this.dealToCommunity(table, 1);

    table.phase = 'TURN';
    this.bettingService.resetBettingRound(table);
    this.autoActBotsUntilReady(table);
  }

  revealRiver(table: PokerTableInternal, playerId: string): void {
    this.ensureOwner(table, playerId);
    this.ensureInGame(table);
    this.clearLastWinnerInfoIfPresent(table);

    if (table.phase !== 'TURN') throw new BadRequestException('River seulement après le TURN');

    this.ensureBettingRoundCompleteOrThrow(table);
    this.burnCard(table);
    this.dealToCommunity(table, 1);

    table.phase = 'RIVER';
    this.bettingService.resetBettingRound(table);
    this.autoActBotsUntilReady(table);
  }

  endHand(table: PokerTableInternal, playerId: string): void {
    this.ensureOwner(table, playerId);
    this.ensureInGame(table);
    this.clearLastWinnerInfoIfPresent(table);

    if (table.phase !== 'RIVER') throw new BadRequestException('endHand seulement après le RIVER');
    this.ensureBettingRoundCompleteOrThrow(table);

    if (!table.communityCards || table.communityCards.length !== 5) {
      throw new BadRequestException('Il doit y avoir 5 cartes communes pour finir la main');
    }

    const activePlayers = this.getActivePlayers(table);
    if (activePlayers.length === 0) return;

    let bestId = activePlayers[0];
    let bestScore = this.handEvaluator.bestHandOf7([
      ...table.hands[bestId],
      ...table.communityCards,
    ]);

    for (const pid of activePlayers.slice(1)) {
      const score = this.handEvaluator.bestHandOf7([
        ...table.hands[pid],
        ...table.communityCards,
      ]);
      if (this.handEvaluator.compareScores(score, bestScore) < 0) {
        bestId = pid;
        bestScore = score;
      }
    }

    const winners: string[] = [bestId];
    for (const pid of activePlayers) {
      if (pid === bestId) continue;
      const score = this.handEvaluator.bestHandOf7([
        ...table.hands[pid],
        ...table.communityCards,
      ]);
      if (this.handEvaluator.compareScores(score, bestScore) === 0) winners.push(pid);
    }

    const sidePots = this.buildSidePots(table);

    const wins: PotWin[] = [];
    for (let potIndex = 0; potIndex < sidePots.length; potIndex++) {
      const pot = sidePots[potIndex];
      const eligible = pot.eligible.filter((pid) => winners.includes(pid));
      if (eligible.length === 0) continue;

      const payout = Math.floor(pot.amount / eligible.length);
      const remainder = pot.amount - payout * eligible.length;

      eligible.forEach((wid, i) => {
        const win = payout + (i === 0 ? remainder : 0);
        table.stacks[wid] = (table.stacks[wid] ?? 0) + win;

        wins.push({
          potIndex,
          amount: win,
          winnerId: wid,
          handDescription: bestScore.description,
          handWinner: bestScore.winningCards,
          handRank: bestScore.rank,
        } as any);
      });
    }

    table.lastWinners = wins;

    const mainPotWinners = wins.filter((w: any) => w.potIndex === 0);
    const mainPotFirst = mainPotWinners[0];

    if (mainPotFirst) {
      table.lastWinnerId = mainPotFirst.winnerId;
      table.lastWinnerHand = table.hands?.[mainPotFirst.winnerId] ?? undefined;
      table.lastWinnerHandDescription =
        mainPotWinners.length > 1
          ? `${mainPotFirst.handDescription} (split)`
          : mainPotFirst.handDescription;
    }
  }

  // ✅ IMPORTANT : si <2 joueurs actifs -> WAITING (pas de “tour bloqué”)
  public startNewHand(table: PokerTableInternal): void {
    table.deck = this.createSafeShuffledDeck();

    table.hands = {};
    table.communityCards = [];

    table.pot = 0;
    table.currentBet = 0;
    table.bets = {};
    table.foldedPlayers = {};
    table.hasActed = {};
    table.contributions = {};
    table.bustedPlayers ??= {};

    for (const pid of table.players) {
      table.bets[pid] = 0;
      table.foldedPlayers[pid] = false;
      table.hasActed[pid] = false;
      table.contributions[pid] = 0;
      table.bustedPlayers[pid] = (table.stacks[pid] ?? 0) === 0;
    }

    const activePlayers = this.getActivePlayers(table);

    // ✅ 0 ou 1 joueur actif : on ne lance pas une main (sinon ça “bloque” et tu dois CALL)
    if (activePlayers.length < 2) {
      table.status = 'WAITING' as any;
      table.phase = 'WAITING' as any;
      table.currentBet = 0;
      return;
    }

    this.assignDealerAndBlinds(table, activePlayers);
    this.postBlinds(table);

    const cardsNeeded = activePlayers.length * 2;
    if (!table.deck || table.deck.length < cardsNeeded) {
      throw new BadRequestException('aucun jeu de cartes suffisant pour distribuer les mains');
    }

    for (const pid of activePlayers) {
      const c1 = table.deck.shift() as Card;
      const c2 = table.deck.shift() as Card;
      table.hands[pid] = [c1, c2];
    }

    table.status = 'IN_GAME' as any;
    table.phase = 'PRE_FLOP' as any;
    table.startedAt = new Date().toISOString();

    this.autoActBotsUntilReady(table);
  }

  private clearLastWinnerInfoIfPresent(table: PokerTableInternal): void {
    if (table.lastWinnerId || table.lastWinnerHand || table.lastWinnerHandDescription || table.lastWinners) {
      table.lastWinnerId = undefined;
      table.lastWinnerHand = undefined;
      table.lastWinnerHandDescription = undefined;
      table.lastWinners = undefined;
    }
  }

  private ensureBettingRoundCompleteOrThrow(table: PokerTableInternal): void {
    const activePlayers = this.getActivePlayers(table);

    // ✅ Si 0 ou 1 joueur actif, le round “ne doit pas bloquer” ici :
    // on laisse TablesService gérer la résolution auto (win by folds + fin de partie)
    if (activePlayers.length < 2) return;

    for (const pid of activePlayers) {
      const folded = table.foldedPlayers?.[pid] ?? false;
      if (folded) continue;

      const acted = table.hasActed?.[pid] ?? false;
      if (!acted) throw new BadRequestException('mise en attente : un joueur doit encore agir');

      const bet = table.bets?.[pid] ?? 0;
      const currentBet = table.currentBet ?? 0;

      if (bet !== currentBet) throw new BadRequestException('mise en attente : un joueur doit encore agir');
    }
  }

  private postBlinds(table: PokerTableInternal): void {
    const sb = table.smallBlindPlayerId;
    const bb = table.bigBlindPlayerId;
    if (!sb || !bb) return;

    const sbAmount = table.smallBlindAmount ?? 5;
    const bbAmount = table.bigBlindAmount ?? 10;

    const sbPaid = this.collectBlind(table, sb, sbAmount);
    const bbPaid = this.collectBlind(table, bb, bbAmount);

    table.currentBet = bbPaid;

    table.hasActed[sb] = false;
    table.hasActed[bb] = false;
  }

  private collectBlind(table: PokerTableInternal, playerId: string, amount: number): number {
    const stack = table.stacks[playerId] ?? 0;
    const paid = Math.max(0, Math.min(stack, amount));
    if (paid <= 0) return 0;

    table.stacks[playerId] = stack - paid;
    table.bets[playerId] = (table.bets[playerId] ?? 0) + paid;

    table.pot = (table.pot ?? 0) + paid;
    table.contributions[playerId] = (table.contributions?.[playerId] ?? 0) + paid;

    return paid;
  }

  private burnCard(table: PokerTableInternal): void {
    this.ensureDeckValidOrRepair(table);
    if (!table.deck || table.deck.length < 1) throw new BadRequestException('aucun jeu de cartes suffisant pour brûler une carte');
    table.deck.shift();
  }

  private dealToCommunity(table: PokerTableInternal, count: number): void {
    this.ensureDeckValidOrRepair(table);

    if (!table.deck || table.deck.length < count) {
      throw new BadRequestException('aucun jeu de cartes suffisant pour distribuer aux cartes communes');
    }

    const cards: Card[] = [];
    for (let i = 0; i < count; i++) {
      const c = table.deck.shift() as Card;
      if (!c) throw new BadRequestException('deck insuffisant');
      cards.push(c);
    }

    const seen = new Set((table.communityCards ?? []).map((x: any) => `${x.rank}${x.suit}`));
    const filtered = cards.filter((x: any) => {
      const k = `${x.rank}${x.suit}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    table.communityCards = [...(table.communityCards ?? []), ...filtered];
  }

  private getActivePlayers(table: PokerTableInternal): string[] {
    return table.players.filter((pid) => {
      const stack = table.stacks[pid] ?? 0;
      const fold = table.foldedPlayers?.[pid] ?? false;
      return stack > 0 && !fold;
    });
  }

  private assignDealerAndBlinds(table: PokerTableInternal, activePlayers: string[]): void {
    const n = activePlayers.length;
    const prev = typeof table.dealerIndex === 'number' ? table.dealerIndex : -1;
    const dealerIndex = (prev + 1 + n) % n;

    table.dealerIndex = dealerIndex;
    table.dealerPlayerId = activePlayers[dealerIndex];

    const sbIndex = n === 2 ? dealerIndex : (dealerIndex + 1) % n;
    const bbIndex = n === 2 ? (dealerIndex + 1) % n : (dealerIndex + 2) % n;

    table.smallBlindPlayerId = activePlayers[sbIndex];
    table.bigBlindPlayerId = activePlayers[bbIndex];
  }

  private buildSidePots(table: PokerTableInternal): Array<{ amount: number; eligible: string[] }> {
    table.contributions ??= {};

    const contributors = Object.entries(table.contributions)
      .filter(([, amt]) => (amt ?? 0) > 0)
      .map(([pid, amt]) => ({ pid, amt: Number(amt ?? 0) }));

    if (contributors.length === 0) return [];

    const levels = Array.from(new Set(contributors.map((c) => c.amt))).sort((a, b) => a - b);

    const pots: Array<{ amount: number; eligible: string[] }> = [];
    let prevLevel = 0;

    for (const level of levels) {
      const eligible = contributors.filter((c) => c.amt >= level).map((c) => c.pid);
      const numPlayers = eligible.length;
      const delta = level - prevLevel;
      const amount = delta * numPlayers;

      if (amount > 0) pots.push({ amount, eligible });
      prevLevel = level;
    }

    return pots;
  }

  private ensureOwner(table: PokerTableInternal, playerId: string): void {
    if (!playerId || playerId.trim().length === 0) throw new BadRequestException('playerId requis');
    if (table.ownerPlayerId !== playerId) throw new ForbiddenException('seulement le owner peut effectuer cette action');
  }

  private ensureInGame(table: PokerTableInternal): void {
    if (table.status !== 'IN_GAME') throw new BadRequestException('Partie non démarrée');
    this.ensureDeckValidOrRepair(table);
    if (!table.deck || !Array.isArray(table.deck) || table.deck.length === 0) throw new BadRequestException('Deck manquant');
  }

  public autoActBots(table: PokerTableInternal): void {
    this.autoActBotsUntilReady(table);
  }

  private autoActBotsUntilReady(table: PokerTableInternal): void {
    const bots = (table.players ?? []).filter((p) => this.botService.isBotId(p));
    if (bots.length === 0) return;

    for (let loop = 0; loop < 40; loop++) {
      // si <2 actifs, inutile de boucler
      const actives = this.getActivePlayers(table);
      if (actives.length < 2) return;

      try {
        this.ensureBettingRoundCompleteOrThrow(table);
        return;
      } catch {}

      const activeBots = bots.filter((pid) => {
        const folded = table.foldedPlayers?.[pid] ?? false;
        const stack = table.stacks?.[pid] ?? 0;
        return !folded && stack > 0;
      });

      let progressed = false;

      for (const pid of activeBots) {
        const acted = table.hasActed?.[pid] ?? false;
        const bet = table.bets?.[pid] ?? 0;
        const currentBet = table.currentBet ?? 0;

        const needsAction = (!acted) || (bet !== currentBet);
        if (!needsAction) continue;

        try {
          const decision = this.botDecision.decide(table, pid);

          // Sécurité : BET si currentBet>0 -> on transforme en CALL
          if (decision.action === 'BET' && (table.currentBet ?? 0) > 0) {
            this.bettingService.act(table, pid, 'CALL' as any);
          } else if (decision.action === 'RAISE' && (table.currentBet ?? 0) === 0) {
            // RAISE si currentBet==0 -> on transforme en BET
            const bb = Math.max(1, Number(table.bigBlindAmount ?? 10));
            const amt = Math.max(bb, Number(decision.amount ?? bb));
            this.bettingService.act(table, pid, 'BET' as any, amt);
          } else {
            this.bettingService.act(table, pid, decision.action as any, decision.amount);
          }

          progressed = true;
        } catch {
          // fallback si la décision échoue (rare)
          try {
            const cb = Number(table.currentBet ?? 0);
            const my = Number(table.bets?.[pid] ?? 0);
            if (my < cb) this.bettingService.act(table, pid, 'CALL' as any);
            else this.bettingService.act(table, pid, 'CHECK' as any);
            progressed = true;
          } catch {
            try {
              this.bettingService.act(table, pid, 'FOLD' as any);
              progressed = true;
            } catch {}
          }
        }
      }

      if (!progressed) return;
    }
  }
}
