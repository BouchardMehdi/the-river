import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { BlackjackService } from "./blackjack.service";

import { CreateBlackjackTableDto } from "./dto/create-blackjack-table.dto";
import { PlaceBetDto } from "./dto/place-bet.dto";
import { PlayerActionDto } from "./dto/player-action.dto";

import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { JwtUser } from "../../auth/jwt.strategy";

@Controller("blackjack")
@UseGuards(JwtAuthGuard)
export class BlackjackController {
  constructor(private readonly blackjackService: BlackjackService) {}

  // ============================================================
  // Lobby
  // ============================================================

  @Get("tables")
  list() {
    return this.blackjackService.listTables();
  }

  @Get("tables/:code")
  get(@Param("code") code: string) {
    return this.blackjackService.getTableByCode(code);
  }

  @Post("tables")
  create(@Body() dto: CreateBlackjackTableDto, @CurrentUser() user: JwtUser) {
    return this.blackjackService.createTable(dto, user);
  }

  @Post("tables/:code/join")
  join(@Param("code") code: string, @CurrentUser() user: JwtUser) {
    return this.blackjackService.joinTableByCode(code, user);
  }

  @Post("tables/:code/leave")
  leave(@Param("code") code: string, @CurrentUser() user: JwtUser) {
    return this.blackjackService.leaveTableByCode(code, user);
  }

  // ============================================================
  // Gameplay
  // ============================================================

  // Owner only – démarre la partie (ouvre les mises)
  @Post("tables/:code/start")
  start(@Param("code") code: string, @CurrentUser() user: JwtUser) {
    return this.blackjackService.startGameByCode(code, user);
  }

  // Miser (le deal se fait AUTOMATIQUEMENT quand tout le monde a bet)
  @Post("tables/:code/bet")
  bet(
    @Param("code") code: string,
    @Body() dto: PlaceBetDto,
    @CurrentUser() user: JwtUser
  ) {
    if (!dto || typeof dto.amount !== "number") {
      throw new BadRequestException("INVALID_BET_BODY");
    }
    return this.blackjackService.placeBetByCode(code, dto.amount, user);
  }

  // Action joueur : hit / stand
  @Post("tables/:code/action")
  action(
    @Param("code") code: string,
    @Body() dto: PlayerActionDto,
    @CurrentUser() user: JwtUser
  ) {
    const act = dto?.action;
    if (act !== "hit" && act !== "stand") {
      throw new BadRequestException(
        'INVALID_ACTION_BODY_EXPECTED: {"action":"hit"} or {"action":"stand"}'
      );
    }
    return this.blackjackService.playerActionByCode(code, act, user);
  }

  // Récupérer l’état complet (sans le deck)
  @Get("tables/:code/state")
  state(@Param("code") code: string, @CurrentUser() user: JwtUser) {
    return this.blackjackService.getStateByCode(code, user);
  }
}
