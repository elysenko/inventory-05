# Pipeline Task Decomposition

## Summary
**StockRoom** is a multi-location inventory tracker. Authenticated staff browse an item catalogue (SKU, name, unit, reorder threshold, on-hand total), open a per-item detail view with a per-location stock breakdown and movement history, manage storage locations, and record stock movements (`IN`, `OUT`, `TRANSFER`) that atomically adjust per-location balances and append to an immutable audit log. Managers additionally get the filterable movement audit log, the low-stock report (`totalQty <= reorderAt`) and item/location write access; admins additionally get `/admin/settings` for backing-service credentials. The build runs **on the already-scaffolded `enterprise` stack** — Angular 19 standalone SPA in `frontend/` (shell, routes, guards and every feature component already exist with mock data), NestJS 11 + Prisma 6 API in `backend/` (only health / prisma / tRPC-users exist today). The scaffold is authoritative for layout, versions and dependencies; the spec is authoritative for behaviour.

## Surface contract

### Reconciliation with the scaffold (binding for every agent)
- Backend root is **`backend/`** (NestJS 11, Prisma `^6.16`, `bcryptjs`, `zod`, `@nestjs/jwt`, `@nestjs/swagger`). Frontend root is **`frontend/`** (Angular 19 standalone, CLI project `frontend`). Do **not** create `api/`, `web/` or `k8s/` — the spec's Step 14/15 paths are superseded by the scaffold + `colossus.yaml`.
- **No new npm dependencies.** Dependency drift disables the prebaked `node_modules` seed. Consequences: validate with **zod** (not `class-validator`), hash with **`bcryptjs`** (not `bcrypt`), implement JWT verification directly on **`@nestjs/jwt`** (`JwtService.verifyAsync`, not `passport`/`passport-jwt`), keep **Prisma `^6.16`** (not the pinned `7.10.0` in the spec text) and **Angular 19** (not 21).
- Roles come from the platform contract and already exist in `schema.prisma`: **`enum Role { USER MANAGER ADMIN }`**, `role Role @default(USER)` (auth model = `full_auth`). Domain mapping: spec "clerk" = `USER`, spec "manager" = `MANAGER`; **`ADMIN` inherits every `MANAGER` privilege** plus `/admin/settings`. Guards must accept `MANAGER` **or** `ADMIN` wherever the spec says manager-only.
- Logins are minted by Colossus and materialised by `backend/prisma/seed/seed.js` from `COLOSSUS_ACCOUNTS_JSON`. **Do not edit or replace that file**, do not add `manager@demo`/`clerk@demo` logins, and never make a seed `create`-based.
- REST is served under the global prefix **`/api`**; Swagger stays at `/api/docs` (the backend probe path). The existing tRPC module and `/trpc/users.*` router stay wired and compiling — no StockRoom feature is built on tRPC.
- Per-file budget (`.pipeline/surface.json`): **400 lines soft / 500 hard**. `data-testid="app-ready"` must never leave `frontend/src/app/app.component.ts`.

### REST endpoints (backend_agent owns every handler)
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

### SPA routes (already declared in `frontend/src/app/app.routes.ts` — keep paths, flows and guards)
| path | guard | `data.flow` | query params |
|---|---|---|---|
| `/login` | public | `auth.login` | `returnUrl` |
| `/signup` | public | `auth.signup` | — |
| `/` → redirect `/items` | — | — | — |
| `/items` | auth | `items.list` | `q`, `sort`, `modal=new-item` |
| `/items/:id` | auth | `items.detail` | `tab=stock\|movements`, `modal=edit-item` |
| `/locations` | auth | `locations.list` | `modal=new-location\|edit-location`, `id` |
| `/movements/new` | auth | `movements.new` | `itemId`, `type` |
| `/movements` | manager (MANAGER\|ADMIN) | `movements.audit` | `itemId`, `type`, `from`, `to`, `page` |
| `/reports/low-stock` | manager (MANAGER\|ADMIN) | `reports.lowStock` | — |
| `/admin/settings` | admin (ADMIN) | `admin.settings` | — |
| `/403` | auth | `error.forbidden` | — |
| `**` → redirect `/items` | — | — | — |

### Entities
`User(id, email, name?, passwordHash, role, createdAt, updatedAt)` (exists) · `ColossusAccount` (exists, untouched) · `Item(id, sku!, name, description?, unit, reorderAt, createdAt)` · `Location(id, name!, zone, createdAt)` · `StockLevel(id, itemId, locationId, qty)` unique `[itemId, locationId]` · `Movement(id, type, itemId, fromLocId?, toLocId?, qty, note?, userId, createdAt)` · `SystemSetting(key, value, updatedAt)`.

### Invariants
- `item.totalQty` = sum of that item's `StockLevel.qty`; items with no stock rows report `0`, never absent.
- `OUT`/`TRANSFER` beyond on-hand → **400** with balances unchanged (transactional rollback).
- Duplicate SKU / duplicate location name → **400** field-scoped validation error (Prisma `P2002`), not 409.
- Deleting an item/location referenced by a movement (or a non-zero stock level) → **409**; the audit log is never orphaned.
- Unauthenticated → **401**; wrong role → **403**.
- The literal string **`StockRoom`** renders in the app shell on every route including `/login` (smoke oracle / `.colossus-acceptance.json` `expect_text`).

## db_agent tasks
- [ ] In `backend/prisma/schema.prisma`, leave `model User`, `enum Role { USER MANAGER ADMIN }` and `model ColossusAccount` exactly as scaffolded; add `enum MovementType { IN OUT TRANSFER }`.
- [ ] Add `model Item` — `id String @id @default(uuid())`, `sku String @unique`, `name String`, `description String?`, `unit String`, `reorderAt Int @default(0)`, `createdAt DateTime @default(now())`, relations to `StockLevel[]` and `Movement[]`.
- [ ] Add `model Location` — `id`, `name String @unique`, `zone String`, `createdAt`, relation to `StockLevel[]` plus named back-relations `movementsFrom` / `movementsTo`.
- [ ] Add `model StockLevel` — `id`, `itemId`, `locationId`, `qty Int @default(0)`, `@@unique([itemId, locationId])`, `@@index([itemId])`, FKs `onDelete: Restrict`.
- [ ] Add `model Movement` — `id`, `type MovementType`, `itemId`, `fromLocId String?`, `toLocId String?`, `qty Int`, `note String?`, `userId`, `createdAt DateTime @default(now())`; `fromLoc`/`toLoc` as two **named** relations to `Location` (`@relation("MovementFrom" | "MovementTo")`) with `onDelete: Restrict`; `@@index([itemId])`, `@@index([createdAt])`.
- [ ] Add `model SystemSetting` — `key String @id`, `value String`, `updatedAt DateTime @updatedAt` (backs `/api/admin/settings` for the provisioned `postgresql` + `minio` services).
- [ ] Generate and commit the migration (`npx prisma migrate dev --name stockroom_inventory`, `backend/prisma/migrations/**`); verify `npx prisma generate && npx tsc --noEmit` still passes in `backend/`.
- [ ] Add `backend/prisma/seed/fixtures.js` — **idempotent, `upsert`-only** business fixtures that run *after* `seed.js`: 3 locations (`Zone A`/`Zone B`/`Zone C`, `zone` = `A`/`B`/`C`), 8 items with varied `reorderAt`, and `StockLevel` rows spread across zones so that at least one item sits at or below its threshold, several are comfortably above, and at least one item has no stock rows at all. No user/login creation — accounts belong to `seed.js`.
- [ ] Register the fixtures script in `backend/package.json` (`"prisma:fixtures": "node prisma/seed/fixtures.js"`) and chain it after the essential seed in the container start command; leave `prisma.seed` pointing at `prisma/seed/seed.js`.

## backend_agent tasks
- [ ] `backend/src/main.ts`: add `app.setGlobalPrefix('api')`, keep Swagger mounted so `/api/docs` still answers (backend probe path), keep CORS, keep the existing port default and align it with `colossus.yaml` `backend.port` / `frontend/nginx.conf` `proxy_pass` (see Open questions).
- [ ] `backend/src/common/pipes/zod-validation.pipe.ts` — validate bodies/queries with **zod** and emit `400 { message: 'Validation failed', errors: [{ field, message }] }`; register globally in `AppModule`.
- [ ] `backend/src/common/filters/prisma-exception.filter.ts` as `APP_FILTER` — `P2002` → 400 field-scoped validation error using `meta.target[0]`; `P2025` → 404; `P2003` → 409.
- [ ] `backend/src/auth/` module + service — `bcryptjs` hash/compare at 10 rounds; `login()` → `{ accessToken, user: { id, email, role } }` with payload `{ sub, email, role }` (HS256, 12h, `JWT_SECRET` via `ConfigService`); `signup()` assigns `MANAGER` when `user.count() === 0`, otherwise `USER`.
- [ ] `backend/src/auth/auth.controller.ts` — `POST /api/auth/signup`, `POST /api/auth/login` (both `@Public()`), `GET /api/auth/me` returning the current user. Request/response shapes must match what `frontend/src/app/core/auth.service.ts` already posts.
- [ ] `backend/src/auth/guards/jwt-auth.guard.ts` (verify the `Authorization: Bearer` token with `JwtService`, attach `{ id, email, role }` to the request, skip when `@Public()`, else **401**) and `roles.guard.ts` (read `@Roles(...)`, **403** on mismatch, `ADMIN` implicitly satisfies `MANAGER`); register both as `APP_GUARD` in `AppModule` with JwtAuthGuard **before** RolesGuard.
- [ ] `backend/src/auth/decorators/` — `public.decorator.ts`, `roles.decorator.ts`, `current-user.decorator.ts`.
- [ ] `backend/src/items/` reads — `GET /api/items?q=&sort=` (items + one `stockLevel.groupBy({ by: ['itemId'], _sum: { qty: true } })` merged into `totalQty`, missing ids → `0`) and `GET /api/items/:id` (item + `stockLevels` `include: { location: true }`, `totalQty` = sum of that breakdown).
- [ ] `backend/src/items/` writes — `POST`/`PATCH`/`DELETE` gated `@Roles('MANAGER','ADMIN')`; zod create/update schemas (`sku` non-empty, `name`, `unit`, `description?`, `reorderAt` int ≥ 0); duplicate SKU surfaces as a field-scoped **400** via the Prisma filter; `DELETE` pre-checks `movement.count({ where: { itemId } })` → **409** when non-zero.
- [ ] `backend/src/locations/` — `GET /api/locations` for any authenticated user (clerks need it in the movement form); `POST`/`PATCH`/`DELETE` gated `@Roles('MANAGER','ADMIN')`; delete blocked with **409** when referenced by a movement or a non-zero stock level.
- [ ] `backend/src/movements/movements.service.ts` — `create(dto, user)` wholly inside `prisma.$transaction`: per-type shape validation (`IN` requires `toLocId` and rejects `fromLocId`; `OUT` requires `fromLocId`; `TRANSFER` requires both with `fromLocId !== toLocId`; `qty` int ≥ 1); **debit** via race-free `tx.stockLevel.updateMany({ where: { itemId, locationId: fromLocId, qty: { gte: qty } }, data: { qty: { decrement: qty } } })` throwing `BadRequestException('Insufficient stock at source location')` when `count === 0`; **credit** via `tx.stockLevel.upsert` with `qty: { increment: qty }`; `tx.movement.create` last so any throw rolls the balance back.
- [ ] `backend/src/movements/movements.controller.ts` — `POST /api/movements` (any authenticated user) and `GET /api/movements` `@Roles('MANAGER','ADMIN')` with filters `itemId`, `type`, `from`/`to` (ISO date strings → `createdAt: { gte, lte }`), pagination (`page`, `pageSize` default 50), `orderBy: { createdAt: 'desc' }`, `include: { item: true, user: { select: { email: true } }, fromLoc: true, toLoc: true }`, returning `{ data, total, page, pageSize }`.
- [ ] `backend/src/reports/` — `GET /api/reports/low-stock` `@Roles('MANAGER','ADMIN')`: all items + `groupBy` sums (missing → `0`), filter `totalQty <= reorderAt`, sort by `totalQty - reorderAt` ascending, return `{ id, sku, name, unit, reorderAt, totalQty }`.
- [ ] `backend/src/common/config/config.service.ts` — `resolveConfig(key: string): Promise<string | null>`: read `process.env[key]` first; if absent or equal to `PLACEHOLDER_CONFIGURE_IN_SETTINGS`, fall back to the `SystemSetting` row with that key; return `null` when neither is set. Export `ServiceUnconfiguredError` mapped to **503**.
- [ ] `backend/src/admin/settings.{controller,service}.ts` — `GET /api/admin/settings` lists the known service keys for **postgresql** (`DATABASE_URL`) and **minio** (`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`) with **masked** values and a `configured` boolean; `PATCH /api/admin/settings` upserts `{ key, value }` pairs into `SystemSetting`. Both `@Roles('ADMIN')`.
- [ ] `backend/src/health/health.controller.ts` — keep `@Public() GET /api/health` → `{ status: 'ok' }` (no DB) and add `@Public() GET /api/health/deep` → `SELECT 1` via `$queryRaw`, **503** on failure.
- [ ] Wire the new modules into `backend/src/app.module.ts` (Auth, Items, Locations, Movements, Reports, Admin) while leaving `TrpcAppModule` / `UsersModule` registered and compiling; add `backend/.env.example` (`DATABASE_URL`, `JWT_SECRET`, `PORT`, MinIO keys) and extend the root `docker-compose.yml` with the backend + frontend services against the existing postgres service. Do not touch `.github/workflows/`.

## ui_agent tasks
- [ ] `frontend/src/app/app.component.{ts,html}` — keep `data-testid="app-ready"`, the `StockRoom` brand (must render on `/login`) and the existing nav/testids; ensure nav links are role-gated via `auth.isManager()` / `auth.isAdmin()` and that the shell renders correctly for an unauthenticated visitor.
- [ ] `frontend/src/app/app.routes.ts` — keep every route, `data.flow` value and guard already declared; only adjust if a component symbol name changes. No new routes beyond the SPA-routes table.
- [ ] `frontend/src/app/features/auth/login.component.*` + `signup.component.*` — finish the reactive forms, inline API error rendering, `?returnUrl` handling and a headline containing "StockRoom"; remove any preview-only shortcut that would bypass a real login.
- [ ] `frontend/src/app/features/items/item-list.component.*` — table of sku / name / unit / reorderAt / totalQty; search bound to `?q`, sort bound to `?sort` via `router.navigate([], { queryParamsHandling: 'merge' })`; low-stock rows visually flagged; row → `/items/:id`; "New item" (MANAGER|ADMIN only) opens `?modal=new-item`. Replace the mock `items` signal initializer with an empty array + loading state (service_agent supplies the data call).
- [ ] `frontend/src/app/features/items/item-detail.component.*` + `item-form-modal.component.*` — header fields, `?tab=stock` per-location breakdown table with a total row, `?tab=movements` history for that item, `?modal=edit-item` restored from the URL on load; clear the mock initializers.
- [ ] `frontend/src/app/features/locations/location-list.component.*` + `location-form-modal.component.*` — name/zone table, manager-only create/edit modals driven by `?modal=new-location|edit-location&id=`; clear the mock initializers.
- [ ] `frontend/src/app/features/movements/movement-new.component.*` — item select (prefilled from `?itemId`), type select IN/OUT/TRANSFER (prefilled from `?type`), from/to selects shown conditionally by type, qty, note; render the API's 400 message inline on insufficient stock.
- [ ] `frontend/src/app/features/movements/movement-audit.component.*` — filter bar (item, type, `from`/`to` dates) two-way bound to query params, columns who / item / type / qty / from → to / timestamp, pagination on `?page`.
- [ ] `frontend/src/app/features/reports/low-stock.component.*` (sku, name, on-hand, reorderAt, shortfall) and `frontend/src/app/features/errors/forbidden.component.*` (`/403`, link back to `/items`).
- [ ] `frontend/src/app/features/admin/settings.component.*` — `/admin/settings`, ADMIN only: one card per provisioned service (**postgresql**, **minio**) with a configured/unconfigured badge, masked current values and a credential form that `PATCH`es `/api/admin/settings`; show a banner listing any service reported `configured: false` ("The following need credentials to activate: …").
- [ ] Give every screen explicit **empty, loading and error** states and stable `data-testid`s consistent with `.pipeline/approved_landmarks.json`; make sure nothing can render the reject signatures in `.colossus-acceptance.json` (`home-title">Users<`, bare `Loading...`, `Failed to load users.`).
- [ ] **Build-chain fix:** `frontend/angular.json` sets `outputPath: { base: "dist/frontend", browser: "" }`, which emits directly to `dist/frontend`, while `frontend/Dockerfile` copies `dist/frontend/browser` and `colossus.yaml` declares `outputDir: dist/frontend/browser`. Reconcile them (preferred: set `"browser": "browser"`) and prove it with `npx ng build --configuration production` + a directory listing. Confirm `frontend/nginx.conf` keeps `try_files $uri $uri/ /index.html;` so `/items/:id` deep links resolve.

## service_agent tasks
- [ ] `frontend/src/app/core/models.ts` — extend the existing interfaces to mirror the API payloads exactly: `User`, `Role`, `Item`, `ItemDetail` (with `stockLevels[]` + `location`), `Location`, `Movement`, `MovementPage`, `LowStockRow`, `AdminSetting`, `AuthResponse`.
- [ ] `frontend/src/app/core/api.service.ts` (new) — the **only** place `HttpClient` touches the domain API, base `/api`: `listItems(q, sort)`, `getItem(id)`, `createItem`, `updateItem`, `deleteItem`, `listLocations`, `createLocation`, `updateLocation`, `deleteLocation`, `createMovement`, `listMovements(filters)`, `lowStock()`, `getSettings()`, `updateSettings(pairs)`.
- [ ] `frontend/src/app/core/auth.interceptor.ts` (new) — functional interceptor attaching `Authorization: Bearer <token>`; on **401** clear auth state and redirect to `/login?returnUrl=<current url>`; on **403** route to `/403`. Register it in `app.config.ts` via `provideHttpClient(withInterceptors([authInterceptor]))`, keeping the existing `TRPC_CLIENT` provider and `provideAnimations()` intact.
- [ ] `frontend/src/app/core/auth.service.ts` — align `login()` / `signup()` / `logout()` and the `token`/`user` signals with the real `/api/auth/*` responses; keep `isAuthenticated()`, `isManager()` (MANAGER or ADMIN) and `isAdmin()`; keep `localStorage` hydration via `core/storage.ts`.
- [ ] Wire each feature component's data signals to `ApiService` (items list/detail, locations, movement create, audit page, low-stock, admin settings), replacing every mock initializer, and drive filters/pagination from the route query params the component already reads.
- [ ] Normalise API failures into a single `ApiError { status, message, errors?: { field, message }[] }` so components can render field-scoped 400s (duplicate SKU) and the insufficient-stock message without parsing raw `HttpErrorResponse`.
- [ ] Verify the dev proxy `frontend/proxy.conf.json` (`/api/*` → backend) and production `frontend/nginx.conf` (`location /api/ { proxy_pass http://backend:3000/api/; }`) both match the backend's global prefix and actual listening port; reconcile with `colossus.yaml` `backend.port`.
- [ ] Regenerate `.pipeline/surface.json` — replace the scaffolded `/trpc/users.*` + `home` entries with the real REST routes, the component selectors listed in the SPA-routes table and the `data-testid`s that ship; keep `fileBudget` unchanged.

## tester tasks
- [ ] `backend/test/auth.e2e-spec.ts` — signup/login return a usable JWT; `GET /api/auth/me` echoes the user; **401** on every data endpoint without a token; **403** for a `USER` on `POST/PATCH/DELETE /api/items` and `/api/locations`, on `GET /api/movements` and on `GET /api/reports/low-stock`; **403** for a `MANAGER` on `/api/admin/settings`.
- [ ] `backend/test/items.e2e-spec.ts` — create/list/detail round-trip; duplicate `SKU-001` → **400** with a field-scoped error body **and** `item.count()` unchanged; `totalQty` is `0` for an item with no stock rows; the detail breakdown sums to `totalQty`; `DELETE` of a movement-referenced item → **409**.
- [ ] `backend/test/movements.e2e-spec.ts` — `IN` 50 into Zone A → level 50; `OUT` 20 → 30; `TRANSFER` 10 A→B → A=20, B=10 with the total unchanged; `OUT` 10 against 5 on hand → **400** and the stored level is still 5; shape validation rejects `IN` with `fromLocId`, `TRANSFER` with equal from/to, and `qty` < 1.
- [ ] `backend/test/reports.e2e-spec.ts` — reorderAt 10 / 12 on hand → `OUT` 5 → appears in low-stock; reorderAt 10 / 40 on hand → absent; a zero-stock item appears; rows ordered by shortfall ascending.
- [ ] `backend/test/audit.e2e-spec.ts` — audit rows expose user email, item, type, qty and timestamp; filtering by `itemId` and by `from`/`to` narrows correctly; pagination returns `{ data, total, page, pageSize }`.
- [ ] `backend/test/settings.e2e-spec.ts` — `GET /api/admin/settings` as ADMIN lists the postgresql + minio keys with masked values and `configured` flags; `PATCH` upserts and flips `configured`; `resolveConfig` prefers env, falls back to `SystemSetting`, and treats `PLACEHOLDER_CONFIGURE_IN_SETTINGS` as unset.
- [ ] `backend/test/regression.e2e-spec.ts` — `GET /api/health`, `GET /api/health/deep` and the surviving `/trpc/users.*` routes still answer, so the scaffolded surface is not broken by the new modules.
- [ ] Frontend unit specs — `authGuard` redirects an unauthenticated visitor to `/login?returnUrl=…`; `managerGuard` sends a `USER` to `/403`; `adminGuard` sends a `MANAGER` to `/403`; `authInterceptor` attaches the bearer header and handles 401/403.
- [ ] Smoke walk — load `/` unauthenticated and assert the rendered text contains **`StockRoom`** with `data-testid="app-ready"` present; then log in as the Colossus-minted `USER` / `MANAGER` / `ADMIN` accounts and visit every route in the SPA-routes table (including a hard refresh of `/items/<id>`) to prove guards, deep links and the nginx SPA fallback. Use the `angular_testability` wait strategy, not `networkidle`.
- [ ] Green-build gate — `cd backend && npx prisma generate && npx tsc --noEmit && npm test -- --maxWorkers=2`; `cd frontend && npx ng build --configuration production` (assert the emitted directory matches `colossus.yaml` `outputDir`); then `docker compose up --build` with `curl /api/health/deep` returning 200.

## Open questions
- **Port mismatch:** `colossus.yaml` declares `backend.port: 3001`, while `frontend/nginx.conf` proxies to `backend:3000`, `frontend/proxy.conf.json` targets `localhost:3000` and `backend/src/main.ts` defaults to 3000. These tasks assume **3000**; if the deploy agent honours `colossus.yaml`, one of the three must be changed — pick one before backend_agent lands `main.ts`.
- **Angular output path:** `angular.json` (`browser: ""`) contradicts both `frontend/Dockerfile` and `colossus.yaml` (`dist/frontend/browser`). Tasks fix `angular.json`; confirm the deploy agent reads `colossus.yaml` and not `angular.json`.
- **Version divergence:** the spec asks for Angular 21, Prisma pinned `7.10.0`, `bcrypt`, `class-validator`/`class-transformer`, `passport-jwt`. The scaffold is Angular 19 / Prisma `^6.16` / `bcryptjs` / `zod` / `@nestjs/jwt`, and dependency drift disables the prebaked `node_modules` seed. Tasks follow the scaffold — confirm.
- **tRPC vs REST:** the stack contract's glue declares `api_client: trpc`, but the spec's whole surface is REST under `/api`. Tasks build REST and leave the tRPC `users` router untouched; confirm no deploy-time check requires new features over tRPC.
- **K8s manifests:** spec Step 15 asks for `k8s/*.yaml`, but deployment is Colossus-managed via `.github/workflows/colossus-deploy.yml` (do not edit) plus `colossus.yaml`. No `k8s/` tasks emitted — confirm.
- **Role semantics:** spec clerk/manager map to `USER`/`MANAGER`, with `ADMIN` a superset. If `ADMIN` should *not* inherit manager write access, `RolesGuard` must change.
- **MinIO:** provisioned, but the spec describes no object-storage feature (no attachments or item photos). Only the admin-settings credential surface is built; no upload path is invented. Confirm whether item images or movement attachments were intended.
- **Seeded demo logins:** spec Step 10 wants `manager@demo`/`clerk@demo` with a known password, but the platform contract forbids demo logins (accounts come from `COLOSSUS_ACCOUNTS_JSON`). Fixtures seed inventory data only — confirm the e2e/smoke suites should use the platform-minted accounts.
- **"First signup becomes admin":** implemented as `MANAGER` when the `User` table is empty; since the Colossus seed always creates users first, in practice every real signup becomes `USER`. Confirm that is intended.
- **`/admin/settings` visibility:** the spec has no admin section; the screen exists because `postgresql` + `minio` are provisioned deployments. Confirm it should be `ADMIN`-only rather than also visible to `MANAGER`.
