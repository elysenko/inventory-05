import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { FieldError } from '../models';

/**
 * Every REST call goes through `/api`, which is what nginx proxies to the
 * NestJS pod (`location /api/ { proxy_pass http://backend:3000/api/; }`) and
 * what the platform records as `glue.frontend_api_base`. Keeping it relative
 * means the SPA works unchanged on localhost, in compose and in-cluster.
 */
export const API_BASE = '/api';

export type QueryValue = string | number | boolean | null | undefined;

/**
 * Normalised transport failure.
 *
 * The API has exactly one error envelope — `{ statusCode, message, errors? }`
 * (see backend `common/validation.ts` and `PrismaExceptionFilter`) — so every
 * caller can render `message` inline and, when it needs to, pin a message to a
 * specific form control through `fieldError()`.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors: FieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** First message scoped to `field`, or null when the failure was not field-level. */
  fieldError(field: string): string | null {
    return this.errors.find((error) => error.field === field)?.message ?? null;
  }
}

/** Nest's `message` is a string for thrown exceptions and a string[] for pipes. */
function readMessage(body: unknown, status: number): string {
  const payload = body as { message?: unknown; error?: unknown } | null;
  const raw = payload?.message ?? payload?.error;
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === 'string').join(' ');
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw;
  }
  return status === 0
    ? 'Cannot reach the StockRoom API. Check that the service is running.'
    : `Request failed (${status}).`;
}

function readFieldErrors(body: unknown): FieldError[] {
  const raw = (body as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (entry): entry is FieldError =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as FieldError).field === 'string' &&
      typeof (entry as FieldError).message === 'string',
  );
}

/** Turns a transport-level failure into the app's single error type. */
export function toApiError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) {
    return error;
  }
  if (error instanceof HttpErrorResponse) {
    const detail =
      typeof error.error === 'string' ? safeParse(error.error) : error.error;
    return new ApiRequestError(
      error.status,
      readMessage(detail, error.status),
      readFieldErrors(detail),
    );
  }
  return new ApiRequestError(0, error instanceof Error ? error.message : 'Unexpected error.');
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

/**
 * Thin promise wrapper over HttpClient. Components `await` these calls, so the
 * bearer token (attached by `authInterceptor`) and the error envelope are both
 * handled in one place instead of at every call site.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  get<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    return this.run(this.http.get<T>(API_BASE + path, { params: buildParams(query) }));
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.run(this.http.post<T>(API_BASE + path, body));
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.run(this.http.patch<T>(API_BASE + path, body));
  }

  delete<T>(path: string): Promise<T> {
    return this.run(this.http.delete<T>(API_BASE + path));
  }

  private async run<T>(source: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(source);
    } catch (error) {
      throw toApiError(error);
    }
  }
}

/** Empty, null and undefined values are dropped so filters clear cleanly. */
function buildParams(query?: Record<string, QueryValue>): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    params = params.set(key, String(value));
  }
  return params;
}
