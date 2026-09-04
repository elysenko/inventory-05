/**
 * Namespaced browser storage.
 *
 * Mockups are served many-per-origin at `/<mockup_id>/` and web storage is
 * origin-scoped (not path-scoped), so every key is prefixed with the first URL
 * path segment. In production the first segment is empty and the prefix falls
 * back to `app`.
 */
const NS =
  (typeof location !== 'undefined' && location.pathname.split('/')[1]) || 'app';

export const nsKey = (key: string): string => `${NS}:${key}`;

/** Reads and validates a JSON value. Any unrecognised value is cleared, never thrown. */
export function readJson<T>(key: string, isValid: (value: unknown) => boolean): T | null {
  try {
    const raw = localStorage.getItem(nsKey(key));
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isValid(parsed)) {
      remove(key);
      return null;
    }
    return parsed as T;
  } catch {
    remove(key);
    return null;
  }
}

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(nsKey(key));
  } catch {
    return null;
  }
}

export function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(
      nsKey(key),
      typeof value === 'string' ? value : JSON.stringify(value),
    );
  } catch {
    /* storage unavailable (private mode / quota) — the app stays usable */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(nsKey(key));
  } catch {
    /* ignore */
  }
}
