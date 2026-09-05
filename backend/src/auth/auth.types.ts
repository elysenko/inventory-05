import type { Role } from '@prisma/client';

/**
 * The authenticated principal attached to `request.user` by `JwtStrategy`.
 * Resolved from the database on every request, so a deleted or demoted user
 * cannot keep acting on a still-valid token.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

/** Signed JWT body. `sub` is the User id — the only identity claim we trust. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

/** Wire shape of a user, mirroring `frontend/src/app/core/models.ts#User`. */
export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** Wire shape of a successful login/signup, mirroring `models.ts#AuthResponse`. */
export interface AuthResponseDto {
  accessToken: string;
  user: UserDto;
}
