import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address, for example name@company.com' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Enter your password' })
  password!: string;
}
