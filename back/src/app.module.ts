import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

import { BlackjackModule } from './games/blackjack/blackjack.module';
import { CrapsModule } from './games/craps/craps.module';
import { EasterEggModule } from './games/easter-egg/easter-egg.module';
import { TablesModule } from './games/poker/tables.module';
import { LeaderboardModule } from './games/poker/leaderboard/leaderboard.module';
import { QuestsModule } from './games/quests/quests.module';
import { PachinkoModule } from './games/pachinko/pachinko.module';
import { RouletteModule } from './games/roulette/roulette.module';
import { SlotsModule } from './games/slots/slots.module';
import { HiLoModule } from './games/hilo/hilo.module';

function envFlag(config: ConfigService, key: string, fallback = false): boolean {
  const value = config.get<string>(key);
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const host = config.get<string>('DB_HOST');
        const username = config.get<string>('DB_USER');
        const password = config.get<string>('DB_PASS');
        const database = config.get<string>('DB_DATABASE');

        if (!host || !username || !database) {
          throw new Error('Variables DB manquantes: DB_HOST / DB_USER / DB_DATABASE');
        }

        const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
        const synchronize = nodeEnv !== 'production' && envFlag(config, 'DB_SYNCHRONIZE', false);

        return {
          type: 'mysql',
          host,
          port: Number(config.get<string>('DB_PORT') ?? 3306),
          username,
          password,
          database,
          autoLoadEntities: true,
          synchronize,
          logging: envFlag(config, 'DB_LOGGING', false),
          charset: 'utf8mb4',
          ssl: envFlag(config, 'DB_SSL', false) ? { rejectUnauthorized: false } : undefined,
        };
      },
    }),

    AuthModule,
    UsersModule,
    EasterEggModule,
    TablesModule,
    LeaderboardModule,
    BlackjackModule,
    RouletteModule,
    SlotsModule,
    CrapsModule,
    PachinkoModule,
    HiLoModule,
    QuestsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
