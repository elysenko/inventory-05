import { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { authInterceptor } from './core/auth.interceptor';
import { routes } from './app.routes';

/**
 * The SPA talks to the NestJS API over REST at `/api` — the prefix nginx
 * proxies to the backend pod and the one the platform records as
 * `glue.frontend_api_base`. All calls go through `core/api/*-api.service.ts`,
 * which layer typed methods over `ApiClient`; `authInterceptor` attaches the
 * bearer token and maps 401/403 onto navigation.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
  ],
};
