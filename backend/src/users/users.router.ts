import { Injectable } from '@nestjs/common';
import { Router, Query, Input } from 'nestjs-trpc';
import { z } from 'zod';
import { UsersService } from './users.service';
import type { User } from '@prisma/client';

/** Wire shape of a User — dates serialise to ISO strings over tRPC. */
const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

@Injectable()
@Router({ alias: 'users' })
export class UsersRouter {
  constructor(private readonly usersService: UsersService) {}

  @Query({ output: z.array(userSchema) })
  async findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Query({
    input: z.object({ id: z.string().uuid() }),
    output: userSchema.nullable(),
  })
  async findById(@Input('id') id: string): Promise<User | null> {
    return this.usersService.findById(id);
  }
}
