import { IsString, MinLength } from 'class-validator';

export class CreateRouletteGameDto {
  @IsString()
  @MinLength(1)
  playerId!: string;
}
