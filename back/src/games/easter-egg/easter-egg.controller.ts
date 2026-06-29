import { Controller, Get, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtUser } from '../../auth/jwt.strategy';

import { EasterEggService } from './easter-egg.service';

@UseGuards(JwtAuthGuard)
@Controller('easter-egg')
export class EasterEggController {
  constructor(private readonly egg: EasterEggService) {}

  @Get('status')
  async status(@CurrentUser() user: JwtUser) {
    return this.egg.getStatus(user.userId);
  }

  // ✅ appelé quand le joueur clique sur "Retour dashboard"
  @Post('visit')
  async visit(@CurrentUser() user: JwtUser) {
    return this.egg.markVisited(user.userId);
  }
}
