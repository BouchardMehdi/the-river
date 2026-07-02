import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateBlackjackTableDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  maxPlayers?: number;

  @IsInt()
  @Min(1)
  minBet: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  tableMaxBet?: number;

  @IsOptional()
  @IsIn(["PUBLIC", "PRIVATE"])
  visibility?: "PUBLIC" | "PRIVATE";
}
