import {
  Catch,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

interface FieldError {
  field: string;
  message: string;
}

interface ErrorBody {
  statusCode: number;
  message: string;
  errors?: FieldError[];
}

/** `meta.target` is `string[]` for Postgres, but the type is `unknown`. */
function targetFields(meta: Prisma.PrismaClientKnownRequestError['meta']): string[] {
  const target = (meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) {
    return target.filter((entry): entry is string => typeof entry === 'string');
  }
  return typeof target === 'string' ? [target] : [];
}

/**
 * Translates Prisma's driver-level errors into the API's error contract so a
 * unique-constraint clash reads as a field validation error rather than a 500.
 *
 *   P2002 unique violation   -> 400 with `errors: [{ field, message }]`
 *   P2025 record not found   -> 404
 *   P2003 FK constraint      -> 409 (something still references the row)
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.translate(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`Unhandled Prisma error ${exception.code}: ${exception.message}`);
    }
    response.status(status).json(body);
  }

  private translate(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    body: ErrorBody;
  } {
    switch (exception.code) {
      case 'P2002': {
        const fields = targetFields(exception.meta);
        return {
          status: HttpStatus.BAD_REQUEST,
          body: {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Validation failed',
            errors: (fields.length > 0 ? fields : ['value']).map((field) => ({
              field,
              message: 'must be unique',
            })),
          },
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          body: { statusCode: HttpStatus.NOT_FOUND, message: 'Record not found' },
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            statusCode: HttpStatus.CONFLICT,
            message: 'That record is still referenced by other data and cannot be changed.',
          },
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Unexpected database error',
          },
        };
    }
  }
}
