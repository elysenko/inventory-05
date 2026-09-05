import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { API_BASE } from './api/api-client.service';

/** Endpoints that mint a session and must never carry (or react to) a stale token. */
const ANONYMOUS_PATHS = [`${API_BASE}/auth/login`, `${API_BASE}/auth/signup`];

/**
 * Attaches the bearer token to every API call and turns the two auth failures
 * into navigation:
 *
 *   401 -> the token is missing, expired or revoked. The stored session is
 *          cleared and the user is sent to /login with a returnUrl, so the
 *          screen they wanted resumes after signing in.
 *   403 -> authenticated but under-privileged. Routed to /403 rather than
 *          silently rendering an empty screen.
 *
 * Login and signup are exempt: a 401 there is "wrong password", which the form
 * renders inline, not a session expiry.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isApi = req.url.startsWith(API_BASE);
  const isAnonymous = ANONYMOUS_PATHS.some((path) => req.url.startsWith(path));
  const token = auth.token();

  const authorized =
    isApi && !isAnonymous && token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (isApi && !isAnonymous && error instanceof HttpErrorResponse) {
        if (error.status === 401) {
          const returnUrl = router.url.startsWith('/login') ? null : router.url;
          auth.clearSession();
          void router.navigate(['/login'], {
            queryParams: returnUrl ? { returnUrl } : {},
          });
        } else if (error.status === 403) {
          void router.navigate(['/403']);
        }
      }
      return throwError(() => error);
    }),
  );
};
