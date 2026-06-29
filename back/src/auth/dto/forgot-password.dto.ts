import { IsEmail, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(190)
  email: string;
}
