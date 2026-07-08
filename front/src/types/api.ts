export type User = {
  userId: number;
  username: string;
  email: string;
  emailVerified: boolean;
  credits: number;
  points: number;
  avatarUrl?: string | null;
};

export type AuthResponse = {
  access_token: string;
  user: User;
  needsEmailVerification?: boolean;
};

export type UserSettings = {
  notifications: {
    enabled: boolean;
    questReady: boolean;
    questRecharge: boolean;
    questClaimed: boolean;
    dailyBonus: boolean;
    turnReminder: boolean;
    weeklySummary: boolean;
    leaderboard: boolean;
    easterEgg: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    frequency: 'instant' | 'digest' | 'minimal';
  };
  gameplay: {
    defaultBet: number;
    confirmLargeBet: boolean;
    largeBetThreshold: number;
    reducedAnimations: boolean;
    autoOpenRules: boolean;
  };
  interface: {
    theme: 'system' | 'light' | 'dark';
    showLeaderboardByDefault: boolean;
    compactStats: boolean;
    highContrast: boolean;
    favoriteGames: string[];
  };
  privacy: {
    showInLeaderboard: boolean;
    publicTableName: boolean;
  };
};

export type Quest = {
  key: string;
  title?: string;
  label?: string;
  description?: string;
  progress?: number;
  goal?: number;
  target?: number;
  canClaim?: boolean;
  completed?: boolean;
  claimed?: boolean;
  cooldownHours?: number;
  nextAvailableAt?: string | null;
  lastClaimedAt?: string | null;
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
  smallBlindAmount?: number;
  bigBlindAmount?: number;
  stacks?: Record<string, number>;
  bets?: Record<string, number>;
  ownerPlayerId?: string;
  dealerIndex?: number;
  dealerPlayerId?: string;
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
  visibility?: 'PUBLIC' | 'PRIVATE';
  players?: Array<{ userId: number; username: string; avatarUrl?: string | null }>;
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
        avatarUrl?: string | null;
        bet: number;
        cards: Card[];
        status: string;
        value: number;
        activeHandIndex?: number;
        hands?: Array<{
          id: string;
          bet: number;
          cards: Card[];
          status: string;
          value: number;
          active?: boolean;
          canSplit?: boolean;
          canDouble?: boolean;
          doubled?: boolean;
          splitFromPair?: boolean;
        }>;
      }
    >;
    roundResult?: { message: string; winners: string[]; netWins: Record<string, number> } | null;
  };
  you: { userId: number; username: string };
};

export type ApiError = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};
