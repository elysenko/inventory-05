import { Injectable, inject } from '@angular/core';
import { Movement, MovementPage, MovementType } from '../models';
import { ApiClient } from './api-client.service';

/** Body accepted by `POST /api/movements`. */
export interface MovementPayload {
  type: MovementType;
  itemId: string;
  fromLocId?: string;
  toLocId?: string;
  qty: number;
  note?: string;
}

/** Query accepted by `GET /api/movements` (manager-only audit log). */
export interface MovementQuery {
  itemId?: string;
  type?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** REST client for stock movements (`/api/movements`). */
@Injectable({ providedIn: 'root' })
export class MovementsApi {
  private readonly api = inject(ApiClient);

  /** Server-side filtered and paginated; newest first. */
  list(query: MovementQuery): Promise<MovementPage> {
    return this.api.get<MovementPage>('/movements', { ...query });
  }

  /**
   * Records a movement. The balance update is transactional server-side, so an
   * over-draw returns 400 and leaves the stored balance untouched.
   */
  create(payload: MovementPayload): Promise<Movement> {
    return this.api.post<Movement>('/movements', payload);
  }
}
