import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MovementType } from '@prisma/client';

export class QueryMovementsDto {
  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsEnum(MovementType, { message: 'Type must be IN, OUT or TRANSFER' })
  type?: MovementType;

  /** Inclusive lower bound on `createdAt`, as an ISO date or date-time string. */
  @IsOptional()
  @IsDateString({}, { message: 'From must be a date' })
  from?: string;

  /** Inclusive upper bound; a bare `YYYY-MM-DD` is widened to end-of-day. */
  @IsOptional()
  @IsDateString({}, { message: 'To must be a date' })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
