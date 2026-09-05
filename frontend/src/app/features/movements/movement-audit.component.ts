import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ItemsApi } from '../../core/api/items-api.service';
import { MovementsApi } from '../../core/api/movements-api.service';
import { Item, Movement, MovementType } from '../../core/models';

const PAGE_SIZE = 8;

@Component({
  selector: 'app-movement-audit',
  imports: [RouterLink, DatePipe],
  templateUrl: './movement-audit.component.html',
  styleUrl: './movement-audit.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovementAuditComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly movementsApi = inject(MovementsApi);
  private readonly itemsApi = inject(ItemsApi);
  private readonly destroyRef = inject(DestroyRef);

  /** The page of audit rows currently on screen (`GET /api/movements`). */
  readonly movements = signal<Movement[]>([]);

  /** `GET /api/items` — labels for the item filter. */
  readonly items = signal<Item[]>([]);

  /** Row count for the active filters, reported by the API, not by the page length. */
  private readonly totalCount = signal(0);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly filterItem = signal('');
  protected readonly filterType = signal('');
  protected readonly filterFrom = signal('');
  protected readonly filterTo = signal('');
  protected readonly pageNum = signal(1);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly types: MovementType[] = ['IN', 'OUT', 'TRANSFER'];

  ngOnInit(): void {
    void this.loadItems();

    // Filtering and paging are server-side, so every query-param change is a
    // refetch. The values are read straight off the emitted ParamMap rather
    // than from bound inputs: the router emits here before change detection
    // applies the inputs, so reading the map is what keeps the request and the
    // URL in step.
    const sub = this.route.queryParamMap.subscribe((params) => {
      this.filterItem.set(params.get('itemId') ?? '');
      this.filterType.set(params.get('type') ?? '');
      this.filterFrom.set(params.get('from') ?? '');
      this.filterTo.set(params.get('to') ?? '');
      this.pageNum.set(Number(params.get('page')) || 1);
      void this.load();
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private async loadItems(): Promise<void> {
    try {
      this.items.set(await this.itemsApi.list());
    } catch {
      /* the filter select degrades to "All items"; the log itself still loads */
    }
  }

  private async load(): Promise<void> {

    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.movementsApi.list({
        itemId: this.filterItem() || undefined,
        type: this.filterType() || undefined,
        from: this.filterFrom() || undefined,
        to: this.filterTo() || undefined,
        page: Math.max(1, this.pageNum()),
        pageSize: PAGE_SIZE,
      });
      this.movements.set(page.data);
      this.totalCount.set(page.total);
    } catch (err) {
      this.movements.set([]);
      this.totalCount.set(0);
      this.error.set(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly rows = computed<Movement[]>(() => this.movements());
  protected readonly total = computed(() => this.totalCount());
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  protected readonly currentPage = computed(() => Math.min(this.pageNum(), this.pageCount()));

  protected readonly rangeStart = computed(() =>
    this.total() === 0 ? 0 : (this.currentPage() - 1) * PAGE_SIZE + 1,
  );
  protected readonly rangeEnd = computed(() =>
    Math.min(this.currentPage() * PAGE_SIZE, this.total()),
  );

  protected readonly hasFilters = computed(
    () => !!(this.filterItem() || this.filterType() || this.filterFrom() || this.filterTo()),
  );

  protected typeBadge(type: MovementType): string {
    if (type === 'IN') return 'badge badge-in';
    if (type === 'OUT') return 'badge badge-move-out';
    return 'badge badge-transfer';
  }

  protected onFilter(key: 'itemId' | 'type' | 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.merge({ [key]: value || null, page: null });
  }

  protected clearFilters(): void {
    this.merge({ itemId: null, type: null, from: null, to: null, page: null });
  }

  protected goToPage(next: number): void {
    const clamped = Math.min(Math.max(1, next), this.pageCount());
    this.merge({ page: clamped === 1 ? null : String(clamped) });
  }

  private merge(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
