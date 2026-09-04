# Pipeline Task Decomposition

## Summary
**StockRoom** is a multi-location inventory tracker. Authenticated staff browse an item catalogue (SKU, name, unit, reorder threshold, on-hand total), view a per-location stock breakdown and per-item movement history, manage storage locations, and record stock movements (`IN`, `OUT`, `TRANSFER`) that atomically adjust per-location balances and append to an immutable audit log. Managers/admins additionally get the filterable movement audit log, the low-stock report (`totalQty <= reorderAt`), item/location write access, and an admin settings screen for backing-service credentials. It is built **on the existing scaffolded `enterprise` stack** — Angular 19 standalone SPA in `frontend/`, NestJS 11 + Prisma (PostgreSQL) API in `backend/` — not on the `api/`+`web/`, Angular 21, Prisma 7.10.0 layout named in the plan text. The template stack (versions, directory names, dependency set) is authoritative; the spec contributes the *features*.

## Surface contract

### Reconciliation with the scaffold (binding for every agent)
- Backend root is **`backend/`** (NestJS 11, Prisma `^6.16`, `bcryptjs`, `zod`, `@nestjs/jwt`). Frontend root is **`frontend/`** (Angular 19 standalone, CLI project name `frontend`, `outputPath: dist/frontend`). Do **not** create `api/`, `web/`, or `k8s/`.
- **No new npm dependencies** in `frontend/package.json` (drift disables the prebaked `node_modules` seed) and none in `backend/package.json` unless strictly unavoidable. Consequences: validate DTOs with **zod** (already a dep) via a `ZodValidationPipe`, not `class-validator`; hash with **`bcryptjs`**, not `bcrypt`; implement JWT guards directly on **`@nestjs/jwt`** (`JwtService.verifyAsync`), not `passport`/`passport-jwt`.
- Roles come from the platform contract: **`enum Role { USER, MANAGER, ADMIN }`**, `role Role @default(USER)` (auth model = `full_auth`). Domain mapping: spec "clerk" = `USER`, spec "manager" = `MANAGER`; `ADMIN` has every `MANAGER` privilege **plus** `/admin/settings`. Guards must accept `MANAGER` **or** `ADMIN` wherever the spec says manager-only.
- Logins are minted by Colossus and materialised by `backend/prisma/seed/seed.js` from `COLOSSUS_ACCOUNTS_JSON`. **Do not edit or replace that file**, do not add demo logins, and never make the seed `create`-based. Business fixtures go in a separate idempotent script.
- REST is served under the global prefix **`/api`** (`app.setGlobalPrefix('api')`); Swagger stays at `/api/docs` (the backend probe path). The existing tRPC module and `/trpc/users.*` router stay wired and compiling — no feature is built on tRPC.
- Per-file budget: **400 lines soft / 500 hard**. `data-testid="app-ready"` must never leave `frontend/src/app/app.component.ts`.

### REST endpoints (backend_agent owns all handlers)
| method | path | access |
|---|---|---|
| POST | `/api/auth/signup` | public |
| POST | `/api/auth/login` | public |
| GET | `/api/auth/me` | authenticated |
| GET | `/api/items?q=&sort=` | authenticated |
| GET | `/api/items/:id` | authenticated |
| POST / PATCH / DELETE | `/api/items` , `/api/items/:id` | MANAGER \| ADMIN |
| GET | `/api/locations` | authenticated |
| POST / PATCH / DELETE | `/api/locations` , `/api/locations/:id` | MANAGER \| ADMIN |
| POST | `/api/movements` | authenticated |
| GET | `/api/movements?itemId=&type=&from=&to=&page=&pageSize=` | MANAGER \| ADMIN |
| GET | `/api/reports/low-stock` | MANAGER \| ADMIN |
| GET | `/api/admin/settings` | ADMIN |
| PATCH | `/api/admin/settings` | ADMIN |
| GET | `/api/health` , `/api/health/deep` | public |

### SPA routes (ui_agent owns screens, service_agent owns guards/data)
| path | guard | query params |
|---|---|---|
| `/login` | public | `returnUrl` |
| `/signup` | public | — |
| `/` → redirect `/items` | — | — |
| `/items` | auth | `q`, `sort`, `modal=new-item` |
| `/items/:id` | auth | `tab=stock\|movements`, `modal=edit-item` |
| `/locations` | auth | `modal=new-location\|edit-location`, `id` |
| `/movements/new` | auth | `itemId`, `type` |
| `/movements` | manager (MANAGER\|ADMIN) | `itemId`, `type`, `from`, `to`, `page` |
| `/reports/low-stock` | manager (MANAGER\|ADMIN) | — |
| `/admin/settings` | admin (ADMIN) | — |
| `/403` | auth | — |
| `**` → redirect `/items` | — | — |

### Entities
`User(id, email, name?, passwordHash, role, createdAt, updatedAt)` · `ColossusAccount` (untouched) · `Item(id, sku!, name, description?, unit, reorderAt, createdAt)` · `Location(id, name!, zone, createdAt)` · `StockLevel(id, itemId, locationId, qty)` unique `[itemId, locationId]` · `Movement(id, type, itemId, fromLocId?, toLocId?, qty, note?, userId, createdAt)` · `SystemSetting(key, value, updatedAt)`.

### Invariants
- `item.totalQty` = sum of that item's `StockLevel.qty`; items with no stock rows report `0`, never absent.
- `OUT`/`TRANSFER` beyond on-hand → **400** and balances unchanged (transactional rollback).
- Duplicate SKU / duplicate location name → **400** field-scoped validation error (Prisma `P2002`), not 409.
- Deleting an item/location referenced by a movement (or a non-zero stock level) → **409**; the audit log is never orphaned.
- Unauthenticated → **401**; wrong role → **403**.
- The string **`StockRoom`** renders in the app shell on every route including `/login` (smoke oracle).

## db_agent tasks
- [ ] In `backend/prisma/schema.prisma`, keep `model User`, `enum Role { USER MANAGER ADMIN }`, `role Role @default(USER)` and `model ColossusAccount` exactly as scaffolded; add `enum MovementType { IN OUT TRANSFER }`.
- [ ] Add `model Item` — `id String @id @default(uuid())`, `sku String @unique`, `name String`, `description String?`, `unit String`, `reorderAt Int @default(0)`, `createdAt DateTime @default(now())`, relations to `StockLevel[]` and `Movement[]`.
- [ ] Add `model Location` — `id`, `name String @unique`, `zone String`, `createdAt`, relations to `StockLevel[]` plus named back-relations `movementsFrom` / `movementsTo`.
- [ ] Add `model StockLevel` — `id`, `itemId`, `locationId`, `qty Int @default(0)`, `@@unique([itemId, locationId])`, `@@index([itemId])`, FKs `onDelete: Restrict`.
- [ ] Add `model Movement` — `id`, `type MovementType`, `itemId`, `fromLocId String?`, `toLocId String?`, `qty Int`, `note String?`, `userId`, `createdAt DateTime @default(now())`; `fromLoc`/`toLoc` are two **named** relations to `Location` (`@relation("MovementFrom" | "MovementTo")`) with `onDelete: Restrict`; `@@index([itemId])`, `@@index([createdAt])`.
- [ ] Add `model SystemSetting` — `key String @id`, `value String`, `updatedAt DateTime @updatedAt` (backs admin settings for `postgresql` and `minio`).
- [ ] Generate the migration (`npx prisma migrate dev --name stockroom_inventory`) and commit `backend/prisma/migrations/**`; verify `npx prisma generate && npx tsc --noEmit` passes in `backend/`.
- [ ] Add `backend/prisma/seed/fixtures.js` — **idempotent `upsert`-only** business fixtures run *after* `seed.js`: 3 locations (`Zone A`/`Zone B`/`Zone C` with `zone` = `A`/`B`/`C`), 8 items with varied `reorderAt`, and `StockLevel` rows spread across zones such that at least one item sits at or below its threshold, several are comfortably above, and at least one item has no stock rows at all. No user/login creation — accounts belong to `seed.js`.
- [ ] Register the fixtures script in `backend/package.json` scripts (e.g. `"prisma:fixtures": "node prisma/seed/fixtures.js"`) and chain it after the essential seed in the Docker entrypoint/migrate command; leave `prisma.seed` pointing at `prisma/seed/seed.js`.

## backend_agent tasks
- [ ] `backend/src/main.ts`: add `app.setGlobalPrefix('api')`, keep Swagger mounted at `api/docs`, keep the existing CORS block, and keep `PORT` defaulting to `3000` (nginx proxies to `backend:3000`).
- [ ] `backend/src/common/pipes/zod-validation.pipe.ts` + a shared `ZodDto` helper: validate request bodies/queries with **zod** and emit `400 { message: 'Validation failed', errors: [{ field, message }] }`. Register globally in `AppModule`.
- [ ] `backend/src/common/filters/prisma-exception.filter.ts` as `APP_FILTER`: `P2002` → 400 field-scoped validation error using `meta.target[0]`; `P2025` → 404; `P2003` → 409.
- [ ] `backend/src/auth/` — `auth.module.ts`, `auth.service.ts` (`bcryptjs` compare/hash at 10 rounds; `login()` → `{ accessToken, user: { id, email, role } }` with payload `{ sub, email, role }`; `signup()` assigns `MANAGER` when `user.count() === 0`, otherwise `USER`), `auth.controller.ts` (`POST /api/auth/signup`, `POST /api/auth/login` both `@Public()`, `GET /api/auth/me`). HS256, 12h expiry, secret from `ConfigService.get('JWT_SECRET')`.
- [ ] `backend/src/auth/guards/jwt-auth.guard.ts` (verifies the `Authorization: Bearer` token with `JwtService`, attaches `{ id, email, role }` to the request, skips `@Public()`, else **401**) and `roles.guard.ts` (reads `@Roles(...)`, **403** on mismatch, `ADMIN` implicitly satisfies `MANAGER`). Register as `APP_GUARD` in `AppModule` with JwtAuthGuard **before** RolesGuard.
- [ ] `backend/src/auth/decorators/` — `public.decorator.ts`, `roles.decorator.ts`, `current-user.decorator.ts`.
- [ ] `backend/src/items/` reads — `GET /api/items?q=&sort=` (items + one `stockLevel.groupBy({ by: ['itemId'], _sum: { qty: true } })` merged into `totalQty`, missing ids → `0`); `GET /api/items/:id` (item + `stockLevels` `include: { location: true }`, `totalQty` = sum of that breakdown).
- [ ] `backend/src/items/` writes — `POST`/`PATCH`/`DELETE` gated `@Roles('MANAGER','ADMIN')`; zod schemas for create/update (`sku` non-empty, `name`, `unit`, `description?`, `reorderAt` int ≥ 0); duplicate SKU surfaces as 400 via the Prisma filter; `DELETE` pre-checks `movement.count({ where: { itemId } })` → **409** when non-zero.
- [ ] `backend/src/locations/` — `GET /api/locations` for any authenticated user (clerks need it in the movement form); `POST`/`PATCH`/`DELETE` gated `@Roles('MANAGER','ADMIN')`; delete blocked with **409** when referenced by a movement or a non-zero stock level.
- [ ] `backend/src/movements/movements.service.ts` — `create(dto, user)` wholly inside `prisma.$transaction`: shape validation per type (`IN` requires `toLocId` and rejects `fromLocId`; `OUT` requires `fromLocId`; `TRANSFER` requires both with `fromLocId !== toLocId`; `qty` int ≥ 1); **debit** via race-free `tx.stockLevel.updateMany({ where: { itemId, locationId: fromLocId, qty: { gte: qty } }, data: { qty: { decrement: qty } } })` with `BadRequestException('Insufficient stock at source location')` when `count === 0`; **credit** via `tx.stockLevel.upsert` with `qty: { increment }`; `tx.movement.create` last so any throw rolls the balance back.
- [ ] `backend/src/movements/movements.controller.ts` — `POST /api/movements` (any authenticated user) and `GET /api/movements` `@Roles('MANAGER','ADMIN')` with filters `itemId`, `type`, `from`/`to` (ISO date strings → `createdAt: { gte, lte }`), pagination (`page`, `pageSize` default 50), `orderBy: { createdAt: 'desc' }`, `include: { item: true, user: { select: { email: true } }, fromLoc: true, toLoc: true }`, returning `{ data, total, page, pageSize }`.
- [ ] `backend/src/reports/` — `GET /api/reports/low-stock` `@Roles('MANAGER','ADMIN')`: all items + `groupBy` sums (missing → `0`), filter `totalQty <= reorderAt`, sort by `totalQty - reorderAt` ascending, return `{ id, sku, name, unit, reorderAt, totalQty }`.
- [ ] `backend/src/common/config/runtime-config.service.ts` — `resolveConfig(key: string): Promise<string | null>`: read `process.env[key]` first; if absent or equal to `PLACEHOLDER_CONFIGURE_IN_SETTINGS`, fall back to the `SystemSetting` row with that key; return `null` when neither is set. Export a `ServiceUnconfiguredError` mapped to **503**.
- [ ] `backend/src/admin/settings.controller.ts` + `settings.service.ts` — `GET /api/admin/settings` lists the known service keys for **postgresql** (`DATABASE_URL`) and **minio** (`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`) with **masked** values and a `configured` boolean; `PATCH /api/admin/settings` upserts `{ key, value }` pairs into `SystemSetting`. Both `@Roles('ADMIN')`.
- [ ] `backend/src/health/health.controller.ts` — keep `@Public() GET /api/health` → `{ status: 'ok' }` (no DB) and add `@Public() GET /api/health/deep` → `SELECT 1` via `$queryRaw`, **503** on failure.
- [ ] Wire every new module into `backend/src/app.module.ts` (Auth, Items, Locations, Movements, Reports, Admin) while leaving `TrpcAppModule`/`UsersModule` registered and compiling; add `backend/.env.example` (`DATABASE_URL`, `JWT_SECRET`, `PORT`, `FRONTEND_URL`, MinIO keys) and extend the root `docker-compose.yml` with `backend` + `frontend` services against the existing `postgres` service. Do not touch `.github/workflows/`.

## ui_agent tasks
- [ ] `frontend/src/app/app.component.ts` — keep `data-testid="app-ready"` and `<router-outlet/>`; render a persistent shell header containing the literal text **`StockRoom`** plus nav links (Items, Locations, New movement, and role-gated Audit / Low stock / Admin settings). The brand must render on `/login`, since an unauthenticated `/` resolves there.
- [ ] `frontend/src/app/app.routes.ts` — declare every route in the SPA-routes table with `provideRouter(routes, withComponentInputBinding())` in `app.config.ts`, lazy `loadComponent`, `data.flow` values (`auth.login`, `auth.signup`, `items.list`, `items.detail`, `locations.list`, `movements.new`, `movements.audit`, `reports.lowStock`, `admin.settings`, `error.forbidden`), guards from service_agent, `''` → `/items`, `**` → `/items`.
- [ ] `frontend/src/app/features/auth/login.component.ts` and `signup.component.ts` — reactive forms (email/password), inline API error rendering, login card headline containing "StockRoom", honours `?returnUrl`.
- [ ] `frontend/src/app/features/items/item-list.component.ts` — table of sku / name / unit / reorderAt / totalQty; search box two-way bound to `?q`, sortable via `?sort`; low-stock rows visually flagged; row click → `/items/:id`; "New item" button (MANAGER|ADMIN only) opens `?modal=new-item`.
- [ ] `frontend/src/app/features/items/item-detail.component.ts` + `item-form-modal.component.ts` — header fields, `?tab=stock` per-location breakdown table with a total row, `?tab=movements` history for that item, `?modal=edit-item` restored from the URL on load.
- [ ] `frontend/src/app/features/locations/location-list.component.ts` + `location-form-modal.component.ts` — name/zone table with manager-only create/edit modals driven by `?modal=new-location|edit-location&id=`.
- [ ] `frontend/src/app/features/movements/movement-new.component.ts` — item select (prefilled from `?itemId`), type select IN/OUT/TRANSFER (prefilled from `?type`), from/to location selects shown conditionally by type, qty, note; renders the API's 400 message inline on insufficient stock.
- [ ] `frontend/src/app/features/movements/movement-audit.component.ts` — filter bar (item, type, date range) two-way bound to query params via `router.navigate([], { queryParams, queryParamsHandling: 'merge' })`; columns who / item / type / qty / from → to / timestamp; pagination on `?page`.
- [ ] `frontend/src/app/features/reports/low-stock.component.ts` (sku, name, on-hand, reorderAt, shortfall) and `frontend/src/app/features/errors/forbidden.component.ts` (`/403` with a link back to `/items`).
- [ ] `frontend/src/app/features/admin/settings.component.ts` — `/admin/settings`, ADMIN only: one card per backing service (**postgresql**, **minio**) with a configured/unconfigured badge and a credential form posting to `PATCH /api/admin/settings`; masked current values; success/failure feedback.
- [ ] Give every screen explicit **empty, loading and error** states, and add stable `data-testid`s on each list container, primary table and primary action button; delete `frontend/src/app/home/home.component.ts` and its route so the `home-title">Users<` reject signature can never render.
- [ ] Update `.colossus-acceptance.json` — set `expect_text` to `["StockRoom"]`, keep `ready_testid: "app-ready"` and the existing `reject_signatures`. Add global styles for tables/forms/modals/badges in `frontend/src/styles.css`.
- [ ] Verify the frontend build chain end-to-end: `npx ng build --configuration production` emits to `dist/frontend/browser`, matching `colossus.yaml` `outputDir` and the `COPY` in `frontend/Dockerfile`; confirm `frontend/nginx.conf` keeps `try_files $uri $uri/ /index.html;` so `/items/:id` deep links resolve. Fix any `COPY`/outputPath mismatch — do not assume.

## service_agent tasks
- [ ] `frontend/src/app/core/models.ts` — TypeScript interfaces mirroring the API payloads: `User`, `Role`, `Item`, `ItemDetail` (with `stockLevels[]`), `Location`, `Movement`, `MovementPage`, `LowStockRow`, `AdminSetting`, `AuthResponse`.
- [ ] `frontend/src/app/core/auth.service.ts` — `token` and `user` **signals** hydrated from `localStorage`; `login()`, `signup()`, `logout()` (clear storage → `/login`); computed `isAuthenticated()`, `isManager()` (MANAGER or ADMIN), `isAdmin()`.
- [ ] `frontend/src/app/core/auth.interceptor.ts` — functional interceptor attaching `Authorization: Bearer <token>`; on **401** clears auth state and redirects to `/login?returnUrl=<current url>`; on **403** routes to `/403`. Register via `provideHttpClient(withInterceptors([authInterceptor]))` in `app.config.ts`, keeping the existing `TRPC_CLIENT` provider intact.
- [ ] `frontend/src/app/core/auth.guard.ts`, `manager.guard.ts`, `admin.guard.ts` — `CanActivateFn`s redirecting unauthenticated users to `/login?returnUrl=…` and insufficiently-privileged users to `/403`.
- [ ] `frontend/src/app/core/api.service.ts` — the **only** place `HttpClient` touches the REST API, base `/api`: `listItems(q, sort)`, `getItem(id)`, `createItem`, `updateItem`, `deleteItem`, `listLocations`, `createLocation`, `updateLocation`, `deleteLocation`, `createMovement`, `listMovements(filters)`, `lowStock()`, `getSettings()`, `updateSettings(pairs)`.
- [ ] Normalise API errors into a single `ApiError { status, message, errors?: { field, message }[] }` shape so components can render field-scoped 400s (duplicate SKU) and the insufficient-stock message without parsing raw `HttpErrorResponse`.
- [ ] Confirm the dev proxy `frontend/proxy.conf.json` forwards `/api/*` to the backend and that the production `frontend/nginx.conf` `location /api/ { proxy_pass http://backend:3000/api/; }` matches the backend's global prefix and port; reconcile with `colossus.yaml` if the port differs.
- [ ] Regenerate `.pipeline/surface.json` — replace the scaffolded `users`/`home` entries with the real REST routes, component selectors (`app-item-list`, `app-item-detail`, `app-location-list`, `app-movement-new`, `app-movement-audit`, `app-low-stock`, `app-admin-settings`, `app-login`, `app-signup`, `app-forbidden`) and the `data-testid`s ui_agent added; keep `fileBudget` unchanged.

## tester tasks
- [ ] `backend/test/auth.e2e-spec.ts` — signup/login return a usable JWT; `GET /api/auth/me` echoes the user; **401** on every data endpoint without a token; **403** for a `USER` on `POST/PATCH/DELETE /api/items` and `/api/locations`, on `GET /api/movements`, and on `GET /api/reports/low-stock`; **403** for a `MANAGER` on `/api/admin/settings`.
- [ ] `backend/test/items.e2e-spec.ts` — create/list/detail round-trip; duplicate `SKU-001` → **400** with a field-scoped error body **and** `item.count()` unchanged; `totalQty` is `0` for an item with no stock rows; the detail breakdown sums to `totalQty`; `DELETE` of a movement-referenced item → **409**.
- [ ] `backend/test/movements.e2e-spec.ts` — `IN` 50 into Zone A → level 50; `OUT` 20 → 30; `TRANSFER` 10 A→B → A=20, B=10 with total unchanged; `OUT` 10 against 5 on hand → **400** and the stored level is still 5; shape validation rejects `IN` with `fromLocId`, `TRANSFER` with equal from/to, and `qty` < 1.
- [ ] `backend/test/reports.e2e-spec.ts` — reorderAt 10 / 12 on hand → `OUT` 5 → appears in low-stock; reorderAt 10 / 40 on hand → absent; a zero-stock item appears; results ordered by shortfall ascending.
- [ ] `backend/test/audit.e2e-spec.ts` — audit rows expose user email, item, type, qty and timestamp; filtering by `itemId` and by `from`/`to` narrows correctly; pagination returns `{ data, total, page, pageSize }`.
- [ ] `backend/test/settings.e2e-spec.ts` — `GET /api/admin/settings` as ADMIN lists the postgresql + minio keys with masked values and `configured` flags; `PATCH` upserts and flips `configured`; `resolveConfig` prefers env, falls back to `SystemSetting`, and treats `PLACEHOLDER_CONFIGURE_IN_SETTINGS` as unset.
- [ ] Frontend unit specs — `authGuard` redirects an unauthenticated visitor to `/login?returnUrl=…`; `managerGuard` sends a `USER` to `/403`; `adminGuard` sends a `MANAGER` to `/403`; `authInterceptor` attaches the bearer header and handles 401/403.
- [ ] Smoke walk — load `/` unauthenticated and assert the rendered text contains **`StockRoom`** and `data-testid="app-ready"` is present; then log in as the Colossus-minted `USER` and `MANAGER`/`ADMIN` accounts and visit every route in the SPA-routes table (including a hard refresh of `/items/<id>`) to prove guards, deep links and the nginx SPA fallback. Use the `angular_testability` wait strategy, not `networkidle`.
- [ ] Green-build gate — `cd backend && npx prisma generate && npx tsc --noEmit && npm test -- --maxWorkers=2`; `cd frontend && npx ng build --configuration production`; then `docker compose up --build` with `curl /api/health/deep` returning 200.

## Open questions
- **Port mismatch:** `colossus.yaml` declares `backend.port: 3001`, while `backend/src/main.ts` defaults to `3000` and `frontend/nginx.conf` proxies to `backend:3000`. These tasks assume **3000**; if the deploy agent honours `colossus.yaml`, one of the three must change.
- **Version divergence:** the spec asks for Angular 21, Prisma pinned `7.10.0`, `bcrypt`, `class-validator`/`class-transformer`, `passport-jwt`. The scaffold is Angular 19 / Prisma `^6.16` / `bcryptjs` / `zod` / `@nestjs/jwt`, and dependency drift disables the prebaked `node_modules` seed. Tasks follow the scaffold per the stack contract — confirm.
- **tRPC vs REST:** the stack contract's glue declares `api_client: trpc`, but the spec's entire surface is REST under `/api`. Tasks build REST and leave the tRPC `users` router untouched. Confirm no deploy-time check requires new features over tRPC.
- **K8s manifests:** the spec's Step 15 asks for `k8s/*.yaml`, but deployment is Colossus-managed via `.github/workflows/colossus-deploy.yml` (do not edit) plus `colossus.yaml`. No `k8s/` tasks were emitted — confirm.
- **Role semantics:** the spec's clerk/manager map onto contract roles `USER`/`MANAGER`, with `ADMIN` as a superset. If `ADMIN` should *not* inherit manager write access, the `RolesGuard` rule must change.
- **MinIO:** `minio` is provisioned but the spec describes no object-storage feature (no attachments or item photos). Only the admin-settings credential surface is built for it; no upload path is invented. Confirm whether item images or movement attachments were intended.
- **Seeded demo logins:** the spec's Step 10 wants `manager@demo`/`clerk@demo` with a known password, but the platform contract forbids demo logins (accounts come from `COLOSSUS_ACCOUNTS_JSON`). Fixtures therefore seed inventory data only — confirm the e2e/smoke suites should use the platform-minted accounts.
- **"First signup becomes admin":** implemented as `MANAGER` when the `User` table is empty, but the Colossus seed always creates users first, so in practice every real signup becomes `USER`. Confirm that is intended.
- **`/admin/settings` vs manager screens:** the spec has no admin section; it is added because `postgresql` + `minio` are provisioned deployments. Confirm the settings page should be `ADMIN`-only rather than `MANAGER`-visible.
