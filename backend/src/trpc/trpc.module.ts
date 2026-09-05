import { Module } from '@nestjs/common';
import { TRPCModule } from 'nestjs-trpc';
import { UsersModule } from '../users/users.module';
import { UsersRouter } from '../users/users.router';

/**
 * Mounts the tRPC driver at `/trpc` and registers the child routers.
 *
 * Router classes are discovered through the Nest DI container: any provider
 * annotated with `@Router({ alias })` is composed into the root router, so a
 * new router only has to be listed in `providers` here.
 */
@Module({
  imports: [
    TRPCModule.forRoot({
      basePath: '/trpc',
    }),
    UsersModule,
  ],
  providers: [UsersRouter],
  exports: [TRPCModule],
})
export class TrpcAppModule {}
