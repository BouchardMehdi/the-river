import { BadRequestException, Injectable } from '@nestjs/common';
import type { PokerTableInternal } from '../domain/table.types';
import { DeckService } from './deck.service';

/**
 * Service responsable UNIQUEMENT
 * de la gestion des joueurs humains
 */
@Injectable()
export class PlayerService {
  constructor(private readonly deckService: DeckService) {}
// Ajoute un joueur à la table
  join(table: PokerTableInternal, playerId: string, initialStack: number): void {
    if (!playerId || playerId.trim().length === 0) {
      throw new BadRequestException('playerId requis');
    }

    if (!initialStack || initialStack <= 0) {
      throw new BadRequestException('initialStack requis');
    }

    // Autorise les joueurs à s'asseoir tant qu'il n'y a pas de main en cours
    // (status OPEN = table vide, WAITING = joueurs assis).
    if (table.status === 'IN_GAME') {
      throw new BadRequestException('Partie en cours, impossible de rejoindre');
    }

    if (table.players.includes(playerId)) return;

    if (table.players.length >= table.maxPlayers) {
      throw new BadRequestException('la table est pleine');
    }

    const isFirst = table.players.length === 0;

    table.players = [...table.players, playerId];

    table.stacks[playerId] = initialStack;

    table.bets[playerId] = 0;
    table.foldedPlayers[playerId] = false;

    table.bustedPlayers ??= {};
    table.bustedPlayers[playerId] = false;

    if (isFirst) {
      table.ownerPlayerId = playerId;
      table.deck = (this as any).createSafeShuffledDeck?.() ?? table.deck;
    }
  }
// Retire un joueur de la table
  leave(table: PokerTableInternal, playerId: string): void {
    if (!playerId || playerId.trim().length === 0) {
      throw new BadRequestException('playerId requis');
    }

    table.players = table.players.filter((p) => p !== playerId);

    delete table.hands[playerId];
    delete table.stacks[playerId];
    delete table.bets[playerId];
    delete table.foldedPlayers[playerId];
    delete table.bustedPlayers?.[playerId];
  }
}
