import { Injectable } from '@nestjs/common';
import type { PokerTableInternal } from '../domain/table.types';

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

  clearTable(tableId: string): void {
    delete this.perTable[tableId];
  }

  private ensureTableMemory(tableId: string): void {
    if (!this.perTable[tableId]) {
      this.perTable[tableId] = { bets: {}, folded: {}, profiles: {} };
    }
    this.perTable[tableId].profiles ??= {};
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

    // shuffle simple
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }
}
