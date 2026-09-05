import {
  Controller,
  Get,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

interface HealthBody {
  status: 'ok';
  service: 'stockroom-api';
}

interface DeepHealthBody extends HealthBody {
  database: 'up';
}

/**
 * Liveness and readiness are deliberately different endpoints.
 *
 * `/api/health` touches nothing, so a transient database outage cannot get a
 * healthy pod restarted. `/api/health/deep` round-trips to Postgres and is what
 * readiness should watch, so a pod that cannot serve queries is pulled out of
 * the Service's endpoints instead of returning errors to users.
 */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check(): HealthBody {
    return { status: 'ok', service: 'stockroom-api' };
  }

  @Get('deep')
  async deepCheck(): Promise<DeepHealthBody> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error(
        `Database probe failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new ServiceUnavailableException({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database unavailable',
      });
    }
    return { status: 'ok', service: 'stockroom-api', database: 'up' };
  }
}
