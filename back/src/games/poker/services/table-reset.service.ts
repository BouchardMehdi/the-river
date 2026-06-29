import { Injectable } from '@nestjs/common';
import type { PokerTableInternal } from '../domain/table.types';

@Injectable()
export class TableResetService {
  resetIfNoHumans(table: PokerTableInternal): void {
    const humans = table.players.filter((p) => !this.isBotId(p));
    if (humans.length === 0) {
      this.resetToEmptyOpen(table);
    }
  }

  resetToEmptyOpen(table: PokerTableInternal): void {
    table.status = 'OPEN';
    table.phase = 'WAITING';

    table.players = [];
    table.ownerPlayerId = undefined;
    table.startedAt = undefined;

    table.deck = undefined;
    table.hands = {};
    table.communityCards = [];

    table.stacks = {};
    table.pot = 0;
    table.currentBet = 0;

    table.bets = {};
    table.foldedPlayers = {};
    table.hasActed = {};
    table.contributions = {};

    table.bustedPlayers = {};

    table.dealerIndex = 0;
    table.dealerPlayerId = undefined;
    table.smallBlindPlayerId = undefined;
    table.bigBlindPlayerId = undefined;

    table.lastWinnerId = undefined;
    table.lastWinnerHand = undefined;
    table.lastWinnerHandDescription = undefined;
    table.lastWinners = undefined;
  }

  private isBotId(id: string): boolean {
    return id.includes('-bot-');
  }
}
