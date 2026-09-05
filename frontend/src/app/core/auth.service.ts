import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthResponse, Role, User } from './models';
import { readJson, readString, remove, write } from './storage';

const USER_KEY = 'user';
const TOKEN_KEY = 'token';
const ROLES: Role[] = ['USER', 'MANAGER', 'ADMIN'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUser(value: unknown): boolean {
  const u = value as Partial<User> | null;
  return (
    !!u &&
    typeof u === 'object' &&
    typeof u.id === 'string' &&
    typeof u.email === 'string' &&
    typeof u.role === 'string' &&
    ROLES.includes(u.role as Role)
  );
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly user = signal<User | null>(this.restoreUser());
  readonly token = signal<string | null>(readString(TOKEN_KEY));

  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isManager = computed(() => {
    const role = this.user()?.role;
    return role === 'MANAGER' || role === 'ADMIN';
  });
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');

  /** Defensive restore: an unrecognised stored shape is cleared, never thrown. */
  private restoreUser(): User | null {
    const restored = readJson<User>(USER_KEY, isUser);
    if (!restored) {
      remove(USER_KEY);
      remove(TOKEN_KEY);
      return null;
    }
    return restored;
  }

  private setSession(user: User, token: string): void {
    write(USER_KEY, user);
    write(TOKEN_KEY, token);
    this.user.set(user);
    this.token.set(token);
  }

  /**
   * Resolves a sign-in against `POST /api/auth/login`. There is no local or
   * offline path: the server is the only thing that can mint a session.
   */
  async login(email: string, password: string): Promise<void> {
    const trimmed = email.trim();
    if (!trimmed || !password) {
      throw new Error('Enter both your email address and password.');
    }
    if (!EMAIL_RE.test(trimmed)) {
      throw new Error('Enter a valid email address, for example name@company.com');
    }

    const res = await firstValueFrom(
      this.http.post<AuthResponse>('/api/auth/login', { email: trimmed, password }),
    );
    this.setSession(res.user, res.accessToken);
  }

  async signup(name: string, email: string, password: string): Promise<void> {
    const trimmed = email.trim();
    if (!name.trim() || !trimmed || !password) {
      throw new Error('Fill in every field to create your account.');
    }
    if (!EMAIL_RE.test(trimmed)) {
      throw new Error('Enter a valid email address, for example name@company.com');
    }

    const res = await firstValueFrom(
      this.http.post<AuthResponse>('/api/auth/signup', {
        name: name.trim(),
        email: trimmed,
        password,
      }),
    );
    this.setSession(res.user, res.accessToken);
  }

  /**
   * Drops the stored session without navigating. Used by `authInterceptor`
   * when the API rejects a token as expired, where the redirect (with a
   * returnUrl) is the interceptor's job.
   */
  clearSession(): void {
    remove(USER_KEY);
    remove(TOKEN_KEY);
    this.user.set(null);
    this.token.set(null);
  }

  logout(): void {
    this.clearSession();
    void this.router.navigate(['/login']);
  }

  /**
   * Re-reads the principal from `GET /api/auth/me`, so a role change on the
   * server shows up without forcing a fresh sign-in. Any failure is swallowed:
   * a 401 is already handled by the interceptor, and a transient network error
   * must not eject a user who is holding a valid token.
   */
  async refresh(): Promise<void> {
    if (!this.token()) {
      return;
    }
    try {
      const user = await firstValueFrom(this.http.get<User>('/api/auth/me'));
      write(USER_KEY, user);
      this.user.set(user);
    } catch {
      /* interceptor owns the 401 path; anything else keeps the cached session */
    }
  }
}
