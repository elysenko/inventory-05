import { UsersRouter } from '../users/users.router';

/**
 * Backend-local description of the composed tRPC router surface.
 *
 * nestjs-trpc builds the real router at runtime from the `@Router`-annotated
 * providers, so this type exists only for backend-side reference and tests.
 *
 * NOTE: the Angular client deliberately does NOT import this file — it keeps
 * its own zero-dependency mirror in `frontend/src/app/trpc-client.types.ts`,
 * because the two packages build with separate `node_modules` and the type
 * chain here pulls in nestjs-trpc/@nestjs/common/@prisma/client. When a
 * procedure changes, update both.
 */
export type AppRouter = {
  users: InstanceType<typeof UsersRouter>;
};
