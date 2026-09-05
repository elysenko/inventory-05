import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, type User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthResponseDto, AuthUser, JwtPayload, UserDto } from './auth.types';
import type { LoginDto } from './dto/login.dto';
import type { SignupDto } from './dto/signup.dto';

/** Matches prisma/seed/seed.js — the platform-minted hashes must verify here. */
const BCRYPT_ROUNDS = 10;

/** Falls back to a display name when a row has no `name` (Colossus-seeded rows do). */
function displayName(user: Pick<User, 'email' | 'name'>): string {
  if (user.name && user.name.trim()) {
    return user.name.trim();
  }
  const local = user.email.split('@')[0] ?? '';
  const pretty = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return pretty || 'Team Member';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Normalises an entity (or `AuthUser`) into the wire shape the SPA expects. */
  toUserDto(user: Pick<User, 'id' | 'email' | 'name' | 'role'>): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: displayName(user),
      role: user.role,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // One message for "unknown email" and "wrong password" so the endpoint
    // cannot be used to enumerate which addresses have accounts.
    const ok = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;
    if (!user || !ok) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }
    return this.issue(user);
  }

  async signup(dto: SignupDto): Promise<AuthResponseDto> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: 'That email address already has an account.',
        errors: [{ field: 'email', message: 'already registered' }],
      });
    }

    // Bootstrap rule: an empty user table means this is the very first operator,
    // who becomes ADMIN. Colossus seeds its accounts first, so in a deployed
    // environment every self-service signup lands as USER (a stock clerk).
    const isFirstUser = (await this.prisma.user.count()) === 0;

    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        role: isFirstUser ? Role.ADMIN : Role.USER,
      },
    });
    return this.issue(user);
  }

  /** Re-reads the principal for `GET /api/auth/me` so a role change shows up on refresh. */
  async me(user: AuthUser): Promise<UserDto> {
    const fresh = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!fresh) {
      throw new UnauthorizedException('Your session is no longer valid. Sign in again.');
    }
    return this.toUserDto(fresh);
  }

  private issue(user: User): AuthResponseDto {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    // Lifetime comes from JwtModule's signOptions (see auth.module.ts).
    const accessToken = this.jwt.sign(payload);
    return { accessToken, user: this.toUserDto(user) };
  }
}
