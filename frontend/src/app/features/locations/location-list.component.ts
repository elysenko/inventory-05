import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiRequestError } from '../../core/api/api-client.service';
import { LocationsApi } from '../../core/api/locations-api.service';
import { AuthService } from '../../core/auth.service';
import { Location } from '../../core/models';
import { IS_PREVIEW } from '../../core/preview';
import { PREVIEW_LOCATIONS } from '../../core/preview-fixtures';
import { LocationFormModalComponent } from './location-form-modal.component';

@Component({
  selector: 'app-location-list',
  imports: [LocationFormModalComponent],
  templateUrl: './location-list.component.html',
  styleUrl: './location-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationListComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly locationsApi = inject(LocationsApi);
  protected readonly auth = inject(AuthService);

  /** `GET /api/locations` — zones with their rolled-up occupancy. */
  readonly locations = signal<Location[]>(IS_PREVIEW ? PREVIEW_LOCATIONS : []);

  protected readonly loading = signal(!IS_PREVIEW);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  protected readonly modalName = signal<string | null>(null);
  protected readonly selectedId = signal<string | null>(null);

  @Input() set modal(value: string | null) {
    this.modalName.set(value ?? null);
  }

  @Input() set id(value: string | null) {
    this.selectedId.set(value ?? null);
  }

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    if (IS_PREVIEW) {
      return;
    }
    this.loading.set(true);
    try {
      this.locations.set(await this.locationsApi.list());
      this.error.set(null);
    } catch (err) {
      this.error.set(messageOf(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly takenNames = computed(() => this.locations().map((l) => l.name));

  protected readonly editing = computed<Location | null>(
    () => this.locations().find((l) => l.id === this.selectedId()) ?? null,
  );

  protected readonly totalUnits = computed(() =>
    this.locations().reduce((sum, l) => sum + l.totalQty, 0),
  );

  protected openNew(): void {
    this.formError.set(null);
    this.merge({ modal: 'new-location', id: null });
  }

  protected openEdit(location: Location): void {
    this.formError.set(null);
    this.merge({ modal: 'edit-location', id: location.id });
  }

  protected closeModal(): void {
    this.formError.set(null);
    this.merge({ modal: null, id: null });
  }

  /** Create or update through the API, then refetch so occupancy stays truthful. */
  protected async saveLocation(draft: Partial<Location>): Promise<void> {
    const target = this.editing();
    this.formError.set(null);
    this.notice.set(null);

    if (IS_PREVIEW) {
      this.locations.update((rows) =>
        target
          ? rows.map((row) => (row.id === target.id ? { ...row, ...draft } : row))
          : [
              ...rows,
              {
                id: `loc-preview-${rows.length + 1}`,
                name: draft.name ?? 'New location',
                zone: draft.zone ?? '—',
                itemCount: 0,
                totalQty: 0,
              },
            ],
      );
      this.notice.set(target ? `${draft.name} updated.` : `${draft.name} added.`);
      this.closeModal();
      return;
    }

    const payload = { name: draft.name ?? '', zone: draft.zone ?? '' };
    try {
      if (target) {
        await this.locationsApi.update(target.id, payload);
        this.notice.set(`${payload.name} updated.`);
      } else {
        await this.locationsApi.create(payload);
        this.notice.set(`${payload.name} added. It is ready to receive stock.`);
      }
      this.closeModal();
      await this.load();
    } catch (err) {
      this.formError.set(
        err instanceof ApiRequestError && err.fieldError('name')
          ? 'A location with that name already exists.'
          : messageOf(err),
      );
    }
  }

  /**
   * Deletion is refused server-side (409) while the location holds stock or is
   * referenced by the audit log — that message is shown verbatim rather than
   * being second-guessed here.
   */
  protected async remove(location: Location): Promise<void> {
    this.error.set(null);
    this.notice.set(null);

    if (IS_PREVIEW) {
      if (location.totalQty > 0) {
        this.error.set(
          `${location.name} still holds ${location.totalQty} units. Move the stock out before deleting it.`,
        );
        return;
      }
      this.locations.update((rows) => rows.filter((row) => row.id !== location.id));
      this.notice.set(`${location.name} removed.`);
      return;
    }

    try {
      await this.locationsApi.remove(location.id);
      this.notice.set(`${location.name} removed.`);
      await this.load();
    } catch (err) {
      this.error.set(messageOf(err));
    }
  }

  private merge(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}
