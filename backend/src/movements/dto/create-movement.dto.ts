import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MovementType } from '@prisma/client';

export class CreateMovementDto {
  @IsEnum(MovementType, { message: 'Type must be IN, OUT or TRANSFER' })
  type!: MovementType;

  @IsString()
  @MinLength(1, { message: 'Choose an item' })
  itemId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  fromLocId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  toLocId?: string;

  @Type(() => Number)
  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  qty!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
