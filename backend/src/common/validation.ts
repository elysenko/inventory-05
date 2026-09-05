import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

interface FieldError {
  field: string;
  message: string;
}

/** Flattens class-validator's nested errors into `{ field, message }` pairs. */
function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    const nested = error.children?.length ? flatten(error.children, field) : [];
    return [...own, ...nested];
  });
}

/**
 * `whitelist` strips properties without a decorator, so a client cannot smuggle
 * extra columns (e.g. `role`) into a create/update payload.
 *
 * The custom factory emits the same `{ message, errors: [{ field, message }] }`
 * envelope that PrismaExceptionFilter produces for unique-constraint failures,
 * so the SPA has exactly one error shape to render.
 */
export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidUnknownValues: false,
    exceptionFactory: (errors: ValidationError[]) =>
      new BadRequestException({
        statusCode: 400,
        message: 'Validation failed',
        errors: flatten(errors),
      }),
  });
}
