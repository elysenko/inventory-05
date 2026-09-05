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
import { ItemsApi } from '../../core/api/items-api.service';
import { AuthService } from '../../core/auth.service';
import { Item } from '../../core/models';
import { ItemFormModalComponent } from './item-form-modal.component';

type SortKey = 'sku' | 'name' | 'unit' | 'reorderAt' | 'totalQty';

@Component({
  selector: 'app-item-list',
  imports: [ItemFormModalComponent],
  templateUrl: './item-list.component.html',
  styleUrl: './item-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemListComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly itemsApi = inject(ItemsApi);
  protected readonly auth = inject(AuthService);

  /** Live catalogue from `GET /api/items`, including each item's rolled-up on-hand total. */
  readonly items = signal<Item[]>([]);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  /** Surfaced inside the create modal so a rejected save keeps the typed values. */
  protected readonly formError = signal<string | null>(null);

  protected readonly search = signal('');
  protected readonly sortKey = signal<string>('sku');
  protected readonly modalName = signal<string | null>(null);

  /** Query params are bound as inputs (withComponentInputBinding) and mirrored into signals. */
  @Input() set q(value: string) {
    this.search.set(value ?? '');
  }

  @Input() set sort(value: string) {
    this.sortKey.set(value || 'sku');
  }

  @Input() set modal(value: string | null) {
    this.modalName.set(value ?? null);
  }

  ngOnInit(): void {
    void this.load();
  }

  /**
   * Search and sort run client-side over the loaded catalogue: it is a single
   * bounded list, so filtering locally keeps typing instant and avoids a
   * request per keystroke.
   */
  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await this.itemsApi.list());
    } catch (err) {
      this.error.set(messageOf(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly visible = computed<Item[]>(() => {
    const term = this.search().trim().toLowerCase();
    const [key, dir] = this.sortParts();
    const rows = this.items().filter(
      (item) =>
        !term ||
        item.sku.toLowerCase().includes(term) ||
        item.name.toLowerCase().includes(term),
    );
    return [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return dir === 'desc' ? -cmp : cmp;
    });
  });

  protected readonly lowStockCount = computed(
    () => this.items().filter((item) => item.totalQty <= item.reorderAt).length,
  );

  protected readonly takenSkus = computed(() => this.items().map((item) => item.sku));

  private sortParts(): [SortKey, 'asc' | 'desc'] {
    const raw = this.sortKey() || 'sku';
    const desc = raw.startsWith('-');
    const key = (desc ? raw.slice(1) : raw) as SortKey;
    const allowed: SortKey[] = ['sku', 'name', 'unit', 'reorderAt', 'totalQty'];
    return [allowed.includes(key) ? key : 'sku', desc ? 'desc' : 'asc'];
  }

  protected sortIndicator(key: SortKey): string {
    const [active, dir] = this.sortParts();
    return active === key ? (dir === 'asc' ? '↑' : '↓') : '';
  }

  protected toggleSort(key: SortKey): void {
    const [active, dir] = this.sortParts();
    const next = active === key && dir === 'asc' ? `-${key}` : key;
    this.merge({ sort: next });
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.search.set(value);
    this.merge({ q: value || null }, true);
  }

  protected clearSearch(): void {
    this.search.set('');
    this.merge({ q: null }, true);
  }

  protected isLow(item: Item): boolean {
    return item.totalQty <= item.reorderAt;
  }

  protected stockBadge(item: Item): string {
    if (item.totalQty === 0) return 'badge badge-out';
    return this.isLow(item) ? 'badge badge-low' : 'badge badge-ok';
  }

  protected stockLabel(item: Item): string {
    if (item.totalQty === 0) return 'Out of stock';
    return this.isLow(item) ? 'Low' : 'In stock';
  }

  protected open(item: Item): void {
    void this.router.navigate(['/items', item.id]);
  }

  protected openNew(): void {
    this.formError.set(null);
    this.merge({ modal: 'new-item' });
  }

  protected closeModal(): void {
    this.formError.set(null);
    this.merge({ modal: null });
  }

  /**
   * Creates through `POST /api/items`. A duplicate SKU comes back as a 400 with
   * a `sku` field error, which is shown in the modal so the entry is not lost.
   */
  protected async createItem(draft: Partial<Item>): Promise<void> {
    this.formError.set(null);
    this.notice.set(null);

    try {
      const created = await this.itemsApi.create({
        sku: draft.sku ?? '',
        name: draft.name ?? '',
        unit: draft.unit ?? 'ea',
        reorderAt: draft.reorderAt ?? 0,
        description: draft.description,
      });
      this.notice.set(`${created.name} added to the catalogue.`);
      this.closeModal();
      await this.load();
    } catch (err) {
      this.formError.set(skuMessage(err));
    }
  }

  private merge(queryParams: Record<string, string | null>, replaceUrl = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}

/** Turns the API's `{field:'sku', message:'must be unique'}` into readable copy. */
function skuMessage(err: unknown): string {
  if (err instanceof ApiRequestError && err.fieldError('sku')) {
    return 'That SKU is already in use. Every item needs a unique SKU.';
  }
  return messageOf(err);
}
