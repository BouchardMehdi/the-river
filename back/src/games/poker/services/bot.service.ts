import { Injectable } from '@nestjs/common';
import type { ActionType, PokerTableInternal } from '../domain/table.types';
import { shuffleInPlace } from '../../../common/random';

/**
 * Service dédié AUX BOTS UNIQUEMENT
 * - création
 * - ajout automatique à une table
 *
 * Les bots ne sont PAS persistés en base
 */

export type BotProfile =
  | 'TIGHT_AGGRESSIVE'
  | 'LOOSE_AGGRESSIVE'
  | 'TIGHT_PASSIVE'
  | 'LOOSE_PASSIVE'
  | 'BALANCED';

type BotMemoryState = {
  bets: Record<string, number>;
  folded: Record<string, boolean>;
  profiles: Record<string, BotProfile>;
  opponents: Record<string, BotOpponentStats>;
};

export type BotOpponentStats = {
  actions: number;
  aggressiveActions: number;
  passiveActions: number;
  folds: number;
  showdowns: number;
};

@Injectable()
export class BotService {
  private readonly perTable: Record<string, BotMemoryState> = {};

  /**
   * Remplit les places libres avec des bots
   * Appelé au moment du start de la partie (casual uniquement via fillWithBots)
   *
   * -> Ajout : attribution d’un profil par bot (mix)
   */
  fillFreeSeatsWithBots(table: PokerTableInternal, initialStack: number): string[] {
    const seatsToFill = Math.max(0, table.maxPlayers - table.players.length);
    if (seatsToFill === 0) return [];

    const createdBotIds: string[] = [];
    this.ensureTableMemory(table.id);

    const profilesCycle: BotProfile[] = this.buildProfilesCycle();

    for (let i = 0; i < seatsToFill; i += 1) {
      const botId = this.generateBotId(table, i);

      table.players = [...table.players, botId];
      table.stacks[botId] = initialStack;

      table.bustedPlayers ??= {};
      table.bustedPlayers[botId] = false;

      // mémoire interne
      this.perTable[table.id].bets[botId] = 0;
      this.perTable[table.id].folded[botId] = false;

      // profil mix
      const profile = profilesCycle[i % profilesCycle.length];
      this.perTable[table.id].profiles[botId] = profile;

      createdBotIds.push(botId);
    }

    return createdBotIds;
  }

  resetBotRound(tableId: string): void {
    this.ensureTableMemory(tableId);
    const state = this.perTable[tableId];

    for (const botId of Object.keys(state.bets)) {
      state.bets[botId] = 0;
      state.folded[botId] = false;
    }
  }

  getBotBet(tableId: string, botId: string): number {
    this.ensureTableMemory(tableId);
    return this.perTable[tableId].bets[botId] ?? 0;
  }

  setBotBet(tableId: string, botId: string, bet: number): void {
    this.ensureTableMemory(tableId);
    this.perTable[tableId].bets[botId] = bet;
  }

  markBotFolded(tableId: string, botId: string): void {
    this.ensureTableMemory(tableId);
    this.perTable[tableId].folded[botId] = true;
  }

  isBotFolded(tableId: string, botId: string): boolean {
    this.ensureTableMemory(tableId);
    return this.perTable[tableId].folded[botId] ?? false;
  }

  isBotId(playerId: string): boolean {
    return typeof playerId === 'string' && playerId.includes('-bot-');
  }

  getBotProfile(tableId: string, botId: string): BotProfile {
    this.ensureTableMemory(tableId);
    return this.perTable[tableId].profiles?.[botId] ?? 'BALANCED';
  }

  recordAction(tableId: string, playerId: string, action: ActionType): void {
    this.ensureTableMemory(tableId);
    const state = this.perTable[tableId];
    state.opponents[playerId] ??= this.createOpponentStats();

    const stats = state.opponents[playerId];
    stats.actions += 1;

    if (action === 'BET' || action === 'RAISE' || action === 'ALL_IN') {
      stats.aggressiveActions += 1;
    } else if (action === 'CALL' || action === 'CHECK') {
      stats.passiveActions += 1;
    } else if (action === 'FOLD') {
      stats.folds += 1;
    }
  }

  getOpponentStats(tableId: string, playerId: string): BotOpponentStats {
    this.ensureTableMemory(tableId);
    return this.perTable[tableId].opponents[playerId] ?? this.createOpponentStats();
  }

  tableAggression(tableId: string, playerIds: string[]): number {
    this.ensureTableMemory(tableId);
    const stats = playerIds
      .map((pid) => this.perTable[tableId].opponents[pid])
      .filter(Boolean);

    const actions = stats.reduce((sum, stat) => sum + stat.actions, 0);
    if (actions <= 0) return 0.35;

    const aggressive = stats.reduce((sum, stat) => sum + stat.aggressiveActions, 0);
    return Math.max(0, Math.min(1, aggressive / actions));
  }

  clearTable(tableId: string): void {
    delete this.perTable[tableId];
  }

  private ensureTableMemory(tableId: string): void {
    if (!this.perTable[tableId]) {
      this.perTable[tableId] = { bets: {}, folded: {}, profiles: {}, opponents: {} };
    }
    this.perTable[tableId].profiles ??= {};
    this.perTable[tableId].opponents ??= {};
  }

  private createOpponentStats(): BotOpponentStats {
    return {
      actions: 0,
      aggressiveActions: 0,
      passiveActions: 0,
      folds: 0,
      showdowns: 0,
    };
  }

  private generateBotId(table: PokerTableInternal, index: number): string {
    const base = `${table.id}-bot-${index + 1}`;
    let candidate = base;
    let n = 2;

    while (table.players.includes(candidate)) {
      candidate = `${base}-${n}`;
      n += 1;
    }

    return candidate;
  }

  private buildProfilesCycle(): BotProfile[] {
    // Mix : on mélange légèrement à chaque création de table
    const arr: BotProfile[] = [
      'TIGHT_AGGRESSIVE',
      'LOOSE_AGGRESSIVE',
      'TIGHT_PASSIVE',
      'LOOSE_PASSIVE',
      'BALANCED',
    ];

    return shuffleInPlace(arr);
  }
}
