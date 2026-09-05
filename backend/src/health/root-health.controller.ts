import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Prefix-free twin of `/api/health`, mounted at `/healthz`.
 *
 * Kubernetes probes hit the pod directly and never traverse the SPA's nginx
 * `/api` proxy, so the liveness path must exist outside the global `api`
 * prefix (see `setGlobalPrefix`'s exclude list in main.ts).
 */
@ApiTags('health')
@Public()
@Controller('healthz')
export class RootHealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
