import { IsInt, Min } from "class-validator";

export class PlaceBetDto {
  @IsInt()
  @Min(1)
  amount: number;
}
