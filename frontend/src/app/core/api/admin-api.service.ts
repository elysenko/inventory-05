import { Injectable, inject } from '@angular/core';
import { AdminSetting } from '../models';
import { ApiClient } from './api-client.service';

/**
 * REST client for the backing-service credentials screen
 * (`/api/admin/settings`, admin-only).
 *
 * The API resolves each key from a stored override first and the pod
 * environment second, and always returns secrets masked — a value typed here
 * is written, never read back in the clear.
 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly api = inject(ApiClient);

  list(): Promise<AdminSetting[]> {
    return this.api.get<AdminSetting[]>('/admin/settings');
  }

  /** Sparse map of key -> value; an empty value clears the override. */
  save(values: Record<string, string>): Promise<AdminSetting[]> {
    return this.api.patch<AdminSetting[]>('/admin/settings', { values });
  }
}
