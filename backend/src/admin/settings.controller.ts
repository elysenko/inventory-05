import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';
import type { AdminSettingDto } from './settings.service';

@ApiBearerAuth()
@ApiTags('admin')
@Roles(Role.ADMIN)
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  findAll(): Promise<AdminSettingDto[]> {
    return this.settings.findAll();
  }

  @Patch()
  update(@Body() dto: UpdateSettingsDto): Promise<AdminSettingDto[]> {
    return this.settings.update(dto);
  }
}
