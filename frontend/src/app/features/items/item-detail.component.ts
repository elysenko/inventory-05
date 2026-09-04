import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Item, ItemDetail, Movement, StockLevelRow } from '../../core/models';
import { ItemFormModalComponent } from './item-form-modal.component';

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
  protected readonly auth = inject(AuthService);

  /** Backend-owned data: the item detail payload (header + per-location breakdown). */
  readonly details = signal<ItemDetail[]>([
    {
      id: 'itm-1002', sku: 'SKU-1002', name: 'Hex Bolt M8 x 40', unit: 'box', reorderAt: 25, totalQty: 12,
      description: 'Grade 8.8 zinc-plated, 100 bolts per box.',
      stockLevels: [
        { id: 'sl-1', itemId: 'itm-1002', locationId: 'loc-a', locationName: 'Zone A', zone: 'A', qty: 7 },
        { id: 'sl-2', itemId: 'itm-1002', locationId: 'loc-b', locationName: 'Zone B', zone: 'B', qty: 5 },
        { id: 'sl-3', itemId: 'itm-1002', locationId: 'loc-c', locationName: 'Zone C', zone: 'C', qty: 0 },
      ],
    },
    {
      id: 'itm-1001', sku: 'SKU-1001', name: 'Steel Bracket 90°', unit: 'ea', reorderAt: 40, totalQty: 128,
      description: 'Zinc-plated mounting bracket, 4mm gauge.',
      stockLevels: [
        { id: 'sl-4', itemId: 'itm-1001', locationId: 'loc-a', locationName: 'Zone A', zone: 'A', qty: 74 },
        { id: 'sl-5', itemId: 'itm-1001', locationId: 'loc-b', locationName: 'Zone B', zone: 'B', qty: 54 },
      ],
    },
    {
      id: 'itm-1007', sku: 'SKU-1007', name: 'Thermal Labels 4x6', unit: 'pack', reorderAt: 12, totalQty: 0,
      description: '250 direct-thermal labels per pack.',
      stockLevels: [],
    },
  ]);

  /** Backend-owned data: movement history scoped to this item. */
  readonly movements = signal<Movement[]>([
    { id: 'mv-31', type: 'OUT', itemId: 'itm-1002', itemSku: 'SKU-1002', itemName: 'Hex Bolt M8 x 40', fromLocName: 'Zone A', toLocName: null, qty: 8, unit: 'box', note: 'Line 3 replenishment', userEmail: 'dana.ruiz@stockroom.example', createdAt: '2026-09-04T08:42:00Z' },
    { id: 'mv-27', type: 'TRANSFER', itemId: 'itm-1002', itemSku: 'SKU-1002', itemName: 'Hex Bolt M8 x 40', fromLocName: 'Zone B', toLocName: 'Zone A', qty: 5, unit: 'box', note: 'Rebalance after count', userEmail: 'sam.okafor@stockroom.example', createdAt: '2026-09-03T16:05:00Z' },
    { id: 'mv-19', type: 'IN', itemId: 'itm-1002', itemSku: 'SKU-1002', itemName: 'Hex Bolt M8 x 40', fromLocName: null, toLocName: 'Zone B', qty: 10, unit: 'box', note: 'PO-4471 delivery', userEmail: 'dana.ruiz@stockroom.example', createdAt: '2026-09-02T10:18:00Z' },
    { id: 'mv-12', type: 'IN', itemId: 'itm-1001', itemSku: 'SKU-1001', itemName: 'Steel Bracket 90°', fromLocName: null, toLocName: 'Zone A', qty: 60, unit: 'ea', note: 'PO-4468 delivery', userEmail: 'sam.okafor@stockroom.example', createdAt: '2026-09-01T09:30:00Z' },
  ]);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly itemId = signal<string>('');
  protected readonly tabName = signal<'stock' | 'movements'>('stock');
  protected readonly modalName = signal<string | null>(null);

  @Input() set id(value: string) {
    this.itemId.set(value ?? '');
  }

  @Input() set tab(value: string | null) {
    this.tabName.set(value === 'movements' ? 'movements' : 'stock');
  }

  @Input() set modal(value: string | null) {
    this.modalName.set(value ?? null);
  }

  /** Falls back to the first fixture so any `/items/:id` deep link renders a populated screen. */
  protected readonly item = computed<ItemDetail>(() => {
    const rows = this.details();
    return rows.find((row) => row.id === this.itemId()) ?? rows[0];
  });

  protected readonly breakdown = computed<StockLevelRow[]>(() => this.item().stockLevels);

  protected readonly breakdownTotal = computed(() =>
    this.breakdown().reduce((sum, row) => sum + row.qty, 0),
  );

  protected readonly locationsHoldingStock = computed(
    () => this.breakdown().filter((row) => row.qty > 0).length,
  );

  protected readonly itemMovements = computed<Movement[]>(() =>
    this.movements().filter((movement) => movement.itemId === this.item().id),
  );

  protected readonly isLow = computed(() => this.item().totalQty <= this.item().reorderAt);

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
    this.merge({ modal: 'edit-item' });
  }

  protected closeModal(): void {
    this.merge({ modal: null });
  }

  protected saveItem(draft: Partial<Item>): void {
    const current = this.item();
    this.details.update((rows) =>
      rows.map((row) => (row.id === current.id ? { ...row, ...draft } : row)),
    );
    this.closeModal();
  }

  private merge(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
