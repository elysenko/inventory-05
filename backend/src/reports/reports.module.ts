import { Module } from '@nestjs/common';
import { ItemsModule } from '../items/items.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ItemsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
