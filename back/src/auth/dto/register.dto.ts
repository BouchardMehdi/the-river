import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username: string;

  @IsEmail()
  @MaxLength(190)
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;
}
