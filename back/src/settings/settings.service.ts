import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserSettingsEntity } from './entities/user-settings.entity';
import type { UserSettings } from './settings.types';

const GAME_KEYS = [
  'SLOTS',
  'ROULETTE',
  'POKER',
  'BLACKJACK',
  'CRAPS',
  'PACHINKO',
  'HILO',
  'MINES',
  'KENO',
  'BACCARAT',
  'WHEEL',
  'CRASH',
];

export const DEFAULT_USER_SETTINGS: UserSettings = {
  notifications: {
    enabled: true,
    questReady: true,
    questRecharge: true,
    questClaimed: true,
    dailyBonus: true,
    turnReminder: true,
    weeklySummary: true,
    leaderboard: false,
    easterEgg: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    frequency: 'instant',
  },
  gameplay: {
    defaultBet: 25,
    confirmLargeBet: true,
    largeBetThreshold: 100,
    reducedAnimations: false,
    autoOpenRules: false,
  },
  interface: {
    showLeaderboardByDefault: true,
    compactStats: true,
    highContrast: false,
    favoriteGames: ['SLOTS', 'ROULETTE', 'POKER', 'BLACKJACK'],
  },
  privacy: {
    showInLeaderboard: true,
    publicTableName: true,
  },
};

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(UserSettingsEntity)
    private readonly settingsRepo: Repository<UserSettingsEntity>,
  ) {}

  async onModuleInit() {
    await this.ensureTable();
  }

  async getForUser(userId: number): Promise<UserSettings> {
    const row = await this.getOrCreateRow(userId);
    return this.normalizeSettings(this.parse(row.settingsJson));
  }

  async updateForUser(userId: number, patch: unknown): Promise<UserSettings> {
    const row = await this.getOrCreateRow(userId);
    const current = this.normalizeSettings(this.parse(row.settingsJson));
    const next = this.normalizeSettings(this.deepMerge(current, patch));
    row.settingsJson = JSON.stringify(next);
    await this.settingsRepo.save(row);
    return next;
  }

  async notificationAllowed(userId: number, category: keyof UserSettings['notifications']) {
    const settings = await this.getForUser(userId);
    if (!settings.notifications.enabled) return false;
    if (settings.notifications.quietHoursEnabled && this.inQuietHours(settings)) return false;
    return Boolean(settings.notifications[category]);
  }

  private async ensureTable() {
    try {
      await this.settingsRepo.query(`
        CREATE TABLE IF NOT EXISTS user_settings (
          id int NOT NULL AUTO_INCREMENT,
          userId int NOT NULL,
          settingsJson longtext NOT NULL,
          createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE KEY IDX_user_settings_userId (userId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } catch (err) {
      this.logger.warn(`Table user_settings non initialisee: ${(err as Error).message}`);
    }
  }

  private async getOrCreateRow(userId: number) {
    let row = await this.settingsRepo.findOne({ where: { userId } as any });
    if (!row) {
      row = this.settingsRepo.create({
        userId,
        settingsJson: JSON.stringify(DEFAULT_USER_SETTINGS),
      });
      row = await this.settingsRepo.save(row);
    }
    return row;
  }

  private parse(value: string) {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  private deepMerge(base: unknown, patch: unknown): unknown {
    if (!this.isPlainObject(base)) return patch;
    if (!this.isPlainObject(patch)) return base;

    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      out[key] = this.isPlainObject(value) && this.isPlainObject(out[key])
        ? this.deepMerge(out[key], value)
        : value;
    }
    return out;
  }

  private normalizeSettings(raw: unknown): UserSettings {
    const value = this.isPlainObject(raw) ? raw : {};
    const notifications = this.isPlainObject(value.notifications) ? value.notifications : {};
    const gameplay = this.isPlainObject(value.gameplay) ? value.gameplay : {};
    const ui = this.isPlainObject(value.interface) ? value.interface : {};
    const privacy = this.isPlainObject(value.privacy) ? value.privacy : {};

    const favoriteGames = Array.isArray(ui.favoriteGames)
      ? ui.favoriteGames
          .map((game) => String(game).toUpperCase())
          .filter((game) => GAME_KEYS.includes(game))
      : DEFAULT_USER_SETTINGS.interface.favoriteGames;

    return {
      notifications: {
        ...DEFAULT_USER_SETTINGS.notifications,
        enabled: this.bool(notifications.enabled, DEFAULT_USER_SETTINGS.notifications.enabled),
        questReady: this.bool(notifications.questReady, DEFAULT_USER_SETTINGS.notifications.questReady),
        questRecharge: this.bool(notifications.questRecharge, DEFAULT_USER_SETTINGS.notifications.questRecharge),
        questClaimed: this.bool(notifications.questClaimed, DEFAULT_USER_SETTINGS.notifications.questClaimed),
        dailyBonus: this.bool(notifications.dailyBonus, DEFAULT_USER_SETTINGS.notifications.dailyBonus),
        turnReminder: this.bool(notifications.turnReminder, DEFAULT_USER_SETTINGS.notifications.turnReminder),
        weeklySummary: this.bool(notifications.weeklySummary, DEFAULT_USER_SETTINGS.notifications.weeklySummary),
        leaderboard: this.bool(notifications.leaderboard, DEFAULT_USER_SETTINGS.notifications.leaderboard),
        easterEgg: this.bool(notifications.easterEgg, DEFAULT_USER_SETTINGS.notifications.easterEgg),
        quietHoursEnabled: this.bool(
          notifications.quietHoursEnabled,
          DEFAULT_USER_SETTINGS.notifications.quietHoursEnabled,
        ),
        quietHoursStart: this.timeString(
          notifications.quietHoursStart,
          DEFAULT_USER_SETTINGS.notifications.quietHoursStart,
        ),
        quietHoursEnd: this.timeString(
          notifications.quietHoursEnd,
          DEFAULT_USER_SETTINGS.notifications.quietHoursEnd,
        ),
        frequency: ['instant', 'digest', 'minimal'].includes(String(notifications.frequency))
          ? (notifications.frequency as UserSettings['notifications']['frequency'])
          : DEFAULT_USER_SETTINGS.notifications.frequency,
      },
      gameplay: {
        defaultBet: this.positiveInt(gameplay.defaultBet, DEFAULT_USER_SETTINGS.gameplay.defaultBet, 1, 10000),
        confirmLargeBet: this.bool(gameplay.confirmLargeBet, DEFAULT_USER_SETTINGS.gameplay.confirmLargeBet),
        largeBetThreshold: this.positiveInt(
          gameplay.largeBetThreshold,
          DEFAULT_USER_SETTINGS.gameplay.largeBetThreshold,
          1,
          100000,
        ),
        reducedAnimations: this.bool(gameplay.reducedAnimations, DEFAULT_USER_SETTINGS.gameplay.reducedAnimations),
        autoOpenRules: this.bool(gameplay.autoOpenRules, DEFAULT_USER_SETTINGS.gameplay.autoOpenRules),
      },
      interface: {
        showLeaderboardByDefault: this.bool(
          ui.showLeaderboardByDefault,
          DEFAULT_USER_SETTINGS.interface.showLeaderboardByDefault,
        ),
        compactStats: this.bool(ui.compactStats, DEFAULT_USER_SETTINGS.interface.compactStats),
        highContrast: this.bool(ui.highContrast, DEFAULT_USER_SETTINGS.interface.highContrast),
        favoriteGames,
      },
      privacy: {
        showInLeaderboard: this.bool(privacy.showInLeaderboard, DEFAULT_USER_SETTINGS.privacy.showInLeaderboard),
        publicTableName: this.bool(privacy.publicTableName, DEFAULT_USER_SETTINGS.privacy.publicTableName),
      },
    };
  }

  private bool(value: unknown, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
  }

  private positiveInt(value: unknown, fallback: number, min: number, max: number) {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  private timeString(value: unknown, fallback: string) {
    return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : fallback;
  }

  private isPlainObject(value: unknown): value is Record<string, any> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private inQuietHours(settings: UserSettings) {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const start = this.minutes(settings.notifications.quietHoursStart);
    const end = this.minutes(settings.notifications.quietHoursEnd);
    if (start === end) return false;
    if (start < end) return minutes >= start && minutes < end;
    return minutes >= start || minutes < end;
  }

  private minutes(value: string) {
    const [hour, minute] = value.split(':').map((part) => Number(part));
    return hour * 60 + minute;
  }
}
