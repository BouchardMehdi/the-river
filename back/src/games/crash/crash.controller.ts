import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { JwtUser } from '../../auth/jwt.strategy';
import { CrashService } from './crash.service';

@UseGuards(JwtAuthGuard)
@Controller('crash')
export class CrashController {
  constructor(private readonly crash: CrashService) {}

  @Get('session')
  session(@CurrentUser() user: JwtUser) {
    return this.crash.session(user);
  }

  @Post('start')
  start(@CurrentUser() user: JwtUser, @Body() body: { bet?: number }) {
    return this.crash.start(user, body);
  }

  @Post('cashout')
  cashout(@CurrentUser() user: JwtUser) {
    return this.crash.cashout(user);
  }
}
