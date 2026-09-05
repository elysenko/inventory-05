import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CreateMovementDto } from './dto/create-movement.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { MovementsService } from './movements.service';
import type { MovementDto, MovementPageDto } from './movements.service';

@ApiBearerAuth()
@ApiTags('movements')
@Controller('movements')
export class MovementsController {
  constructor(private readonly movements: MovementsService) {}

  /** The org-wide audit log is a manager view; clerks only see per-item history. */
  @Roles(Role.MANAGER)
  @Get()
  findAll(@Query() query: QueryMovementsDto): Promise<MovementPageDto> {
    return this.movements.findAll(query);
  }

  /** Any signed-in user can record stock moving — that is the clerk's core job. */
  @Post()
  create(
    @Body() dto: CreateMovementDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MovementDto> {
    return this.movements.create(dto, user);
  }
}
