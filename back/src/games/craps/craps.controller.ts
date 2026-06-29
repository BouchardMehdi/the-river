import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtUser } from '../../auth/jwt.strategy';
import { CrapsService } from './craps.service';

@UseGuards(JwtAuthGuard)
@Controller('craps')
export class CrapsController {
  constructor(private readonly craps: CrapsService) {}

  @Post('play')
  async play(
    @CurrentUser() user: JwtUser,
    @Body() body: { guessTotal: number; bet: number },
  ) {
    return this.craps.play(user, body);
  }
}
