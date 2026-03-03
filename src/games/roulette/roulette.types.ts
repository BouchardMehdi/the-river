export type RouletteGameStatus = 'BETTING' | 'SPUN';

export enum BetType {
  STRAIGHT = 'STRAIGHT', // plein (1 number)
  SPLIT = 'SPLIT',       // cheval (2 numbers)
  STREET = 'STREET',     // transversale pleine (3 numbers)
  CORNER = 'CORNER',     // carré (4 numbers)
  SIX_LINE = 'SIX_LINE', // transversale simple (6 numbers)

  DOZEN = 'DOZEN',       // 1-12 / 13-24 / 25-36
  COLUMN = 'COLUMN',     // col 1 / 2 / 3

  RED = 'RED',
  BLACK = 'BLACK',
  EVEN = 'EVEN',
  ODD = 'ODD',
  LOW = 'LOW',   // 1-18
  HIGH = 'HIGH', // 19-36
}

export type Dozen = 1 | 2 | 3;
export type Column = 1 | 2 | 3;

export type BetSelection =
  | { number: number }                          // STRAIGHT
  | { numbers: [number, number] }               // SPLIT
  | { numbers: [number, number, number] }       // STREET
  | { numbers: [number, number, number, number] } // CORNER
  | { numbers: [number, number, number, number, number, number] } // SIX_LINE
  | { dozen: Dozen }                            // DOZEN
  | { column: Column }                          // COLUMN
  | {};                                         // outside bets (RED/BLACK/EVEN/ODD/LOW/HIGH)

export interface RouletteBet {
  type: BetType;
  amount: number;       // mise
  selection?: BetSelection;
}

export interface RoulettePlayer {
  playerId: string;
  bets: RouletteBet[];
}

export interface RouletteSpinResult {
  number: number; // 0-36
  color: 'RED' | 'BLACK' | 'GREEN';
}

export interface RouletteSettlementLine {
  playerId: string;
  totalStaked: number;
  totalProfit: number; // profit net (hors remise de la mise)
  totalReturn: number; // total rendu au joueur = mises gagnantes + profits
  winningBets: Array<{
    bet: RouletteBet;
    profit: number;
    returned: number;
  }>;
}

export interface RouletteGameState {
  gameId: string;
  createdAt: string;
  status: RouletteGameStatus;

  players: RoulettePlayer[];

  lastSpin?: RouletteSpinResult;
  lastSettlement?: RouletteSettlementLine[];
}
