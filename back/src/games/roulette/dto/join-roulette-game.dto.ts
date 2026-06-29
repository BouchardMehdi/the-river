import { IsString, MinLength } from 'class-validator';

export class JoinRouletteGameDto {
  @IsString()
  @MinLength(1)
  playerId!: string;
}
