import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtUser } from '../../auth/jwt.strategy';
import { SpinSlotsDto } from './dto/spin-slots.dto';
import { SlotsService } from './slots.service';

@Controller('slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('spin')
  async spin(@CurrentUser() user: JwtUser, @Body() dto: SpinSlotsDto) {
    return this.slotsService.spin(user, dto);
  }
}
