import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AdminSetting } from '../../core/models';

interface ServiceCard {
  service: 'postgresql' | 'minio';
  title: string;
  blurb: string;
}

@Component({
  selector: 'app-admin-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsComponent {
  private readonly fb = inject(FormBuilder);

  /** Backend-owned data: known service keys with masked values and a configured flag. */
  readonly settings = signal<AdminSetting[]>([
    { key: 'DATABASE_URL', service: 'postgresql', label: 'Connection string', value: 'postgresql://stockroom:••••••••@app-db:5432/stockroom', configured: true, secret: true },
    { key: 'MINIO_ENDPOINT', service: 'minio', label: 'Endpoint', value: 'http://minio:9000', configured: true, secret: false },
    { key: 'MINIO_ACCESS_KEY', service: 'minio', label: 'Access key', value: 'stockroom-••••', configured: true, secret: true },
    { key: 'MINIO_SECRET_KEY', service: 'minio', label: 'Secret key', value: '', configured: false, secret: true },
    { key: 'MINIO_BUCKET', service: 'minio', label: 'Bucket', value: '', configured: false, secret: false },
  ]);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  protected readonly cards: ServiceCard[] = [
    {
      service: 'postgresql',
      title: 'PostgreSQL',
      blurb: 'Primary datastore for items, locations, stock levels and the movement log.',
    },
    {
      service: 'minio',
      title: 'MinIO object storage',
      blurb: 'Object storage for future item photos and movement attachments.',
    },
  ];

  protected readonly form = this.fb.nonNullable.group({
    DATABASE_URL: [''],
    MINIO_ENDPOINT: [''],
    MINIO_ACCESS_KEY: [''],
    MINIO_SECRET_KEY: [''],
    MINIO_BUCKET: [''],
  });

  protected readonly unconfiguredCount = computed(
    () => this.settings().filter((setting) => !setting.configured).length,
  );

  protected forService(service: 'postgresql' | 'minio'): AdminSetting[] {
    return this.settings().filter((setting) => setting.service === service);
  }

  protected serviceConfigured(service: 'postgresql' | 'minio'): boolean {
    return this.forService(service).every((setting) => setting.configured);
  }

  protected controlName(key: string): 'DATABASE_URL' | 'MINIO_ENDPOINT' | 'MINIO_ACCESS_KEY' | 'MINIO_SECRET_KEY' | 'MINIO_BUCKET' {
    return key as 'DATABASE_URL';
  }

  protected save(service: 'postgresql' | 'minio'): void {
    this.error.set(null);
    this.success.set(null);
    const values = this.form.getRawValue() as Record<string, string>;
    const changed = this.forService(service).filter((setting) => values[setting.key]?.trim());

    if (changed.length === 0) {
      this.error.set('Enter at least one value before saving.');
      return;
    }

    this.settings.update((rows) =>
      rows.map((row) =>
        changed.some((c) => c.key === row.key)
          ? {
              ...row,
              configured: true,
              value: row.secret ? maskValue(values[row.key]) : values[row.key].trim(),
            }
          : row,
      ),
    );
    changed.forEach((setting) => this.form.patchValue({ [setting.key]: '' }));
    this.success.set(
      `${changed.length} ${changed.length === 1 ? 'credential' : 'credentials'} saved for ${service}.`,
    );
  }
}

/** Only the last four characters of a secret are ever shown back. */
function maskValue(raw: string): string {
  const value = raw.trim();
  return value.length <= 4 ? '••••' : `${'•'.repeat(8)}${value.slice(-4)}`;
}
