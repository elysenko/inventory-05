import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsString()
  @MinLength(1, { message: 'Enter your name' })
  @MaxLength(120)
  name!: string;

  @IsEmail({}, { message: 'Enter a valid email address, for example name@company.com' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Use at least 8 characters' })
  @MaxLength(200)
  password!: string;
}
