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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsService } from './locations.service';
import type { LocationDto } from './locations.service';

@ApiBearerAuth()
@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  findAll(): Promise<LocationDto[]> {
    return this.locations.findAll();
  }

  @Roles(Role.MANAGER)
  @Post()
  create(@Body() dto: CreateLocationDto): Promise<LocationDto> {
    return this.locations.create(dto);
  }

  @Roles(Role.MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLocationDto): Promise<LocationDto> {
    return this.locations.update(id, dto);
  }

  @Roles(Role.MANAGER)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.locations.remove(id);
  }
}
