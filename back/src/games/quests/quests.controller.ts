import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtUser } from '../../auth/jwt.strategy';

import { QuestsService } from './quests.service';

@UseGuards(JwtAuthGuard)
@Controller('quests')
export class QuestsController {
  constructor(private readonly quests: QuestsService) {}

  @Get()
  async list(@CurrentUser() user: JwtUser) {
    return this.quests.listForUser(user.userId);
  }

  @Post(':key/claim')
  async claim(@CurrentUser() user: JwtUser, @Param('key') key: string) {
    return this.quests.claim(user.userId, user.username, key);
  }
}
