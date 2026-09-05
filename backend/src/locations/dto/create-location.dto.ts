import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  @MinLength(1, { message: 'Enter a location name' })
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1, { message: 'Enter a zone code' })
  @MaxLength(32)
  zone!: string;
}
