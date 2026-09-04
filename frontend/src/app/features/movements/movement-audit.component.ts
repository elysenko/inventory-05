import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Item, Movement, MovementType } from '../../core/models';

const PAGE_SIZE = 8;

@Component({
  selector: 'app-movement-audit',
  imports: [RouterLink, DatePipe],
  templateUrl: './movement-audit.component.html',
  styleUrl: './movement-audit.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovementAuditComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Backend-owned data: the immutable movement audit log. */
  readonly movements = signal<Movement[]>([
    { id: 'mv-31', type: 'OUT', itemId: 'itm-1002', itemSku: 'SKU-1002', itemName: 'Hex Bolt M8 x 40', fromLocName: 'Zone A', toLocName: null, qty: 8, unit: 'box', note: 'Line 3 replenishment', userEmail: 'dana.ruiz@stockroom.example', createdAt: '2026-09-04T08:42:00Z' },
    { id: 'mv-30', type: 'IN', itemId: 'itm-1008', itemSku: 'SKU-1008', itemName: 'Cable Ties 300mm', fromLocName: null, toLocName: 'Zone A', qty: 40, unit: 'bag', note: 'PO-4482 delivery', userEmail: 'sam.okafor@stockroom.example', createdAt: '2026-09-04T07:55:00Z' },
    { id: 'mv-29', type: 'TRANSFER', itemId: 'itm-1004', itemSku: 'SKU-1004', itemName: 'Packing Tape 48mm', fromLocName: 'Zone C', toLocName: 'Zone B', qty: 24, unit: 'roll', note: 'Pack bench top-up', userEmail: 'dana.ruiz@stockroom.example', createdAt: '2026-09-03T17:20:00Z' },
    { id: 'mv-27', type: 'TRANSFER', itemId: 'itm-1002', itemSku: 'SKU-1002', itemName: 'Hex Bolt M8 x 40', fromLocName: 'Zone B', toLocName: 'Zone A', qty: 5, unit: 'box', note: 'Rebalance after count', userEmail: 'sam.okafor@stockroom.example', createdAt: '2026-09-03T16:05:00Z' },
    { id: 'mv-26', type: 'OUT', itemId: 'itm-1005', itemSku: 'SKU-1005', itemName: 'Pallet Wrap 500mm', fromLocName: 'Zone C', toLocName: null, qty: 6, unit: 'roll', note: 'Outbound wrapping', userEmail: 'priya.shah@stockroom.example', createdAt: '2026-09-03T11:12:00Z' },
    { id: 'mv-24', type: 'IN', itemId: 'itm-1006', itemSku: 'SKU-1006', itemName: 'Safety Goggles', fromLocName: null, toLocName: 'Zone B', qty: 24, unit: 'ea', note: 'PO-4479 delivery', userEmail: 'sam.okafor@stockroom.example', createdAt: '2026-09-02T15:44:00Z' },
    { id: 'mv-22', type: 'OUT', itemId: 'itm-1003', itemSku: 'SKU-1003', itemName: 'Nitrile Gloves (L)', fromLocName: 'Zone A', toLocName: null, qty: 12, unit: 'box', note: 'Weekly floor issue', userEmail: 'priya.shah@stockroom.example', createdAt: '2026-09-02T13:02:00Z' },
    { id: 'mv-19', type: 'IN', itemId: 'itm-1002', itemSku: 'SKU-1002', itemName: 'Hex Bolt M8 x 40', fromLocName: null, toLocName: 'Zone B', qty: 10, unit: 'box', note: 'PO-4471 delivery', userEmail: 'dana.ruiz@stockroom.example', createdAt: '2026-09-02T10:18:00Z' },
    { id: 'mv-16', type: 'TRANSFER', itemId: 'itm-1008', itemSku: 'SKU-1008', itemName: 'Cable Ties 300mm', fromLocName: 'Zone A', toLocName: 'Zone C', qty: 30, unit: 'bag', note: 'Overflow to Zone C', userEmail: 'dana.ruiz@stockroom.example', createdAt: '2026-09-01T16:40:00Z' },
    { id: 'mv-12', type: 'IN', itemId: 'itm-1001', itemSku: 'SKU-1001', itemName: 'Steel Bracket 90°', fromLocName: null, toLocName: 'Zone A', qty: 60, unit: 'ea', note: 'PO-4468 delivery', userEmail: 'sam.okafor@stockroom.example', createdAt: '2026-09-01T09:30:00Z' },
    { id: 'mv-09', type: 'OUT', itemId: 'itm-1004', itemSku: 'SKU-1004', itemName: 'Packing Tape 48mm', fromLocName: 'Zone B', toLocName: null, qty: 18, unit: 'roll', note: 'Pack bench issue', userEmail: 'priya.shah@stockroom.example', createdAt: '2026-08-31T14:05:00Z' },
    { id: 'mv-05', type: 'IN', itemId: 'itm-1003', itemSku: 'SKU-1003', itemName: 'Nitrile Gloves (L)', fromLocName: null, toLocName: 'Zone A', qty: 42, unit: 'box', note: 'PO-4460 delivery', userEmail: 'sam.okafor@stockroom.example', createdAt: '2026-08-31T09:15:00Z' },
  ]);

  /** Backend-owned data: catalogue used by the item filter. */
  readonly items = signal<Item[]>([
    { id: 'itm-1001', sku: 'SKU-1001', name: 'Steel Bracket 90°', unit: 'ea', reorderAt: 40, totalQty: 128 },
    { id: 'itm-1002', sku: 'SKU-1002', name: 'Hex Bolt M8 x 40', unit: 'box', reorderAt: 25, totalQty: 12 },
    { id: 'itm-1003', sku: 'SKU-1003', name: 'Nitrile Gloves (L)', unit: 'box', reorderAt: 30, totalQty: 30 },
    { id: 'itm-1004', sku: 'SKU-1004', name: 'Packing Tape 48mm', unit: 'roll', reorderAt: 20, totalQty: 96 },
    { id: 'itm-1005', sku: 'SKU-1005', name: 'Pallet Wrap 500mm', unit: 'roll', reorderAt: 15, totalQty: 4 },
    { id: 'itm-1006', sku: 'SKU-1006', name: 'Safety Goggles', unit: 'ea', reorderAt: 10, totalQty: 54 },
    { id: 'itm-1008', sku: 'SKU-1008', name: 'Cable Ties 300mm', unit: 'bag', reorderAt: 25, totalQty: 210 },
  ]);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly filterItem = signal('');
  protected readonly filterType = signal('');
  protected readonly filterFrom = signal('');
  protected readonly filterTo = signal('');
  protected readonly pageNum = signal(1);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly types: MovementType[] = ['IN', 'OUT', 'TRANSFER'];

  @Input() set itemId(value: string | null) { this.filterItem.set(value ?? ''); }
  @Input() set type(value: string | null) { this.filterType.set(value ?? ''); }
  @Input() set from(value: string | null) { this.filterFrom.set(value ?? ''); }
  @Input() set to(value: string | null) { this.filterTo.set(value ?? ''); }
  @Input() set page(value: string | null) { this.pageNum.set(Number(value) || 1); }

  protected readonly filtered = computed<Movement[]>(() => {
    const itemId = this.filterItem();
    const type = this.filterType();
    const from = this.filterFrom();
    const to = this.filterTo();
    return this.movements().filter((movement) => {
      if (itemId && movement.itemId !== itemId) return false;
      if (type && movement.type !== type) return false;
      const day = movement.createdAt.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  });

  protected readonly total = computed(() => this.filtered().length);
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  protected readonly currentPage = computed(() => Math.min(this.pageNum(), this.pageCount()));

  protected readonly rows = computed<Movement[]>(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });

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
