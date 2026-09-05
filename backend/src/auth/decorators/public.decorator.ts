import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'colossus:isPublic';

/**
 * Opts a route out of the globally registered `JwtAuthGuard`.
 * Only login, signup and the health probes may carry it.
 */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
