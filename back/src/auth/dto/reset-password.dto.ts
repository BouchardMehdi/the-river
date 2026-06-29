import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  @MaxLength(190)
  email: string;

  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  newPassword: string;
}
