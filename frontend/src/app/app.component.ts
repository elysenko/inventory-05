import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth.service';
import { Role } from './core/models';

interface NavLink {
  path: string;
  label: string;
  icon: string;
  requires: 'any' | 'manager' | 'admin';
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  /** Preview-only role switcher: shows how navigation changes per role. */
  protected readonly previewRoles: Role[] | null = COLOSSUS_PREVIEW
    ? ['USER', 'MANAGER', 'ADMIN']
    : null;

  protected readonly url = signal(this.router.url);
  protected readonly drawerOpen = signal(false);

  protected readonly links: NavLink[] = [
    { path: '/items', label: 'Items', icon: '▤', requires: 'any' },
    { path: '/locations', label: 'Locations', icon: '⌗', requires: 'any' },
    { path: '/movements/new', label: 'Record movement', icon: '⇄', requires: 'any' },
    { path: '/movements', label: 'Audit log', icon: '☰', requires: 'manager' },
    { path: '/reports/low-stock', label: 'Low stock', icon: '⚠', requires: 'manager' },
    { path: '/admin/settings', label: 'Settings', icon: '⚙', requires: 'admin' },
  ];

  constructor() {
    const destroyRef = inject(DestroyRef);
    const sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.url.set(e.urlAfterRedirects);
        this.drawerOpen.set(false);
      });
    destroyRef.onDestroy(() => sub.unsubscribe());
  }

  /** Auth screens render the brand only — no navigation chrome. */
  protected chromeVisible(): boolean {
    const path = this.url().split('?')[0];
    return !(path.startsWith('/login') || path.startsWith('/signup'));
  }

  /** The floating action is redundant on the screen it links to. */
  protected showFab(): boolean {
    return this.chromeVisible() && !this.url().split('?')[0].startsWith('/movements/new');
  }

  protected visibleLinks(): NavLink[] {
    return this.links.filter(
      (link) =>
        link.requires === 'any' ||
        (link.requires === 'manager' && this.auth.isManager()) ||
        (link.requires === 'admin' && this.auth.isAdmin()),
    );
  }

  protected toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }

  protected onPreviewRole(event: Event): void {
    this.auth.setPreviewRole((event.target as HTMLSelectElement).value as Role);
  }

  protected initials(): string {
    const name = this.auth.user()?.name ?? '';
    return (
      name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'SR'
    );
  }
}
