import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Role } from './models';

/**
 * Guards redirect at most once and never bounce off `/login`, so a
 * guard <-> shell redirect loop (blank page) is structurally impossible.
 */
function allow(minimumRole: Role, fallback: string): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }
    if (minimumRole === 'MANAGER' && !auth.isManager()) {
      return router.createUrlTree([fallback]);
    }
    if (minimumRole === 'ADMIN' && !auth.isAdmin()) {
      return router.createUrlTree([fallback]);
    }
    return true;
  };
}

export const authGuard: CanActivateFn = allow('USER', '/403');
export const managerGuard: CanActivateFn = allow('MANAGER', '/403');
export const adminGuard: CanActivateFn = allow('ADMIN', '/403');
