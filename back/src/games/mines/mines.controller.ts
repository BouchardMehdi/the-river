import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { JwtUser } from '../../auth/jwt.strategy';
import { MinesService } from './mines.service';

@UseGuards(JwtAuthGuard)
@Controller('mines')
export class MinesController {
  constructor(private readonly mines: MinesService) {}

  @Get('session')
  session(@CurrentUser() user: JwtUser) {
    return this.mines.session(user);
  }

  @Post('start')
  start(@CurrentUser() user: JwtUser, @Body() body: { bet?: number; mines?: number }) {
    return this.mines.start(user, body);
  }

  @Post('reveal')
  reveal(@CurrentUser() user: JwtUser, @Body() body: { cell?: number }) {
    return this.mines.reveal(user, body);
  }

  @Post('cashout')
  cashout(@CurrentUser() user: JwtUser) {
    return this.mines.cashout(user);
  }
}
