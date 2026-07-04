import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { JwtUser } from '../../auth/jwt.strategy';
import { WheelService } from './wheel.service';

@UseGuards(JwtAuthGuard)
@Controller('wheel')
export class WheelController {
  constructor(private readonly wheel: WheelService) {}

  @Get('config')
  config() {
    return this.wheel.config();
  }

  @Post('spin')
  spin(@CurrentUser() user: JwtUser, @Body() body: { bet?: number }) {
    return this.wheel.spin(user, body);
  }
}
