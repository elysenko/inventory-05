import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiRequestError } from '../../core/api/api-client.service';
import { ItemsApi } from '../../core/api/items-api.service';
import { AuthService } from '../../core/auth.service';
import { Item, ItemDetail, Movement, StockLevelRow } from '../../core/models';
import { IS_PREVIEW } from '../../core/preview';
import { PREVIEW_ITEM_DETAILS, PREVIEW_MOVEMENTS } from '../../core/preview-fixtures';
import { ItemFormModalComponent } from './item-form-modal.component';

/**
 * Rendered while the first request is still in flight. The breadcrumb reads
 * `item().sku` outside the loading guard, so `item()` must always be an object.
 */
const PLACEHOLDER: ItemDetail = {
  id: '',
  sku: '—',
  name: '',
  unit: '',
  reorderAt: 0,
  totalQty: 0,
  stockLevels: [],
};

@Component({
  selector: 'app-item-detail',
  imports: [RouterLink, DatePipe, ItemFormModalComponent],
  templateUrl: './item-detail.component.html',
  styleUrl: './item-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemDetailComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly itemsApi = inject(ItemsApi);
  protected readonly auth = inject(AuthService);

  /** `GET /api/items/:id` — header fields plus the per-location breakdown. */
  private readonly detail = signal<ItemDetail | null>(null);

  /** `GET /api/items/:id/movements` — history for this item only. */
  readonly movements = signal<Movement[]>([]);

  protected readonly loading = signal(!IS_PREVIEW);
  protected readonly error = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  protected readonly itemId = signal<string>('');
  protected readonly tabName = signal<'stock' | 'movements'>('stock');
  protected readonly modalName = signal<string | null>(null);

  /** The route param is the only load trigger, so revisiting `/items/:id` refetches. */
  @Input() set id(value: string) {
    const next = value ?? '';
    if (next === this.itemId() && this.detail()) {
      return;
    }
    this.itemId.set(next);
    void this.load();
  }

  @Input() set tab(value: string | null) {
    this.tabName.set(value === 'movements' ? 'movements' : 'stock');
  }

  @Input() set modal(value: string | null) {
    this.modalName.set(value ?? null);
  }

  private async load(): Promise<void> {
    const id = this.itemId();

    if (IS_PREVIEW) {
      const fixture =
        PREVIEW_ITEM_DETAILS.find((row) => row.id === id) ?? PREVIEW_ITEM_DETAILS[0];
      this.detail.set(fixture);
      this.movements.set(PREVIEW_MOVEMENTS.filter((m) => m.itemId === fixture.id));
      this.loading.set(false);
      return;
    }

    if (!id) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      // Both reads are for the same item and neither depends on the other, so
      // they go out together rather than serially.
      const [detail, movements] = await Promise.all([
        this.itemsApi.get(id),
        this.itemsApi.movements(id),
      ]);
      this.detail.set(detail);
      this.movements.set(movements);
    } catch (err) {
      this.error.set(
        err instanceof ApiRequestError && err.status === 404
          ? 'That item no longer exists.'
          : messageOf(err),
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly item = computed<ItemDetail>(() => this.detail() ?? PLACEHOLDER);

  protected readonly breakdown = computed<StockLevelRow[]>(() => this.item().stockLevels);

  protected readonly breakdownTotal = computed(() =>
    this.breakdown().reduce((sum, row) => sum + row.qty, 0),
  );

  protected readonly locationsHoldingStock = computed(
    () => this.breakdown().filter((row) => row.qty > 0).length,
  );

  protected readonly itemMovements = computed<Movement[]>(() => this.movements());

  protected readonly isLow = computed(
    () => !!this.detail() && this.item().totalQty <= this.item().reorderAt,
  );

  protected readonly shortfall = computed(() =>
    Math.max(0, this.item().reorderAt - this.item().totalQty),
  );

  protected typeBadge(type: Movement['type']): string {
    if (type === 'IN') return 'badge badge-in';
    if (type === 'OUT') return 'badge badge-move-out';
    return 'badge badge-transfer';
  }

  protected sharePercent(qty: number): number {
    const total = this.breakdownTotal();
    return total === 0 ? 0 : Math.round((qty / total) * 100);
  }

  protected openEdit(): void {
    this.formError.set(null);
    this.merge({ modal: 'edit-item' });
  }

  protected closeModal(): void {
    this.formError.set(null);
    this.merge({ modal: null });
  }

  /** Manager-only edit through `PATCH /api/items/:id`, then a refetch. */
  protected async saveItem(draft: Partial<Item>): Promise<void> {
    this.formError.set(null);
    const current = this.item();

    if (IS_PREVIEW) {
      this.detail.set({ ...current, ...draft });
      this.closeModal();
      return;
    }

    try {
      await this.itemsApi.update(current.id, {
        sku: draft.sku,
        name: draft.name,
        unit: draft.unit,
        reorderAt: draft.reorderAt,
        description: draft.description ?? '',
      });
      this.closeModal();
      await this.load();
    } catch (err) {
      this.formError.set(
        err instanceof ApiRequestError && err.fieldError('sku')
          ? 'That SKU is already used by another item.'
          : messageOf(err),
      );
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
