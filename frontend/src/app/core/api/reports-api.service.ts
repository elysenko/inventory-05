import { Injectable, inject } from '@angular/core';
import { LowStockRow } from '../models';
import { ApiClient } from './api-client.service';

/** REST client for reporting (`/api/reports`). */
@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly api = inject(ApiClient);

  /** Manager-only: items where `totalQty <= reorderAt`, deepest shortfall first. */
  lowStock(): Promise<LowStockRow[]> {
    return this.api.get<LowStockRow[]>('/reports/low-stock');
  }
}
