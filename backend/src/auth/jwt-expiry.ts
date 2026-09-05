/** Default token lifetime when JWT_EXPIRES_IN is unset or unparseable. */
const DEFAULT_SECONDS = 12 * 60 * 60;

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
};

/**
 * Converts `JWT_EXPIRES_IN` ("1d", "12h", "900s", or a bare second count) into
 * a number of seconds.
 *
 * `@nestjs/jwt` types `expiresIn` as `number | ms.StringValue`, and a value read
 * from `process.env` is a plain `string` that cannot satisfy that template
 * literal type. Normalising to seconds here keeps the call sites type-safe
 * instead of casting the config value through `any`.
 */
export function jwtExpirySeconds(raw: string | undefined): number {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return DEFAULT_SECONDS;
  }

  const match = /^(\d+)\s*([smhd])?$/.exec(value);
  if (!match) {
    return DEFAULT_SECONDS;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return DEFAULT_SECONDS;
  }
  return amount * (UNIT_SECONDS[match[2] ?? 's'] ?? 1);
}
