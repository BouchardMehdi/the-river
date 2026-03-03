import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

import { TablesModule } from './games/poker/tables.module';
import { LeaderboardModule } from './games/poker/leaderboard/leaderboard.module';
import { BlackjackModule } from './games/blackjack/blackjack.module';
import { RouletteModule } from './games/roulette/roulette.module';
import { SlotsModule } from './games/slots/slots.module';
import { CrapsModule } from './games/craps/craps.module';

import { EasterEggModule } from './games/easter-egg/easter-egg.module';
import { QuestsModule } from './games/quests/quests.module';
import { FrontPagesController } from './front-pages.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/', // ✅ permet / -> index.html
    }),

    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/public',
    }),

    // ✅ MySQL (phpMyAdmin) via .env
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const host = config.get<string>('DB_HOST');
        const username = config.get<string>('DB_USER');
        const password = config.get<string>('DB_PASS');
        const database = config.get<string>('DB_DATABASE');

        if (!host || !username || !database) {
          throw new Error(
            'Variables DB manquantes: DB_HOST / DB_USER / DB_DATABASE (voir .env)',
          );
        }

        const port = Number(config.get<string>('DB_PORT') ?? 3306);
        const sslEnabled =
          String(config.get<string>('DB_SSL') ?? 'false').toLowerCase() === 'true';

        return {
          type: 'mysql',
          host,
          port,
          username,
          password,
          database,
          autoLoadEntities: true,

          // ✅ DEV: true, PROD: false (voir explication plus bas)
          synchronize: true,

          charset: 'utf8mb4',
          ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
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
    QuestsModule,
  ],
  controllers: [FrontPagesController],
})
export class AppModule {}
