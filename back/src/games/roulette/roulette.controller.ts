import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsEnum, IsNumber, IsObject, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { RouletteService } from './roulette.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtUser } from '../../auth/jwt.strategy';
import { BetType } from './roulette.types';

class BetDto {
  @IsEnum(BetType)
  type!: BetType;

  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsObject()
  selection?: Record<string, any>;
}

class SoloSpinDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BetDto)
  bets!: BetDto[];
}

@Controller('roulette')
export class RouletteController {
  constructor(private readonly roulette: RouletteService) {}

  @UseGuards(JwtAuthGuard)
  @Post('solo/spin')
  async soloSpin(@CurrentUser() user: JwtUser, @Body() dto: SoloSpinDto) {
    return this.roulette.soloSpin(user.username, dto.bets as any);
  }
}
