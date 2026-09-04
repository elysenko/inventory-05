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

/** Derives a display name from an email local part: `dana.ruiz@…` → `Dana Ruiz`. */
function nameFromEmail(email: string): string {
  return (
    email
      .split('@')[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Team Member'
  );
}

/**
 * Preview-only role inference. Lets a reviewer reach any privilege level by
 * typing a matching address — no credentials are stored anywhere in the app.
 */
function inferRole(email: string): Role {
  const local = email.split('@')[0].toLowerCase();
  if (local.includes('admin')) {
    return 'ADMIN';
  }
  if (local.includes('manager') || local.includes('lead')) {
    return 'MANAGER';
  }
  return 'USER';
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
   * Resolves a sign-in. In a static preview there is no API server, so the
   * credentials are resolved locally and synchronously — a network call would
   * strand the reviewer on the login screen.
   */
  async login(email: string, password: string): Promise<void> {
    const trimmed = email.trim();
    if (!trimmed || !password) {
      throw new Error('Enter both your email address and password.');
    }
    if (!EMAIL_RE.test(trimmed)) {
      throw new Error('Enter a valid email address, for example name@company.com');
    }

    if (COLOSSUS_PREVIEW) {
      this.setSession(
        {
          id: 'preview-user',
          email: trimmed,
          name: nameFromEmail(trimmed),
          role: inferRole(trimmed),
        },
        'preview-session',
      );
      return;
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

    if (COLOSSUS_PREVIEW) {
      this.setSession(
        { id: 'preview-user', email: trimmed, name: name.trim(), role: inferRole(trimmed) },
        'preview-session',
      );
      return;
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

  logout(): void {
    remove(USER_KEY);
    remove(TOKEN_KEY);
    this.user.set(null);
    this.token.set(null);
    void this.router.navigate(['/login']);
  }

  /** Preview-only: seeds a signed-in session without any credentials. */
  previewSignIn(role: Role = 'ADMIN'): void {
    if (!COLOSSUS_PREVIEW) {
      return;
    }
    this.setSession(
      {
        id: 'preview-user',
        email: 'demo.user@stockroom.example',
        name: 'Demo User',
        role,
      },
      'preview-session',
    );
  }

  /**
   * Preview-only: guarantees a cold load of a deep link renders that screen
   * instead of bouncing a reviewer to `/login`. Never redirects.
   */
  ensurePreviewSession(minimumRole: Role = 'USER'): void {
    if (!COLOSSUS_PREVIEW) {
      return;
    }
    const current = this.user();
    if (!current) {
      this.previewSignIn(minimumRole === 'USER' ? 'ADMIN' : minimumRole);
      return;
    }
    if (ROLES.indexOf(current.role) < ROLES.indexOf(minimumRole)) {
      this.setSession({ ...current, role: minimumRole }, this.token() ?? 'preview-session');
    }
  }

  /** Preview-only: lets a reviewer see how each role changes the navigation. */
  setPreviewRole(role: Role): void {
    if (!COLOSSUS_PREVIEW) {
      return;
    }
    const current = this.user();
    if (current) {
      this.setSession({ ...current, role }, this.token() ?? 'preview-session');
    }
  }
}
