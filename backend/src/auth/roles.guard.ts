import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { ROLES_KEY } from './decorators/roles.decorator';
import type { AuthUser } from './auth.types';

/** Privilege ladder — a higher rank satisfies every requirement below it. */
const RANK: Record<Role, number> = { USER: 0, MANAGER: 1, ADMIN: 2 };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    const minimum = Math.min(...required.map((role) => RANK[role]));

    if (!user || RANK[user.role] < minimum) {
      throw new ForbiddenException(
        `This action needs the ${required.join(' or ')} role.`,
      );
    }
    return true;
  }
}
