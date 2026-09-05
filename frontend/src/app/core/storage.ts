/**
 * Namespaced browser storage.
 *
 * Mockups and preview builds are served many-per-origin at `/<deployment_id>/`
 * and web storage is origin-scoped (not path-scoped), so every key is prefixed
 * with the app's own mount point.
 *
 * The prefix comes from `<base href>` — which the build stamps and the router
 * already treats as the app root — and NOT from the current URL. A per-URL
 * prefix would namespace `/items` and `/locations` separately, so reloading on
 * any route other than the one you signed in on would lose the token and bounce
 * you to /login. When the app is mounted at the origin root the prefix falls
 * back to `app`.
 */
function currentNamespace(): string {
  if (typeof document === 'undefined') {
    return 'app';
  }
  const href = document.querySelector('base')?.getAttribute('href') ?? '/';
  const path = href.replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/^\/+|\/+$/g, '');
  return path || 'app';
}

const NS = currentNamespace();

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
