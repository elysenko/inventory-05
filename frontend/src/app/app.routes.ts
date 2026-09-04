import { Routes } from '@angular/router';
import { adminGuard, authGuard, managerGuard } from './core/auth.guard';

/**
 * Every navigable state is addressable: screens are routes, and modals / tabs /
 * filters live in query params so a reviewer can deep-link to any of them.
 */
export const routes: Routes = [
  {
    path: 'login',
    data: { flow: 'auth.login', chrome: false },
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    data: { flow: 'auth.signup', chrome: false },
    loadComponent: () =>
      import('./features/auth/signup.component').then((m) => m.SignupComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'items' },
  {
    path: 'items',
    canActivate: [authGuard],
    data: { flow: 'items.list' },
    loadComponent: () =>
      import('./features/items/item-list.component').then((m) => m.ItemListComponent),
  },
  {
    path: 'items/:id',
    canActivate: [authGuard],
    data: { flow: 'items.detail' },
    loadComponent: () =>
      import('./features/items/item-detail.component').then((m) => m.ItemDetailComponent),
  },
  {
    path: 'locations',
    canActivate: [authGuard],
    data: { flow: 'locations.list' },
    loadComponent: () =>
      import('./features/locations/location-list.component').then(
        (m) => m.LocationListComponent,
      ),
  },
  {
    path: 'movements/new',
    canActivate: [authGuard],
    data: { flow: 'movements.new' },
    loadComponent: () =>
      import('./features/movements/movement-new.component').then(
        (m) => m.MovementNewComponent,
      ),
  },
  {
    path: 'movements',
    canActivate: [managerGuard],
    data: { flow: 'movements.audit' },
    loadComponent: () =>
      import('./features/movements/movement-audit.component').then(
        (m) => m.MovementAuditComponent,
      ),
  },
  {
    path: 'reports/low-stock',
    canActivate: [managerGuard],
    data: { flow: 'reports.lowStock' },
    loadComponent: () =>
      import('./features/reports/low-stock.component').then((m) => m.LowStockComponent),
  },
  {
    path: 'admin/settings',
    canActivate: [adminGuard],
    data: { flow: 'admin.settings' },
    loadComponent: () =>
      import('./features/admin/settings.component').then((m) => m.AdminSettingsComponent),
  },
  {
    path: '403',
    canActivate: [authGuard],
    data: { flow: 'error.forbidden' },
    loadComponent: () =>
      import('./features/errors/forbidden.component').then((m) => m.ForbiddenComponent),
  },
  { path: '**', redirectTo: 'items' },
];
