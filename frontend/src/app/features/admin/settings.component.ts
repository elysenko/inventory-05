import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AdminApi } from '../../core/api/admin-api.service';
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
export class AdminSettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly adminApi = inject(AdminApi);

  /**
   * `GET /api/admin/settings` — the live credential catalogue for the backing
   * services. The API resolves a stored override first and the pod environment
   * second, and masks every secret, so what lands here is the effective
   * configuration of the running deployment.
   */
  readonly settings = signal<AdminSetting[]>([]);

  protected readonly loading = signal(true);
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

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.settings.set(await this.adminApi.list());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Writes the entered overrides through `PATCH /api/admin/settings` and takes
   * the API's re-read as the new truth, so the "Current:" hints always show
   * what the server actually resolved (masked), never what was typed.
   */
  protected async save(service: 'postgresql' | 'minio'): Promise<void> {
    this.error.set(null);
    this.success.set(null);
    const values = this.form.getRawValue() as Record<string, string>;
    const changed = this.forService(service).filter((setting) => values[setting.key]?.trim());

    if (changed.length === 0) {
      this.error.set('Enter at least one value before saving.');
      return;
    }

    const payload: Record<string, string> = {};
    changed.forEach((setting) => {
      payload[setting.key] = values[setting.key].trim();
    });

    try {
      this.settings.set(await this.adminApi.save(payload));
      changed.forEach((setting) => this.form.patchValue({ [setting.key]: '' }));
      this.success.set(
        `${changed.length} ${changed.length === 1 ? 'credential' : 'credentials'} saved for ${service}.`,
      );
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }
}

/** Only the last four characters of a secret are ever shown back. */
function maskValue(raw: string): string {
  const value = raw.trim();
  return value.length <= 4 ? '••••' : `${'•'.repeat(8)}${value.slice(-4)}`;
}
