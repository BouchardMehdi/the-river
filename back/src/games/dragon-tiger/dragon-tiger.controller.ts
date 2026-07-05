import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { JwtUser } from '../../auth/jwt.strategy';
import { DragonTigerService, type DragonTigerBet } from './dragon-tiger.service';

@UseGuards(JwtAuthGuard)
@Controller('dragon-tiger')
export class DragonTigerController {
  constructor(private readonly dragonTiger: DragonTigerService) {}

  @Post('play')
  play(@CurrentUser() user: JwtUser, @Body() body: { bet?: number; betOn?: DragonTigerBet }) {
    return this.dragonTiger.play(user, body);
  }
}
