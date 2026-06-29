export type User = {
  userId: number;
  username: string;
  email: string;
  emailVerified: boolean;
  credits: number;
  points: number;
};

export type AuthResponse = {
  access_token: string;
  user: User;
  needsEmailVerification?: boolean;
};

export type Quest = {
  key: string;
  title?: string;
  label?: string;
  description?: string;
  progress?: number;
  target?: number;
  completed?: boolean;
  claimed?: boolean;
  rewardCredits?: number;
  rewardPoints?: number;
  type?: string;
};

export type PokerTable = {
  id?: string;
  tableId?: string;
  name?: string;
  status?: string;
  phase?: string;
  players?: string[];
  communityCards?: Card[];
  pot?: number;
  currentBet?: number;
  stacks?: Record<string, number>;
  bets?: Record<string, number>;
  ownerPlayerId?: string;
  mode?: string;
  visibility?: string;
  lastWinnerId?: string;
  lastWinnerHandDescription?: string;
};

export type Card = {
  rank: string;
  suit: string;
};

export type BlackjackTable = {
  code: string;
  name: string;
  status: string;
  ownerId: number;
  minBet: number;
  tableMaxBet?: number | null;
  maxPlayers: number;
  players?: Array<{ userId: number; username: string }>;
};

export type BlackjackState = {
  tableCode: string;
  table: BlackjackTable;
  game?: {
    round: number;
    phase: string;
    dealer: { cards: Card[]; value: number };
    currentTurnIndex: number;
    turnOrder: number[];
    players: Record<
      string,
      {
        userId: number;
        username: string;
        bet: number;
        cards: Card[];
        status: string;
        value: number;
      }
    >;
    roundResult?: { message: string; netWins: Record<string, number> } | null;
  };
  you: { userId: number; username: string };
};

export type ApiError = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};
