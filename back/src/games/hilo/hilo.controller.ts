import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { JwtUser } from '../../auth/jwt.strategy';
import { HiLoService } from './hilo.service';

@UseGuards(JwtAuthGuard)
@Controller('hilo')
export class HiLoController {
  constructor(private readonly hilo: HiLoService) {}

  @Get('session')
  session(@CurrentUser() user: JwtUser) {
    return this.hilo.session(user);
  }

  @Post('start')
  start(@CurrentUser() user: JwtUser, @Body() body: { bet?: number }) {
    return this.hilo.start(user, body);
  }

  @Post('guess')
  guess(@CurrentUser() user: JwtUser, @Body() body: { guess?: 'HIGHER' | 'LOWER' | string }) {
    return this.hilo.guess(user, body);
  }

  @Post('cashout')
  cashout(@CurrentUser() user: JwtUser) {
    return this.hilo.cashout(user);
  }
}
