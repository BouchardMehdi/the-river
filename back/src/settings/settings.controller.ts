import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { SettingsService } from './settings.service';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentUser() user: JwtUser) {
    return this.settings.getForUser(user.userId);
  }

  @Patch()
  update(@CurrentUser() user: JwtUser, @Body() body: unknown) {
    return this.settings.updateForUser(user.userId, body);
  }
}
