import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Location } from '../../core/models';
import { LocationFormModalComponent } from './location-form-modal.component';

@Component({
  selector: 'app-location-list',
  imports: [LocationFormModalComponent],
  templateUrl: './location-list.component.html',
  styleUrl: './location-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationListComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly auth = inject(AuthService);

  /** Backend-owned data: storage locations with their rolled-up stock counts. */
  readonly locations = signal<Location[]>([
    { id: 'loc-a', name: 'Zone A', zone: 'A', itemCount: 6, totalQty: 246 },
    { id: 'loc-b', name: 'Zone B', zone: 'B', itemCount: 5, totalQty: 178 },
    { id: 'loc-c', name: 'Zone C', zone: 'C', itemCount: 3, totalQty: 110 },
  ]);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly modalName = signal<string | null>(null);
  protected readonly selectedId = signal<string | null>(null);

  @Input() set modal(value: string | null) {
    this.modalName.set(value ?? null);
  }

  @Input() set id(value: string | null) {
    this.selectedId.set(value ?? null);
  }

  protected readonly takenNames = computed(() => this.locations().map((l) => l.name));

  protected readonly editing = computed<Location | null>(
    () => this.locations().find((l) => l.id === this.selectedId()) ?? null,
  );

  protected readonly totalUnits = computed(() =>
    this.locations().reduce((sum, l) => sum + l.totalQty, 0),
  );

  protected openNew(): void {
    this.merge({ modal: 'new-location', id: null });
  }

  protected openEdit(location: Location): void {
    this.merge({ modal: 'edit-location', id: location.id });
  }

  protected closeModal(): void {
    this.merge({ modal: null, id: null });
  }

  protected saveLocation(draft: Partial<Location>): void {
    const target = this.editing();
    if (target) {
      this.locations.update((rows) =>
        rows.map((row) => (row.id === target.id ? { ...row, ...draft } : row)),
      );
      this.notice.set(`${draft.name} updated.`);
    } else {
      this.locations.update((rows) => [
        ...rows,
        {
          id: `loc-new-${rows.length + 1}`,
          name: draft.name ?? 'New location',
          zone: draft.zone ?? '—',
          itemCount: 0,
          totalQty: 0,
        },
      ]);
      this.notice.set(`${draft.name} added. It is ready to receive stock.`);
    }
    this.closeModal();
  }

  /** Locations referenced by a movement cannot be removed — the audit log stays intact. */
  protected remove(location: Location): void {
    if (location.totalQty > 0) {
      this.error.set(
        `${location.name} still holds ${location.totalQty} units. Move the stock out before deleting it.`,
      );
      return;
    }
    this.error.set(null);
    this.locations.update((rows) => rows.filter((row) => row.id !== location.id));
    this.notice.set(`${location.name} removed.`);
  }

  private merge(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
