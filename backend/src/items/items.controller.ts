import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { MovementsService } from '../movements/movements.service';
import type { MovementDto } from '../movements/movements.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemsService } from './items.service';
import type { ItemDetailDto, ItemDto } from './items.service';

@ApiBearerAuth()
@ApiTags('items')
@Controller('items')
export class ItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly movements: MovementsService,
  ) {}

  @Get()
  findAll(@Query('q') q?: string): Promise<ItemDto[]> {
    return this.items.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<ItemDetailDto> {
    return this.items.findOne(id);
  }

  /**
   * Item-scoped history. Unlike the org-wide audit log this stays open to every
   * signed-in user, because the item detail screen's Movements tab needs it.
   */
  @Get(':id/movements')
  findMovements(@Param('id') id: string): Promise<MovementDto[]> {
    return this.movements.findForItem(id);
  }

  @Roles(Role.MANAGER)
  @Post()
  create(@Body() dto: CreateItemDto): Promise<ItemDto> {
    return this.items.create(dto);
  }

  @Roles(Role.MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateItemDto): Promise<ItemDto> {
    return this.items.update(id, dto);
  }

  @Roles(Role.MANAGER)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.items.remove(id);
  }
}
