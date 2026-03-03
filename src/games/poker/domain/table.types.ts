import type { Card } from '../services/deck.service';

export type TableStatus = 'OPEN' | 'WAITING' | 'IN_GAME' | 'CLOSED';
export type GamePhase = 'WAITING' | 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER';

export type ActionType = 'CHECK' | 'BET' | 'CALL' | 'RAISE' | 'FOLD' | 'ALL_IN';

export type PotWin = {
  potIndex: number;        // 0 = main pot, 1.. = side pots
  amount: number;          // montant gagné
  winnerId: string;        // gagnant de ce pot
  handDescription: string; // ex: "Paire de 8", "Suite 7 8 9 10 J"
  handWinner: Card[];
};

export interface PokerTableInternal {
  id: string;
  name: string;
  maxPlayers: number;

  buyInAmount: number;
  smallBlindAmount: number;
  bigBlindAmount: number;

  status: TableStatus;
  createdAt: string;

  players: string[];

  ownerPlayerId?: string;
  startedAt?: string;

  phase: GamePhase;

  deck?: Card[];
  hands: Record<string, Card[]>;
  communityCards: Card[];

  stacks: Record<string, number>;

  pot: number;
  currentBet: number;

  // bets = mises du round (reset à chaque street)
  bets: Record<string, number>;
  foldedPlayers: Record<string, boolean>;
  hasActed: Record<string, boolean>;

  // ✅ Joueur dont c'est le tour
  currentPlayerId?: string;

  // total contribution sur toute la main (blinds + actions + toutes streets)
  contributions: Record<string, number>;

  dealerIndex: number;
  dealerPlayerId?: string;
  smallBlindPlayerId?: string;
  bigBlindPlayerId?: string;

  bustedPlayers: Record<string, boolean>;

  // Dernier gagnant (dernière main terminée)
  lastWinnerId?: string;

  lastWinnerHand?: Card[];

  lastWinnerHandDescription?: string;

  lastWinners?: PotWin[];
}

export interface PokerTablePublic {
  id: string;
  name: string;
  maxPlayers: number;

  buyInAmount: number;
  smallBlindAmount: number;
  bigBlindAmount: number;

  status: TableStatus;
  createdAt: string;

  players: string[];

  ownerPlayerId?: string;
  startedAt?: string;

  phase: GamePhase;

  deckRemaining: number;

  handSizes: Record<string, number>;
  communityCards: Card[];
  communityCount: number;

  stacks: Record<string, number>;

  pot: number;
  currentBet: number;
  bets: Record<string, number>;
  // ✅ Joueur dont c'est le tour (front)
  currentPlayerId?: string;
  foldedPlayers: string[];

  dealerIndex: number;
  dealerPlayerId?: string;
  smallBlindPlayerId?: string;
  bigBlindPlayerId?: string;

  bustedPlayers: string[];

  lastWinnerId?: string;
  lastWinnerHand?: Card[];
  lastWinnerHandDescription?: string;

  lastWinners?: PotWin[];
}
