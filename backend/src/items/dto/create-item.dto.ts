import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateItemDto {
  @IsString()
  @MinLength(1, { message: 'Enter a SKU' })
  @MaxLength(64)
  sku!: string;

  @IsString()
  @MinLength(1, { message: 'Enter an item name' })
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1, { message: 'Enter a unit, for example box or each' })
  @MaxLength(32)
  unit!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @Type(() => Number)
  @IsInt({ message: 'Reorder level must be a whole number' })
  @Min(0, { message: 'Reorder level cannot be negative' })
  reorderAt!: number;
}
