import { BadRequestException, Injectable } from '@nestjs/common';
import type { ActionType, PokerTableInternal } from '../domain/table.types';

@Injectable()
export class BettingService {
  private clearLastWinnerInfoIfPresent(table: PokerTableInternal): void {
    if (!table.lastWinnerId && !table.lastWinners) return;

    table.lastWinnerId = undefined;
    table.lastWinnerHand = undefined;
    table.lastWinnerHandDescription = undefined;
    table.lastWinners = undefined;
  }

  act(
    table: PokerTableInternal,
    playerId: string,
    action: ActionType,
    amount?: number,
  ): void {
    // ✅ Dès qu’on commence à jouer une nouvelle main, on efface l’historique du dernier winner
    this.clearLastWinnerInfoIfPresent(table);

    if (table.status !== 'IN_GAME') {
      throw new BadRequestException('Partie non démarrée');
    }
    if (!table.players.includes(playerId)) {
      throw new BadRequestException('Joueur non présent à la table');
    }

    table.hasActed ??= {};
    table.bets ??= {};
    table.foldedPlayers ??= {};
    table.contributions ??= {};

    if (table.foldedPlayers[playerId]) {
      throw new BadRequestException('Joueur déjà couché');
    }

    const stack = table.stacks[playerId] ?? 0;
    if (stack <= 0) {
      throw new BadRequestException('Joueur à un stack vide');
    }

    const currentBet = table.currentBet ?? 0;
    const myBet = table.bets[playerId] ?? 0;

    const markActed = () => {
      table.hasActed[playerId] = true;
    };

    const resetOthersNeedToAct = () => {
      for (const pid of table.players) {
        if (pid === playerId) continue;
        if (table.foldedPlayers[pid]) continue;
        if ((table.stacks[pid] ?? 0) <= 0) continue; // all-in ne rejoue pas
        table.hasActed[pid] = false;
      }
    };

    const pay = (amountToPay: number) => {
      const s = table.stacks[playerId] ?? 0;
      const paid = Math.max(0, Math.min(s, amountToPay));
      if (paid <= 0) return 0;

      table.stacks[playerId] = s - paid;
      table.pot = (table.pot ?? 0) + paid;

      table.bets[playerId] = (table.bets[playerId] ?? 0) + paid;
      table.contributions[playerId] = (table.contributions[playerId] ?? 0) + paid;

      return paid;
    };

    switch (action) {
      case 'CHECK': {
        if (currentBet !== myBet) {
          throw new BadRequestException('Impossible de check : il faut call ou raise');
        }
        markActed();
        return;
      }

      case 'CALL': {
        const toCall = Math.max(0, currentBet - myBet);
        pay(toCall);
        markActed();
        return;
      }

      case 'BET': {
        if (currentBet !== 0) {
          throw new BadRequestException('Impossible de bet : il faut call ou raise');
        }
        const betAmount = Number(amount ?? 0);
        if (!betAmount || betAmount <= 0) {
          throw new BadRequestException('Montant requis');
        }

        pay(betAmount);
        table.currentBet = table.bets[playerId] ?? 0;

        markActed();
        resetOthersNeedToAct();
        return;
      }

      case 'RAISE': {
        if (currentBet === 0) {
          throw new BadRequestException('Impossible de raise : il faut bet');
        }
        const raiseAmount = Number(amount ?? 0);
        if (!raiseAmount || raiseAmount <= 0) {
          throw new BadRequestException('Montant requis');
        }

        const targetBet = currentBet + raiseAmount;
        const toPay = Math.max(0, targetBet - myBet);
        pay(toPay);

        table.currentBet = Math.max(table.currentBet ?? 0, table.bets[playerId] ?? 0);

        markActed();
        resetOthersNeedToAct();
        return;
      }

      case 'ALL_IN': {
        const allIn = table.stacks[playerId] ?? 0;
        if (allIn <= 0) throw new BadRequestException('Joueur à un stack vide');

        const previousCurrentBet = table.currentBet ?? 0;
        pay(allIn);

        table.currentBet = Math.max(previousCurrentBet, table.bets[playerId] ?? 0);

        markActed();
        if (table.currentBet > previousCurrentBet) {
          resetOthersNeedToAct();
        }
        return;
      }

      case 'FOLD': {
        table.foldedPlayers[playerId] = true;
        table.hasActed[playerId] = true;
        return;
      }

      default:
        throw new BadRequestException('action invalide');
    }
  }

  resetBettingRound(table: PokerTableInternal): void {
    table.currentBet = 0;

    table.bets ??= {};
    table.foldedPlayers ??= {};
    table.hasActed ??= {};
    table.contributions ??= {};

    for (const pid of table.players) {
      table.bets[pid] = 0;

      if (table.foldedPlayers[pid] || (table.stacks[pid] ?? 0) === 0) {
        table.hasActed[pid] = true;
      } else {
        table.hasActed[pid] = false;
      }
    }
  }
}
