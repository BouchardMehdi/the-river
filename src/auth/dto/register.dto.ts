import { IsString, MinLength } from 'class-validator';

export class RegisterDto {
  username: string;
  email: string;
  password: string;
}
