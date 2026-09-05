import 'reflect-metadata';
import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory, type NestApplication } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildValidationPipe } from './common/validation';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestApplication>(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  // Everything lives under /api — the SPA's nginx proxies exactly that prefix.
  // `/healthz` is excluded so Kubernetes probes can reach the pod directly.
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'healthz', method: RequestMethod.GET }],
  });

  app.useGlobalPipes(buildValidationPipe());

  // In production the SPA and the API share an origin behind nginx, so CORS is
  // moot. `origin: true` reflects the caller for local `ng serve` on :4200.
  // Auth rides in the Authorization header, never in a cookie.
  const frontendUrl = process.env.FRONTEND_URL;
  app.enableCors({
    origin: frontendUrl ?? true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('StockRoom API')
    .setDescription('Multi-location inventory: items, locations, movements and reports')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`StockRoom API listening on http://0.0.0.0:${port}/api`);
}

void bootstrap();
