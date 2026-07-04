import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { JwtUser } from '../../auth/jwt.strategy';
import { BaccaratService, type BaccaratBet } from './baccarat.service';

@UseGuards(JwtAuthGuard)
@Controller('baccarat')
export class BaccaratController {
  constructor(private readonly baccarat: BaccaratService) {}

  @Post('play')
  play(@CurrentUser() user: JwtUser, @Body() body: { bet?: number; betOn?: BaccaratBet }) {
    return this.baccarat.play(user, body);
  }
}
