import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('config')
  config() {
    return this.notifications.getConfig();
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  status(@CurrentUser() user: JwtUser) {
    return this.notifications.statusForUser(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  subscribe(
    @CurrentUser() user: JwtUser,
    @Body() body: { subscription?: unknown },
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.notifications.upsertSubscription(user.userId, body.subscription ?? body, userAgent);
  }

  @UseGuards(JwtAuthGuard)
  @Post('unsubscribe')
  unsubscribe(@CurrentUser() user: JwtUser, @Body() body: { endpoint?: string }) {
    return this.notifications.unsubscribe(user.userId, body.endpoint);
  }

  @UseGuards(JwtAuthGuard)
  @Post('test')
  test(@CurrentUser() user: JwtUser) {
    return this.notifications.sendTest(user.userId);
  }
}
