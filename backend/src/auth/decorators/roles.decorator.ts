import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const ROLES_KEY = 'colossus:roles';

/**
 * Declares the minimum privilege a route needs. `RolesGuard` treats roles as a
 * hierarchy (USER < MANAGER < ADMIN), so `@Roles('MANAGER')` also admits ADMIN
 * — matching the frontend's `isManager()` signal.
 */
export const Roles = (...roles: Role[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);
