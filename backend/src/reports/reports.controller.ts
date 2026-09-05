import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import type { LowStockRowDto } from './reports.service';

@ApiBearerAuth()
@ApiTags('reports')
@Roles(Role.MANAGER)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('low-stock')
  lowStock(): Promise<LowStockRowDto[]> {
    return this.reports.lowStock();
  }
}
