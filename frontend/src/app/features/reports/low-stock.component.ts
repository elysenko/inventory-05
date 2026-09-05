import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReportsApi } from '../../core/api/reports-api.service';
import { LowStockRow } from '../../core/models';
import { IS_PREVIEW } from '../../core/preview';
import { PREVIEW_LOW_STOCK } from '../../core/preview-fixtures';

@Component({
  selector: 'app-low-stock',
  imports: [RouterLink],
  templateUrl: './low-stock.component.html',
  styleUrl: './low-stock.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LowStockComponent implements OnInit {
  private readonly reportsApi = inject(ReportsApi);

  /**
   * `GET /api/reports/low-stock` — items where `totalQty <= reorderAt`.
   * Items with no stock rows at all are included by the API (0 on hand is the
   * most urgent case), so this list is not just "items that have moved".
   */
  readonly rows = signal<LowStockRow[]>(IS_PREVIEW ? PREVIEW_LOW_STOCK : []);

  protected readonly loading = signal(!IS_PREVIEW);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    if (IS_PREVIEW) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      this.rows.set(await this.reportsApi.lowStock());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      this.loading.set(false);
    }
  }

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
