import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
export class ItemListComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly auth = inject(AuthService);

  /** Backend-owned data. Kept as a typed signal so the API wiring can replace the initializer. */
  readonly items = signal<Item[]>([
    { id: 'itm-1001', sku: 'SKU-1001', name: 'Steel Bracket 90°', unit: 'ea', reorderAt: 40, totalQty: 128, description: 'Zinc-plated mounting bracket' },
    { id: 'itm-1002', sku: 'SKU-1002', name: 'Hex Bolt M8 x 40', unit: 'box', reorderAt: 25, totalQty: 12, description: 'Grade 8.8, 100 per box' },
    { id: 'itm-1003', sku: 'SKU-1003', name: 'Nitrile Gloves (L)', unit: 'box', reorderAt: 30, totalQty: 30, description: 'Powder-free, 100 per box' },
    { id: 'itm-1004', sku: 'SKU-1004', name: 'Packing Tape 48mm', unit: 'roll', reorderAt: 20, totalQty: 96, description: 'Clear acrylic, 66m' },
    { id: 'itm-1005', sku: 'SKU-1005', name: 'Pallet Wrap 500mm', unit: 'roll', reorderAt: 15, totalQty: 4, description: '23 micron stretch film' },
    { id: 'itm-1006', sku: 'SKU-1006', name: 'Safety Goggles', unit: 'ea', reorderAt: 10, totalQty: 54, description: 'Anti-fog, EN166' },
    { id: 'itm-1007', sku: 'SKU-1007', name: 'Thermal Labels 4x6', unit: 'pack', reorderAt: 12, totalQty: 0, description: '250 labels per pack' },
    { id: 'itm-1008', sku: 'SKU-1008', name: 'Cable Ties 300mm', unit: 'bag', reorderAt: 25, totalQty: 210, description: 'Black UV-stable, 100 per bag' },
  ]);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

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
    this.merge({ modal: 'new-item' });
  }

  protected closeModal(): void {
    this.merge({ modal: null });
  }

  protected createItem(draft: Partial<Item>): void {
    this.items.update((rows) => [
      {
        id: `itm-new-${rows.length + 1}`,
        sku: draft.sku ?? 'SKU-NEW',
        name: draft.name ?? 'Untitled item',
        unit: draft.unit ?? 'ea',
        reorderAt: draft.reorderAt ?? 0,
        description: draft.description,
        totalQty: 0,
      },
      ...rows,
    ]);
    this.notice.set(`${draft.name} added to the catalogue.`);
    this.closeModal();
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
