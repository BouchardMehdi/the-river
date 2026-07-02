import { IsIn } from "class-validator";

export class PlayerActionDto {
  @IsIn(["hit", "stand", "double", "split"])
  action: "hit" | "stand" | "double" | "split";
}
