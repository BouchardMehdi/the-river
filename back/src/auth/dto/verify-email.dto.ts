import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail()
  @MaxLength(190)
  email: string;

  @IsString()
  @Length(6, 6)
  code: string;
}
