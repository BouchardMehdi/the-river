import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

import { PokerTableEntity } from './entities/poker-table.entity';

import { DeckService } from './services/deck.service';
import { TableSeedService } from './services/table-seed.service';
import { PlayerService } from './services/player.service';
import { GameService } from './services/game.service';
import { BettingService } from './services/betting.service';
import { BotService } from './services/bot.service';
import { BotDecisionService } from './services/bot-decision.service';
import { TableResetService } from './services/table-reset.service';
import { HandEvaluatorService } from './services/hand-evaluator.service';

import { UsersModule } from '../../users/users.module';
import { ChatModule } from './chat/chat.module';

import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PokerTableEntity]),
    UsersModule,
    ChatModule,
    StatsModule, // ✅ NEW
  ],
  controllers: [TablesController],
  providers: [
    TablesService,
    DeckService,
    TableSeedService,
    PlayerService,
    GameService,
    BettingService,
    BotService,
    BotDecisionService,
    TableResetService,
    HandEvaluatorService,
  ],
})
export class TablesModule {}
