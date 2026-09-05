import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateSettingsDto } from './dto/update-settings.dto';

export type SettingService = 'postgresql' | 'minio';

/** Mirrors `frontend/src/app/core/models.ts#AdminSetting`. */
export interface AdminSettingDto {
  key: string;
  service: SettingService;
  label: string;
  value: string;
  configured: boolean;
  secret: boolean;
}

interface SettingSpec {
  key: string;
  service: SettingService;
  label: string;
  secret: boolean;
  /** Platform-provisioned env vars to fall back on, in priority order. */
  envKeys: string[];
}

/** Value the platform writes when a key is deliberately left for an operator. */
const PLACEHOLDER = 'PLACEHOLDER_CONFIGURE_IN_SETTINGS';

/**
 * The settings surface is a fixed catalogue rather than "whatever is in the
 * environment", so the admin screen renders the same rows on every pod whether
 * or not a credential happens to be injected.
 */
const CATALOGUE: SettingSpec[] = [
  {
    key: 'DATABASE_URL',
    service: 'postgresql',
    label: 'Connection string',
    secret: true,
    envKeys: ['DATABASE_URL'],
  },
  {
    key: 'MINIO_ENDPOINT',
    service: 'minio',
    label: 'Endpoint',
    secret: false,
    envKeys: ['MINIO_ENDPOINT', 'S3_ENDPOINT'],
  },
  {
    key: 'MINIO_ACCESS_KEY',
    service: 'minio',
    label: 'Access key',
    secret: true,
    envKeys: ['MINIO_ACCESS_KEY', 'MINIO_ROOT_USER', 'S3_ACCESS_KEY'],
  },
  {
    key: 'MINIO_SECRET_KEY',
    service: 'minio',
    label: 'Secret key',
    secret: true,
    envKeys: ['MINIO_SECRET_KEY', 'MINIO_ROOT_PASSWORD', 'S3_SECRET_KEY'],
  },
  {
    key: 'MINIO_BUCKET',
    service: 'minio',
    label: 'Bucket',
    secret: false,
    envKeys: ['MINIO_BUCKET', 'S3_BUCKET'],
  },
];

const KEYS = new Set(CATALOGUE.map((spec) => spec.key));

/** Usable value, or null when unset/placeholder. */
function usable(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed !== PLACEHOLDER ? trimmed : null;
}

/**
 * Redacts a secret down to a recognisable stub. A connection string keeps its
 * scheme and host so an admin can tell *which* database is wired up without the
 * password ever leaving the pod.
 */
function mask(value: string): string {
  const url = /^([a-z0-9+.-]+:\/\/)(?:[^@/]*@)?([^/?#]+)(.*)$/i.exec(value);
  if (url) {
    return `${url[1]}****@${url[2].split('@').pop() ?? url[2]}${url[3]}`;
  }
  const tail = value.slice(-4);
  return value.length > 4 ? `${'•'.repeat(8)}${tail}` : '•'.repeat(8);
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Effective value per key: a SystemSetting override wins over the pod
   * environment, so an admin can repoint a service without a redeploy.
   * Secrets are always returned masked — this endpoint never leaks a credential.
   */
  async findAll(): Promise<AdminSettingDto[]> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: [...KEYS] } },
    });
    const overrides = new Map(rows.map((row) => [row.key, row.value]));

    return CATALOGUE.map((spec) => {
      const resolved =
        usable(overrides.get(spec.key)) ??
        spec.envKeys.map((envKey) => usable(process.env[envKey])).find(Boolean) ??
        null;

      return {
        key: spec.key,
        service: spec.service,
        label: spec.label,
        secret: spec.secret,
        configured: resolved !== null,
        value: resolved === null ? '' : spec.secret ? mask(resolved) : resolved,
      };
    });
  }

  /** Upserts the supplied overrides, then re-reads so the caller sees masked truth. */
  async update(dto: UpdateSettingsDto): Promise<AdminSettingDto[]> {
    const entries = Object.entries(dto.values ?? {});
    const unknown = entries.filter(([key]) => !KEYS.has(key)).map(([key]) => key);
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown setting${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
    }

    for (const [key, raw] of entries) {
      const value = typeof raw === 'string' ? raw.trim() : '';
      if (value) {
        await this.prisma.systemSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        });
      } else {
        // Empty means "drop my override and use the environment again".
        await this.prisma.systemSetting.deleteMany({ where: { key } });
      }
    }

    return this.findAll();
  }
}
