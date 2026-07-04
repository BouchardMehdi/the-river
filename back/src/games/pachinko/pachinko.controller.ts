import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { JwtUser } from '../../auth/jwt.strategy';
import { PachinkoService } from './pachinko.service';

@UseGuards(JwtAuthGuard)
@Controller('pachinko')
export class PachinkoController {
  constructor(private readonly pachinko: PachinkoService) {}

  @Post('drop')
  async drop(
    @CurrentUser() user: JwtUser,
    @Body() body: { bet?: number; risk?: string; rows?: number },
  ) {
    return this.pachinko.drop(user, body);
  }

  @Post('start')
  async start(
    @CurrentUser() user: JwtUser,
    @Body() body: { bet?: number; risk?: string; rows?: number },
  ) {
    return this.pachinko.start(user, body);
  }

  @Post('settle')
  async settle(
    @CurrentUser() user: JwtUser,
    @Body() body: { ticketId?: string; finalSlot?: number },
  ) {
    return this.pachinko.settle(user, body);
  }
}
