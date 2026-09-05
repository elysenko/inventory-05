import { Injectable, inject } from '@angular/core';
import { Item, ItemDetail, Movement } from '../models';
import { ApiClient } from './api-client.service';

/** Body accepted by `POST /api/items` and `PATCH /api/items/:id`. */
export interface ItemPayload {
  sku: string;
  name: string;
  unit: string;
  reorderAt: number;
  description?: string;
}

/** REST client for the item catalogue (`/api/items`). */
@Injectable({ providedIn: 'root' })
export class ItemsApi {
  private readonly api = inject(ApiClient);

  /** `q` is matched server-side against SKU and name, case-insensitively. */
  list(q?: string): Promise<Item[]> {
    return this.api.get<Item[]>('/items', { q });
  }

  /** Header fields plus the per-location breakdown that sums to `totalQty`. */
  get(id: string): Promise<ItemDetail> {
    return this.api.get<ItemDetail>(`/items/${encodeURIComponent(id)}`);
  }

  /** Item-scoped history — readable by every signed-in user, unlike the audit log. */
  movements(id: string): Promise<Movement[]> {
    return this.api.get<Movement[]>(`/items/${encodeURIComponent(id)}/movements`);
  }

  /** Manager-only. A duplicate SKU comes back as a 400 with `errors[].field === 'sku'`. */
  create(payload: ItemPayload): Promise<Item> {
    return this.api.post<Item>('/items', payload);
  }

  update(id: string, payload: Partial<ItemPayload>): Promise<Item> {
    return this.api.patch<Item>(`/items/${encodeURIComponent(id)}`, payload);
  }

  /** Refused with 409 while movements still reference the item. */
  remove(id: string): Promise<void> {
    return this.api.delete<void>(`/items/${encodeURIComponent(id)}`);
  }
}
