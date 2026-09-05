import { Injectable, inject } from '@angular/core';
import { Location } from '../models';
import { ApiClient } from './api-client.service';

/** Body accepted by `POST /api/locations` and `PATCH /api/locations/:id`. */
export interface LocationPayload {
  name: string;
  zone: string;
}

/** REST client for storage locations (`/api/locations`). */
@Injectable({ providedIn: 'root' })
export class LocationsApi {
  private readonly api = inject(ApiClient);

  /** Open to every signed-in user: clerks need it to fill the movement form. */
  list(): Promise<Location[]> {
    return this.api.get<Location[]>('/locations');
  }

  create(payload: LocationPayload): Promise<Location> {
    return this.api.post<Location>('/locations', payload);
  }

  update(id: string, payload: Partial<LocationPayload>): Promise<Location> {
    return this.api.patch<Location>(`/locations/${encodeURIComponent(id)}`, payload);
  }

  /** Refused with 409 while the location holds stock or appears in the audit log. */
  remove(id: string): Promise<void> {
    return this.api.delete<void>(`/locations/${encodeURIComponent(id)}`);
  }
}
