import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BetType } from '../roulette.types';

class BetDto {
  @IsEnum(BetType)
  type!: BetType;

  @IsNumber()
  @Min(1)
  amount!: number;

  /**
   * selection dépend du type.
   * On valide finement côté service (pour rester simple ici).
   */
  @IsOptional()
  @IsObject()
  selection?: Record<string, any>;
}

export class PlaceRouletteBetsDto {
  @IsString()
  @MinLength(1)
  playerId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BetDto)
  bets!: BetDto[];
}
