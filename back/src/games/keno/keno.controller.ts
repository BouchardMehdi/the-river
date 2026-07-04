import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { JwtUser } from '../../auth/jwt.strategy';
import { KenoService } from './keno.service';

@UseGuards(JwtAuthGuard)
@Controller('keno')
export class KenoController {
  constructor(private readonly keno: KenoService) {}

  @Get('rules')
  rules() {
    return this.keno.rules();
  }

  @Post('play')
  play(@CurrentUser() user: JwtUser, @Body() body: { bet?: number; picks?: number[] }) {
    return this.keno.play(user, body);
  }
}
