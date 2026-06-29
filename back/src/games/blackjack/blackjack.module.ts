import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";

import { UsersModule } from "../../users/users.module";
import { AuthModule } from "../../auth/auth.module";

import { BlackjackController } from "./blackjack.controller";
import { BlackjackService } from "./blackjack.service";

import { BlackjackTable } from "./entities/blackjack-table.entity";
import { BlackjackTablePlayer } from "./entities/blackjack-table-player.entity";
import { BlackjackGame } from "./entities/blackjack-game.entity";
import { BlackjackChatGateway } from "./blackjack-chat.gateway";

// ✅ NEW
import { StatsModule } from "../stats/stats.module";

@Module({
  imports: [
    ConfigModule, // ✅ pour ConfigService dans le gateway
    AuthModule,   // ✅ pour JwtService (via JwtModule exporté par AuthModule)
    UsersModule,
    StatsModule,  // ✅ NEW
    TypeOrmModule.forFeature([BlackjackTable, BlackjackTablePlayer, BlackjackGame]),
  ],
  controllers: [BlackjackController],
  providers: [BlackjackService, BlackjackChatGateway],
})
export class BlackjackModule {}
