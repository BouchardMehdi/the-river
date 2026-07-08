export type NotificationSettings = {
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

export type GameplaySettings = {
  defaultBet: number;
  confirmLargeBet: boolean;
  largeBetThreshold: number;
  reducedAnimations: boolean;
  autoOpenRules: boolean;
};

export type InterfaceSettings = {
  theme: 'system' | 'light' | 'dark';
  showLeaderboardByDefault: boolean;
  compactStats: boolean;
  highContrast: boolean;
  favoriteGames: string[];
};

export type PrivacySettings = {
  showInLeaderboard: boolean;
  publicTableName: boolean;
};

export type UserSettings = {
  notifications: NotificationSettings;
  gameplay: GameplaySettings;
  interface: InterfaceSettings;
  privacy: PrivacySettings;
};
