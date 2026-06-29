import { IsIn } from "class-validator";

export class PlayerActionDto {
  @IsIn(["hit", "stand"])
  action: "hit" | "stand";
}
