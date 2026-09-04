import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LowStockRow } from '../../core/models';

@Component({
  selector: 'app-low-stock',
  imports: [RouterLink],
  templateUrl: './low-stock.component.html',
  styleUrl: './low-stock.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LowStockComponent {
  /** Backend-owned data: items where totalQty <= reorderAt, ordered by shortfall. */
  readonly rows = signal<LowStockRow[]>([
    { id: 'itm-1007', sku: 'SKU-1007', name: 'Thermal Labels 4x6', unit: 'pack', reorderAt: 12, totalQty: 0 },
    { id: 'itm-1002', sku: 'SKU-1002', name: 'Hex Bolt M8 x 40', unit: 'box', reorderAt: 25, totalQty: 12 },
    { id: 'itm-1005', sku: 'SKU-1005', name: 'Pallet Wrap 500mm', unit: 'roll', reorderAt: 15, totalQty: 4 },
    { id: 'itm-1003', sku: 'SKU-1003', name: 'Nitrile Gloves (L)', unit: 'box', reorderAt: 30, totalQty: 30 },
  ]);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly sorted = computed<LowStockRow[]>(() =>
    [...this.rows()].sort(
      (a, b) => a.totalQty - a.reorderAt - (b.totalQty - b.reorderAt),
    ),
  );

  protected readonly outOfStock = computed(
    () => this.rows().filter((row) => row.totalQty === 0).length,
  );

  protected shortfall(row: LowStockRow): number {
    return Math.max(0, row.reorderAt - row.totalQty);
  }

  protected severity(row: LowStockRow): string {
    if (row.totalQty === 0) return 'badge badge-out';
    return this.shortfall(row) > 0 ? 'badge badge-low' : 'badge';
  }

  protected severityLabel(row: LowStockRow): string {
    if (row.totalQty === 0) return 'Out of stock';
    return this.shortfall(row) > 0 ? 'Below threshold' : 'At threshold';
  }
}
