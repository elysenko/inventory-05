# Test Specification

> **WARNING — `.pipeline/surface.json` is stale.** It still holds the scaffolder stub
> (`GET /api/health`, `GET /trpc/users.findAll`, `GET /trpc/users.findById`) and does **not**
> describe the StockRoom API surface. The authoritative endpoint list is the REST table in
> `.pipeline/tasks.md`, which reconciles the product spec against the scaffolded
> `backend/` + `frontend/` layout (**not** the `api/` + `web/` layout in the raw spec text).
> This document therefore covers **(a)** the 19 StockRoom REST endpoints from `tasks.md` and
> **(b)** the 2 legacy `/trpc/users.*` routes as *regression-only* cases, because `tasks.md`
> requires the tRPC router to stay wired and compiling. `service_agent` is tasked with
> regenerating `surface.json`; when that lands, re-verify coverage against it.
>
> **Binding deviations from the raw spec text** (all per `tasks.md`, all normative here):
> - Roles are `USER` / `MANAGER` / `ADMIN`. Spec "clerk" = `USER`, spec "manager" = `MANAGER`,
>   and **`ADMIN` inherits every `MANAGER` privilege**. Tests must assert that inheritance.
> - Validation is **zod**, hashing is **bcryptjs**, JWT is raw `@nestjs/jwt` (no passport),
>   Prisma is `^6.16` (not `7.10.0`), Angular is **19** (not 21).
> - There are **no** `manager@demo` / `clerk@demo` logins. Accounts are minted by Colossus into
>   `COLOSSUS_ACCOUNTS_JSON` and materialised by `backend/prisma/seed/seed.js` (do not edit).
> - There is **no `k8s/` directory** and no `api/`/`web/` directory to test.
> - The extra `/api/admin/settings` surface and `/admin/settings` screen exist because
>   `postgresql` + `minio` are provisioned; the raw spec is silent on them.

## Coverage summary
- Total cases: 316 (203 API e2e + 71 UI/journey + 21 data integrity + 13 frontend unit + 8 build/deploy gate)
- API endpoints covered: 21 / 21 (19 StockRoom REST from `tasks.md` + 2 legacy tRPC from `surface.json`; `surface.json`'s health row is the same handler as `GET /api/health` under the global `/api` prefix, so all 3 `surface.json` routes are covered)
- User journeys covered: 13

### Harness conventions (binding for the tester agent)
- **API e2e** lives in `backend/test/*.e2e-spec.ts` (Jest + supertest) against a throwaway
  Postgres with `npx prisma migrate deploy` applied. Suites create their **own** users directly
  through `PrismaService` (`email` + `bcryptjs.hash(pw, 10)` + explicit `role`) because
  `POST /api/auth/signup` can only ever mint `USER` once the table is non-empty. Suites must
  **not** invoke `prisma/seed/seed.js`.
- **Fixture isolation:** every suite namespaces its `@unique` columns (`SKU-ITM-001`,
  `LOC-ITM-A`) so parallel Jest workers never collide.
- Shorthand: `T(USER)`, `T(MANAGER)`, `T(ADMIN)` = a valid `Authorization: Bearer <jwt>` for
  that role. **"no token"** = the header is omitted entirely. **"bad token"** = a syntactically
  valid JWT signed with the wrong secret.
- **Field-scoped 400 body** means exactly
  `{ message: 'Validation failed', errors: [{ field: <name>, message: <string> }] }`.
- **Frontend unit** specs run under the Angular CLI test runner with `HttpClientTestingModule`
  and a stubbed `Router`; `COLOSSUS_PREVIEW` is `false` in every non-mockup build.
- **Journey/smoke** cases run against `docker compose up --build`, authenticate with the
  Colossus-minted accounts, and use the `angular_testability` wait strategy — **never**
  `networkidle`. Selectors are the `data-testid`s in `.pipeline/approved_landmarks.json`.

## API tests

### `POST /api/auth/signup`
- **Happy path**:
  - `API-SIGNUP-01` — `{name:'Ana', email:'ana@t.local', password:'Passw0rd!'}` on an **empty**
    `User` table → `201`, body `{accessToken: <non-empty string>, user:{id, email:'ana@t.local', role:'MANAGER'}}`.
    No `passwordHash` field anywhere in the response.
  - `API-SIGNUP-02` — same payload when the table already has ≥1 user → `201` with `user.role === 'USER'`.
  - `API-SIGNUP-03` — the returned `accessToken` is accepted by `GET /api/auth/me` (HS256, decodes to `{sub, email, role}`).
  - `API-SIGNUP-04` — the persisted `passwordHash` is a bcrypt hash (`$2[aby]$`), never the plaintext, and `bcryptjs.compare('Passw0rd!', hash)` is `true`.
- **Validation failures** (each → `400` field-scoped body):
  - `API-SIGNUP-05` — missing `email` → `errors[0].field === 'email'`.
  - `API-SIGNUP-06` — `email: 'not-an-email'` → `field === 'email'`.
  - `API-SIGNUP-07` — missing `password` → `field === 'password'`.
  - `API-SIGNUP-08` — `password: ''` → `field === 'password'`.
  - `API-SIGNUP-09` — duplicate email (signup twice with `dup@t.local`) → `400` field-scoped on `email` (Prisma `P2002` → filter), **not** `409`/`500`, and `user.count()` is unchanged.
  - `API-SIGNUP-10` — an unknown extra key (`{..., role:'ADMIN'}`) is **stripped**: response `user.role` is `USER`, never `ADMIN` (privilege escalation guard).
- **Auth failures**: n/a — route is `@Public()`.
  - `API-SIGNUP-11` — sending a valid `T(USER)` header does not change behaviour (still public, still `201`).
- **Idempotency / edge cases**:
  - `API-SIGNUP-12` — not idempotent by design: the second call with the same email is the `400` in `API-SIGNUP-09`, and exactly one `User` row exists.

### `POST /api/auth/login`
- **Happy path**:
  - `API-LOGIN-01` — correct credentials → `200`, `{accessToken, user:{id, email, role}}`; `user` carries no `passwordHash`.
  - `API-LOGIN-02` — a `MANAGER` login returns `user.role === 'MANAGER'`; an `ADMIN` login returns `'ADMIN'`.
  - `API-LOGIN-03` — the JWT payload is `{sub: user.id, email, role}` and `exp - iat === 43200` (12h).
- **Validation failures**:
  - `API-LOGIN-04` — missing `password` → `400` field-scoped on `password`.
  - `API-LOGIN-05` — `email: 123` (wrong type) → `400` field-scoped on `email`.
- **Auth failures**:
  - `API-LOGIN-06` — correct email, wrong password → `401`; body message must **not** reveal whether the email exists.
  - `API-LOGIN-07` — unknown email → `401` with the identical message and status as `API-LOGIN-06` (no user enumeration).
- **Idempotency / edge cases**:
  - `API-LOGIN-08` — two consecutive logins both succeed; the first token stays valid (no session invalidation).
  - `API-LOGIN-09` — email match is exact-cased as stored; `ANA@T.LOCAL` for `ana@t.local` returns `401` (documents behaviour rather than silently 500-ing).

### `GET /api/auth/me`
- **Happy path**:
  - `API-ME-01` — with `T(USER)` → `200`, `{id, email, role:'USER'}` matching the token subject.
  - `API-ME-02` — with `T(ADMIN)` → `role: 'ADMIN'`.
- **Validation failures**: n/a (no body/params).
- **Auth failures**:
  - `API-ME-03` — no token → `401`.
  - `API-ME-04` — bad token (wrong signing secret) → `401`.
  - `API-ME-05` — malformed header (`Authorization: abc123`, no `Bearer `) → `401`.
  - `API-ME-06` — an expired token (minted with `expiresIn: '-1s'`) → `401`.
- **Idempotency / edge cases**:
  - `API-ME-07` — response never includes `passwordHash`.
  - `API-ME-08` — if the user row is deleted after the token is minted, the call returns `401` (or `404`) — never a 500.

### `GET /api/items?q=&sort=`
- **Happy path**:
  - `API-ITEMS-LIST-01` — with `T(USER)` → `200`, an array of `{id, sku, name, unit, reorderAt, totalQty}`.
  - `API-ITEMS-LIST-02` — an item with stock rows `Zone A: 20`, `Zone B: 10` reports `totalQty === 30`.
  - `API-ITEMS-LIST-03` — an item with **no** `StockLevel` rows is **present** with `totalQty === 0` (never omitted, never `null`).
  - `API-ITEMS-LIST-04` — `?q=widget` returns only items whose sku or name matches; `?q=` (empty) returns all.
  - `API-ITEMS-LIST-05` — `?q=WIDGET` matches case-insensitively.
  - `API-ITEMS-LIST-06` — `?sort=sku` orders ascending by sku; `?sort=totalQty` orders by on-hand.
  - `API-ITEMS-LIST-07` — empty catalogue → `200` with `[]`, not `404`.
- **Validation failures**:
  - `API-ITEMS-LIST-08` — `?sort=<unknown-column>` → `400` field-scoped on `sort` (must not fall through to a raw Prisma error).
  - `API-ITEMS-LIST-09` — a `q` containing `%`, `_` and `'` returns `200` and does not error (no SQL/LIKE injection).
- **Auth failures**:
  - `API-ITEMS-LIST-10` — no token → `401`.
- **Idempotency / edge cases**:
  - `API-ITEMS-LIST-11` — the list is served by **one** `stockLevel.groupBy` merge, so N items produce a bounded query count (assert `totalQty` correctness for 8 seeded items in a single call).

### `GET /api/items/:id`
- **Happy path**:
  - `API-ITEM-GET-01` — with `T(USER)` → `200`, `{id, sku, name, description, unit, reorderAt, totalQty, stockLevels:[{locationId, qty, location:{id, name, zone}}]}`.
  - `API-ITEM-GET-02` — `totalQty === stockLevels.reduce((s,r) => s + r.qty, 0)` (the spec's "sum equals total" invariant).
  - `API-ITEM-GET-03` — an item with no stock rows → `stockLevels: []` and `totalQty: 0`.
- **Validation failures**:
  - `API-ITEM-GET-04` — a syntactically invalid id (`not-a-uuid`) → `400` or `404`, never `500`.
- **Auth failures**:
  - `API-ITEM-GET-05` — no token → `401`.
- **Idempotency / edge cases**:
  - `API-ITEM-GET-06` — an unknown but well-formed id → `404` (Prisma `P2025` → filter).
  - `API-ITEM-GET-07` — no `passwordHash` or user PII leaks through the nested includes.

### `POST /api/items`
- **Happy path**:
  - `API-ITEM-POST-01` — `T(MANAGER)` + `{sku:'SKU-ITM-001', name:'Widget', unit:'ea', reorderAt:10}` → `201` with the persisted row and `totalQty === 0`.
  - `API-ITEM-POST-02` — the same call with `T(ADMIN)` → `201` (ADMIN inherits MANAGER).
  - `API-ITEM-POST-03` — optional `description` round-trips; omitted `description` persists as `null`.
  - `API-ITEM-POST-04` — omitted `reorderAt` defaults to `0`.
- **Validation failures** (each → `400` field-scoped body):
  - `API-ITEM-POST-05` — `sku: ''` → `field === 'sku'`.
  - `API-ITEM-POST-06` — missing `name` → `field === 'name'`.
  - `API-ITEM-POST-07` — missing `unit` → `field === 'unit'`.
  - `API-ITEM-POST-08` — `reorderAt: -1` → `field === 'reorderAt'`.
  - `API-ITEM-POST-09` — `reorderAt: 1.5` (non-integer) → `field === 'reorderAt'`.
  - `API-ITEM-POST-10` — `reorderAt: '10'` as a string is either coerced to `10` **or** rejected `400`; it must never persist as a string.
  - `API-ITEM-POST-11` — **duplicate SKU**: `POST` `SKU-ITM-001` twice → second is `400` with `errors[0].field === 'sku'` and `message` mentioning uniqueness — **not 409, not 500** — **and `item.count()` is unchanged**.
- **Auth failures**:
  - `API-ITEM-POST-12` — no token → `401`.
  - `API-ITEM-POST-13` — `T(USER)` → `403`, and `item.count()` is unchanged.
- **Idempotency / edge cases**:
  - `API-ITEM-POST-14` — unknown body keys (`{..., totalQty: 999}`) are stripped; the computed `totalQty` stays `0`.

### `PATCH /api/items/:id`
- **Happy path**:
  - `API-ITEM-PATCH-01` — `T(MANAGER)` + `{name:'Widget Mk2'}` → `200`, only `name` changed; `sku` untouched.
  - `API-ITEM-PATCH-02` — `{reorderAt: 25}` → `200` and the item's low-stock classification is recomputed on the next report call.
  - `API-ITEM-PATCH-03` — with `T(ADMIN)` → `200`.
  - `API-ITEM-PATCH-04` — an empty body `{}` → `200` with the row unchanged (or a documented `400`), never a `500`.
- **Validation failures**:
  - `API-ITEM-PATCH-05` — `{reorderAt: -5}` → `400` field-scoped on `reorderAt`.
  - `API-ITEM-PATCH-06` — `{sku: ''}` → `400` field-scoped on `sku`.
  - `API-ITEM-PATCH-07` — changing `sku` to another item's existing sku → `400` field-scoped on `sku`, and neither row is modified.
- **Auth failures**:
  - `API-ITEM-PATCH-08` — no token → `401`.
  - `API-ITEM-PATCH-09` — `T(USER)` → `403` and the row is unchanged.
- **Idempotency / edge cases**:
  - `API-ITEM-PATCH-10` — unknown id → `404` (`P2025`).
  - `API-ITEM-PATCH-11` — applying the same PATCH twice yields the identical row (idempotent).

### `DELETE /api/items/:id`
- **Happy path**:
  - `API-ITEM-DEL-01` — `T(MANAGER)` deleting an item with **no** movements and **no** stock rows → `200`/`204`, and `GET /api/items/:id` then returns `404`.
  - `API-ITEM-DEL-02` — with `T(ADMIN)` → same result.
- **Validation failures**: n/a (path param only).
- **Auth failures**:
  - `API-ITEM-DEL-03` — no token → `401`.
  - `API-ITEM-DEL-04` — `T(USER)` → `403` and the item still exists.
- **Idempotency / edge cases**:
  - `API-ITEM-DEL-05` — deleting an item **referenced by a movement** → `409`; the item, its stock levels and every movement row still exist (audit log never orphaned).
  - `API-ITEM-DEL-06` — deleting an item with a **non-zero** stock level → `409`.
  - `API-ITEM-DEL-07` — unknown id → `404`.
  - `API-ITEM-DEL-08` — deleting the same id twice → first `200`/`204`, second `404` (not `500`).

### `GET /api/locations`
- **Happy path**:
  - `API-LOC-LIST-01` — `T(USER)` → `200` with `[{id, name, zone, createdAt}]` — clerks need this for the movement form.
  - `API-LOC-LIST-02` — the fixtures' `Zone A`/`Zone B`/`Zone C` are present with `zone` = `A`/`B`/`C`.
  - `API-LOC-LIST-03` — empty table → `[]`, not `404`.
- **Validation failures**: n/a.
- **Auth failures**:
  - `API-LOC-LIST-04` — no token → `401`.
- **Idempotency / edge cases**:
  - `API-LOC-LIST-05` — ordering is stable across two consecutive calls (so the movement-form selects don't reshuffle).

### `POST /api/locations`
- **Happy path**:
  - `API-LOC-POST-01` — `T(MANAGER)` + `{name:'LOC-ITM-D', zone:'D'}` → `201` with the persisted row.
  - `API-LOC-POST-02` — with `T(ADMIN)` → `201`.
- **Validation failures**:
  - `API-LOC-POST-03` — missing `name` → `400` field-scoped on `name`.
  - `API-LOC-POST-04` — `zone: ''` → `400` field-scoped on `zone`.
  - `API-LOC-POST-05` — **duplicate name** → `400` field-scoped on `name` (`P2002`), **not 409**, and `location.count()` is unchanged.
- **Auth failures**:
  - `API-LOC-POST-06` — no token → `401`.
  - `API-LOC-POST-07` — `T(USER)` → `403` and `location.count()` is unchanged.
- **Idempotency / edge cases**:
  - `API-LOC-POST-08` — a newly created location immediately appears in `GET /api/locations` for a `USER` token.

### `PATCH /api/locations/:id`
- **Happy path**:
  - `API-LOC-PATCH-01` — `T(MANAGER)` + `{zone:'E'}` → `200`, `name` untouched.
  - `API-LOC-PATCH-02` — renaming a location leaves its `StockLevel` rows and their quantities intact.
- **Validation failures**:
  - `API-LOC-PATCH-03` — renaming to an existing location's name → `400` field-scoped on `name`.
  - `API-LOC-PATCH-04` — `{zone: 42}` (wrong type) → `400` field-scoped on `zone`.
- **Auth failures**:
  - `API-LOC-PATCH-05` — no token → `401`; `T(USER)` → `403` with the row unchanged.
- **Idempotency / edge cases**:
  - `API-LOC-PATCH-06` — unknown id → `404`.

### `DELETE /api/locations/:id`
- **Happy path**:
  - `API-LOC-DEL-01` — `T(MANAGER)` deleting an unreferenced location with no stock rows → `200`/`204`; it disappears from `GET /api/locations`.
- **Validation failures**: n/a.
- **Auth failures**:
  - `API-LOC-DEL-02` — no token → `401`.
  - `API-LOC-DEL-03` — `T(USER)` → `403` and the location still exists.
- **Idempotency / edge cases**:
  - `API-LOC-DEL-04` — location referenced as a movement's `fromLoc` → `409`; movement rows intact.
  - `API-LOC-DEL-05` — location referenced as a movement's `toLoc` → `409` (both named relations are checked, not just one).
  - `API-LOC-DEL-06` — location holding a **non-zero** `StockLevel` → `409`.
  - `API-LOC-DEL-07` — location holding only **zero-qty** `StockLevel` rows and no movements → deletes successfully (or `409` — whichever, it must be consistent and never `500`).
  - `API-LOC-DEL-08` — unknown id → `404`.

### `POST /api/movements`
- **Happy path** (all with `T(USER)` unless noted — recording stock is a clerk action):
  - `API-MOV-POST-01` — `IN` 50 of item X into `Zone A` → `201`; `StockLevel(X, ZoneA).qty === 50`; a `Movement` row exists with `userId` = the caller.
  - `API-MOV-POST-02` — then `OUT` 20 from `Zone A` → `201`; level is `30`.
  - `API-MOV-POST-03` — then `TRANSFER` 10 `Zone A → Zone B` → `201`; `Zone A === 20`, `Zone B === 10`, **and item `totalQty` is unchanged at 30**.
  - `API-MOV-POST-04` — `IN` into a location with **no existing** `StockLevel` row creates one via upsert (qty = the moved amount).
  - `API-MOV-POST-05` — optional `note` round-trips; omitted `note` persists as `null`.
  - `API-MOV-POST-06` — `T(MANAGER)` and `T(ADMIN)` can also record movements → `201`.
- **Validation failures** (each → `400`, **no** `Movement` row created, **no** balance change):
  - `API-MOV-POST-07` — `IN` with a `fromLocId` supplied → `400` (IN rejects `fromLocId`).
  - `API-MOV-POST-08` — `IN` without `toLocId` → `400`.
  - `API-MOV-POST-09` — `OUT` without `fromLocId` → `400`.
  - `API-MOV-POST-10` — `TRANSFER` with only `fromLocId` → `400`.
  - `API-MOV-POST-11` — `TRANSFER` with `fromLocId === toLocId` → `400`.
  - `API-MOV-POST-12` — `qty: 0` → `400` field-scoped on `qty`.
  - `API-MOV-POST-13` — `qty: -5` → `400` field-scoped on `qty`.
  - `API-MOV-POST-14` — `qty: 2.5` (non-integer) → `400` field-scoped on `qty`.
  - `API-MOV-POST-15` — `type: 'SHIP'` (not in the enum) → `400` field-scoped on `type`.
  - `API-MOV-POST-16` — missing `itemId` → `400` field-scoped on `itemId`.
  - `API-MOV-POST-17` — unknown `itemId` → `404` (or `400`), and no partial `StockLevel` row is created.
  - `API-MOV-POST-18` — unknown `toLocId` → `404`/`400` with no stock mutation.
  - `API-MOV-POST-19` — **insufficient stock**: with `5` on hand at `Zone A`, `OUT` `10` → `400` with the message `Insufficient stock at source location`, **and the stored level is still exactly 5** (transactional rollback).
  - `API-MOV-POST-20` — `TRANSFER` of `10` from a source holding `5` → `400`, source still `5`, **destination unchanged** (the credit must roll back with the debit).
  - `API-MOV-POST-21` — `OUT` from a location where the item has **no** `StockLevel` row at all → `400` insufficient-stock, and no row is created.
  - `API-MOV-POST-22` — an `OUT` that would land exactly at zero (`5` on hand, `OUT 5`) **succeeds** → level `0` (the boundary is `>=`, not `>`).
  - `API-MOV-POST-23` — a body key `userId` supplied by the client is ignored; the persisted `Movement.userId` is the token subject, not the supplied value.
- **Auth failures**:
  - `API-MOV-POST-24` — no token → `401`, no movement created.
  - `API-MOV-POST-25` — bad token → `401`.
- **Idempotency / edge cases**:
  - `API-MOV-POST-26` — **concurrency:** fire two simultaneous `OUT 5` requests against a balance of `5`; exactly one returns `201` and one returns `400`, and the final level is `0` — never negative (proves the guarded `updateMany`, not read-then-write).
  - `API-MOV-POST-27` — movements are append-only: no endpoint exists to `PATCH`/`DELETE` `/api/movements/:id` (assert `404`/`405`).

### `GET /api/movements?itemId=&type=&from=&to=&page=&pageSize=`
- **Happy path**:
  - `API-MOV-LIST-01` — `T(MANAGER)` → `200`, `{data, total, page, pageSize}` with `pageSize` defaulting to `50` and `page` to `1`.
  - `API-MOV-LIST-02` — each row exposes the recording **user's email**, the **item** (sku + name), `type`, `qty`, `fromLoc`, `toLoc` and `createdAt`.
  - `API-MOV-LIST-03` — rows are ordered `createdAt` **descending** (newest first).
  - `API-MOV-LIST-04` — `T(ADMIN)` gets the same result as `T(MANAGER)`.
  - `API-MOV-LIST-05` — `?itemId=<X>` narrows to only item X's movements; `total` reflects the filtered count, not the global count.
  - `API-MOV-LIST-06` — `?type=TRANSFER` returns only transfers.
  - `API-MOV-LIST-07` — `?from=<ISO>&to=<ISO>` bracketing only the middle of three movements returns exactly that one (`createdAt: {gte, lte}`, inclusive bounds).
  - `API-MOV-LIST-08` — `?from` alone (open-ended upper bound) and `?to` alone both narrow correctly.
  - `API-MOV-LIST-09` — combined `?itemId=&type=&from=&to=` filters compose (AND, not OR).
  - `API-MOV-LIST-10` — `?page=2&pageSize=2` over 5 rows returns rows 3–4 with `total: 5, page: 2, pageSize: 2`; no row appears on two pages.
  - `API-MOV-LIST-11` — a page beyond the end → `200` with `data: []` and the correct `total`.
- **Validation failures**:
  - `API-MOV-LIST-12` — `?from=notadate` → `400` field-scoped on `from`.
  - `API-MOV-LIST-13` — `?type=BOGUS` → `400` field-scoped on `type`.
  - `API-MOV-LIST-14` — `?page=0` or `?page=-1` → `400` field-scoped on `page`.
  - `API-MOV-LIST-15` — `?pageSize=100000` → `400` or a clamped max; it must not attempt an unbounded fetch.
- **Auth failures**:
  - `API-MOV-LIST-16` — no token → `401`.
  - `API-MOV-LIST-17` — `T(USER)` → `403` (a clerk may record movements but not read the audit log).
- **Idempotency / edge cases**:
  - `API-MOV-LIST-18` — no rows match the filter → `200` with `{data: [], total: 0, ...}`, not `404`.
  - `API-MOV-LIST-19` — the `user` include is `{select:{email:true}}` only — no `passwordHash`, `id` leakage beyond what's needed, and no `role`.

### `GET /api/reports/low-stock`
- **Happy path**:
  - `API-LOW-01` — `T(MANAGER)` → `200` with an array of `{id, sku, name, unit, reorderAt, totalQty}`.
  - `API-LOW-02` — item with `reorderAt: 10` and `12` on hand → **absent**; after `OUT 5` (→ `7`) → **present**.
  - `API-LOW-03` — item with `reorderAt: 10` and `40` on hand → **absent**.
  - `API-LOW-04` — **boundary**: `reorderAt: 10`, exactly `10` on hand → **present** (`totalQty <= reorderAt`, inclusive).
  - `API-LOW-05` — an item with **no `StockLevel` rows at all** (`totalQty` 0) and `reorderAt: 0` → **present** (missing sums map to `0`, not absent).
  - `API-LOW-06` — rows are ordered by `totalQty - reorderAt` **ascending** (worst shortfall first); assert the explicit ordering of three items with shortfalls `-8`, `-3`, `0`.
  - `API-LOW-07` — `T(ADMIN)` gets the same result.
  - `API-LOW-08` — nothing below threshold → `200` with `[]`.
- **Validation failures**: n/a (no params).
- **Auth failures**:
  - `API-LOW-09` — no token → `401`.
  - `API-LOW-10` — `T(USER)` → `403`.
- **Idempotency / edge cases**:
  - `API-LOW-11` — the report reflects a movement immediately: `OUT` that crosses the threshold, then re-fetch → the item is now listed within the same test.
  - `API-LOW-12` — an item's `totalQty` here equals its `totalQty` in `GET /api/items` (one source of truth).

### `GET /api/admin/settings`
- **Happy path**:
  - `API-SET-GET-01` — `T(ADMIN)` → `200` listing the known service keys: **postgresql** (`DATABASE_URL`) and **minio** (`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`).
  - `API-SET-GET-02` — every entry carries a `configured: boolean` and a **masked** value.
  - `API-SET-GET-03` — masking is real: the response body contains **no** substring of the actual secret (assert the raw `MINIO_SECRET_KEY` value does not appear anywhere in the serialised body).
  - `API-SET-GET-04` — a key whose env value is `PLACEHOLDER_CONFIGURE_IN_SETTINGS` and has no `SystemSetting` row reports `configured: false`.
  - `API-SET-GET-05` — a key with neither env nor `SystemSetting` reports `configured: false` and a null/empty masked value.
- **Validation failures**: n/a.
- **Auth failures**:
  - `API-SET-GET-06` — no token → `401`.
  - `API-SET-GET-07` — `T(USER)` → `403`.
  - `API-SET-GET-08` — **`T(MANAGER)` → `403`** (this endpoint is the one place ADMIN does *not* share with MANAGER).
- **Idempotency / edge cases**:
  - `API-SET-GET-09` — with no `SystemSetting` rows at all the call still returns the full key list (rows are described, not discovered).

### `PATCH /api/admin/settings`
- **Happy path**:
  - `API-SET-PATCH-01` — `T(ADMIN)` + `[{key:'MINIO_BUCKET', value:'stockroom'}]` → `200`; a `SystemSetting` row is upserted and `updatedAt` is set.
  - `API-SET-PATCH-02` — a subsequent `GET` reports that key `configured: true` with a masked value.
  - `API-SET-PATCH-03` — patching multiple pairs in one call upserts all of them.
- **Validation failures**:
  - `API-SET-PATCH-04` — a pair missing `value` → `400` field-scoped.
  - `API-SET-PATCH-05` — an unknown/unlisted key → `400` (the allow-list is enforced; arbitrary `SystemSetting` writes are not permitted).
  - `API-SET-PATCH-06` — a non-array body → `400`.
- **Auth failures**:
  - `API-SET-PATCH-07` — no token → `401`; `T(USER)` → `403`; `T(MANAGER)` → `403`, and no `SystemSetting` row is written in any of the three.
- **Idempotency / edge cases**:
  - `API-SET-PATCH-08` — patching the same key twice **upserts** (one row, updated value), never a duplicate-key `500`.
  - `API-SET-PATCH-09` — `resolveConfig(key)` prefers `process.env[key]`; with the env unset it falls back to the `SystemSetting` row; with the env equal to `PLACEHOLDER_CONFIGURE_IN_SETTINGS` it **also** falls back; with neither it returns `null`.
  - `API-SET-PATCH-10` — an endpoint depending on an unconfigured service surfaces `ServiceUnconfiguredError` as **503**, not `500`.

### `GET /api/health`
- **Happy path**:
  - `API-HEALTH-01` — no token → `200` `{status:'ok'}`.
  - `API-HEALTH-02` — the handler performs **no** database work (still `200` with the DB stopped).
- **Validation failures**: n/a.
- **Auth failures**: n/a — `@Public()`.
  - `API-HEALTH-03` — supplying a bad token does not turn it into a `401`.
- **Idempotency / edge cases**:
  - `API-HEALTH-04` — reachable at the `/api` prefix (this is the row `surface.json` lists as `GET /api/health`), and used as the K8s/Compose **liveness** probe.

### `GET /api/health/deep`
- **Happy path**:
  - `API-DEEP-01` — no token, DB up → `200` (executes `SELECT 1` via `$queryRaw`).
- **Validation failures**: n/a.
- **Auth failures**: n/a — `@Public()`.
- **Idempotency / edge cases**:
  - `API-DEEP-02` — DB unreachable → **`503`**, not `500` and not `200` (this is the readiness probe; a false `200` would route traffic to a broken pod).
  - `API-DEEP-03` — the failure body does not leak the `DATABASE_URL` or credentials.

### `GET /trpc/users.findAll` *(legacy `surface.json` — regression only)*
- **Happy path**:
  - `API-TRPC-01` — the route still answers (`200`) after the StockRoom modules are wired into `AppModule`; `TrpcAppModule`/`UsersModule` remain registered.
- **Validation failures**: n/a — no StockRoom feature is built on tRPC.
- **Auth failures**:
  - `API-TRPC-02` — documents the current behaviour (the global `JwtAuthGuard` may or may not cover the tRPC adapter); whichever it is, it must be deterministic and must not `500`.
- **Idempotency / edge cases**:
  - `API-TRPC-03` — `backend` still compiles (`npx tsc --noEmit`) with the tRPC router present.

### `GET /trpc/users.findById` *(legacy `surface.json` — regression only)*
- **Happy path**:
  - `API-TRPC-04` — the route still answers for a known user id.
- **Validation failures**:
  - `API-TRPC-05` — a missing/invalid id yields the router's existing error shape, not a `500`.
- **Auth failures**: same as `API-TRPC-02`.
- **Idempotency / edge cases**:
  - `API-TRPC-06` — no StockRoom entity is exposed over tRPC (assert the router surface has not grown).

### Cross-cutting auth matrix
- `API-AUTHZ-01` — **no token → 401** on every one of: `GET /api/auth/me`, `GET /api/items`,
  `GET /api/items/:id`, `POST/PATCH/DELETE /api/items`, `GET /api/locations`,
  `POST/PATCH/DELETE /api/locations`, `POST /api/movements`, `GET /api/movements`,
  `GET /api/reports/low-stock`, `GET|PATCH /api/admin/settings` (table-driven, 15 assertions).
- `API-AUTHZ-02` — **`T(USER)` → 403** on `POST/PATCH/DELETE /api/items`,
  `POST/PATCH/DELETE /api/locations`, `GET /api/movements`, `GET /api/reports/low-stock`,
  `GET|PATCH /api/admin/settings` (10 assertions).
- `API-AUTHZ-03` — **`T(MANAGER)` → 200** on every MANAGER-gated route **and → 403** on both
  `/api/admin/settings` verbs.
- `API-AUTHZ-04` — **`T(ADMIN)` → 200** on every MANAGER-gated route (inheritance) **and** on
  both `/api/admin/settings` verbs.
- `API-AUTHZ-05` — **guard order**: an unauthenticated request to a MANAGER-only route returns
  `401` (not `403`) — `JwtAuthGuard` runs before `RolesGuard`.
- `API-AUTHZ-06` — the public routes (`/api/health`, `/api/health/deep`, `/api/auth/login`,
  `/api/auth/signup`) answer with no token; **no other** route does.

## UI / journey tests

### Journey: Unauthenticated landing & smoke oracle
- **Steps**: Cold-load `/` with an empty `localStorage`.
- **Expected outcomes**: redirects to `/login`; `[data-testid="app-ready"]` is present;
  `[data-testid="app-header"]` and `[data-testid="app-brand"]` render and the page text
  contains the literal **`StockRoom`** (`.colossus-acceptance.json` `expect_text`);
  `[data-testid="login-card"]` is visible. `UI-SMOKE-01`.
- **Negative path**: `UI-SMOKE-02` — the page must contain **none** of the reject signatures
  `home-title">Users<`, a bare `Loading...`, or `Failed to load users.` after the app is ready.
  `UI-SMOKE-03` — with the backend deliberately down, `/` still renders `StockRoom` and an
  error state, never a blank body (the brand lives in the shell, not in a data-fed view).

### Journey: Login
- **Steps**: At `/login`, type into `[data-testid="login-email"]` and `login-password`, click
  `[data-testid="login-submit"]`.
- **Expected outcomes**: `UI-LOGIN-01` — valid `USER` credentials navigate to `/items`,
  `[data-testid="current-user"]` shows the signed-in email, `[data-testid="logout"]` is visible,
  and the JWT is in `localStorage`. `UI-LOGIN-02` — deep-linking `/reports/low-stock` while
  logged out lands on `/login?returnUrl=%2Freports%2Flow-stock`, and a successful `MANAGER`
  login lands on `/reports/low-stock`, **not** `/items`. `UI-LOGIN-03` — `[data-testid="link-signup"]`
  navigates to `/signup`.
- **Negative path**: `UI-LOGIN-04` — wrong password renders the API message in
  `[data-testid="login-error"]` and stays on `/login` with no token stored.
  `UI-LOGIN-05` — submitting an empty form shows a validation message and issues no HTTP call.
  `UI-LOGIN-06` — **no preview bypass**: in a production build, typing `admin@anything` and
  submitting must call `POST /api/auth/login` and fail on bad credentials — it must not mint a
  local `ADMIN` session (`COLOSSUS_PREVIEW` is `false`, `inferRole` is dead code).

### Journey: Signup
- **Steps**: `/signup` → fill `signup-name`, `signup-email`, `signup-password`, `signup-confirm`
  → `signup-submit`.
- **Expected outcomes**: `UI-SIGNUP-01` — a valid new account signs in and lands on `/items`
  with role `USER` (the Colossus seed has already populated the table).
  `UI-SIGNUP-02` — `[data-testid="link-login"]` returns to `/login`.
- **Negative path**: `UI-SIGNUP-03` — mismatched password/confirm blocks submit with an inline
  message and no HTTP call. `UI-SIGNUP-04` — a duplicate email renders the API's field-scoped
  400 in `[data-testid="signup-error"]`.

### Journey: Browse the item catalogue
- **Steps**: Signed in as `USER`, go to `/items`; type in `[data-testid="items-search"]`;
  change the sort control; click a row.
- **Expected outcomes**: `UI-ITEMS-01` — `[data-testid="items-table"]` shows columns
  sku / name / unit / reorderAt / totalQty, one `[data-testid^="item-row-"]` per item.
  `UI-ITEMS-02` — typing `widget` updates the URL to `/items?q=widget` (via
  `queryParamsHandling: 'merge'`) and filters the rows; a **hard refresh** of that URL restores
  both the input value and the filtered result. `UI-ITEMS-03` — sorting updates `?sort=` and
  survives a refresh, preserving `?q` alongside it. `UI-ITEMS-04` — rows at or below `reorderAt`
  carry the low-stock visual flag. `UI-ITEMS-05` — clicking a row navigates to `/items/<id>`.
  `UI-ITEMS-06` — as `USER`, `[data-testid="new-item-button"]` is **not** rendered; as
  `MANAGER`/`ADMIN` it is.
- **Negative path**: `UI-ITEMS-07` — an empty catalogue shows `[data-testid="items-empty"]`;
  a failing API shows `[data-testid="items-error"]` (a StockRoom-specific message, never
  `Failed to load users.`); while in flight, `[data-testid="items-loading"]` shows and the
  page never renders a bare `Loading...` string.

### Journey: Create and edit an item (manager)
- **Steps**: As `MANAGER` at `/items`, click `new-item-button`; fill `item-sku`, `item-name`,
  `item-unit`, `item-reorder`, `item-description`; click `item-save`.
- **Expected outcomes**: `UI-ITEM-FORM-01` — the click sets `?modal=new-item` and
  `[data-testid="item-form-modal"]` opens; a **hard refresh** of `/items?modal=new-item`
  reopens the modal from the URL. `UI-ITEM-FORM-02` — saving closes the modal, clears
  `?modal`, and the new SKU appears in the table without a manual reload.
  `UI-ITEM-FORM-03` — from `/items/:id`, `[data-testid="edit-item-button"]` sets
  `?modal=edit-item` with the fields prefilled; saving updates the detail header in place.
- **Negative path**: `UI-ITEM-FORM-04` — saving a **duplicate SKU** renders the API's
  field-scoped 400 in `[data-testid="item-sku-error"]`, keeps the modal open, and preserves the
  typed values. `UI-ITEM-FORM-05` — `reorderAt: -1` is rejected inline before submit.

### Journey: Item detail — stock breakdown and history
- **Steps**: Open `/items/<id>`; toggle `[data-testid="tab-stock"]` / `[data-testid="tab-movements"]`.
- **Expected outcomes**: `UI-DETAIL-01` — `[data-testid="item-summary"]` shows sku, name, unit,
  reorderAt and total on hand. `UI-DETAIL-02` — `?tab=stock` renders
  `[data-testid="stock-table"]` with one `[data-testid^="stock-row-"]` per location and a
  `[data-testid="stock-total-row"]` whose value **equals the sum of the visible rows** and
  equals the item's `totalQty` on `/items`. `UI-DETAIL-03` — `?tab=movements` renders
  `[data-testid="item-movements-table"]` scoped to this item only. `UI-DETAIL-04` — the tab is
  URL-addressable: a hard refresh of `/items/<id>?tab=movements` opens the movements tab
  directly (proves the nginx SPA fallback plus query restore). `UI-DETAIL-05` — an item at or
  below threshold shows `[data-testid="item-low-banner"]`. `UI-DETAIL-06` —
  `[data-testid="record-movement-button"]` navigates to `/movements/new?itemId=<id>` with the
  item preselected.
- **Negative path**: `UI-DETAIL-07` — an item with no stock rows shows
  `[data-testid="stock-empty"]` and a total of `0`; no movements shows
  `[data-testid="item-movements-empty"]`. `UI-DETAIL-08` — an unknown id shows
  `[data-testid="item-detail-error"]`, not a blank page or an infinite
  `[data-testid="item-detail-loading"]`.

### Journey: Manage locations
- **Steps**: `/locations` as `MANAGER`; `new-location-button` → fill `location-name`,
  `location-zone` → `location-save`; then an `[data-testid^="edit-location-"]` row action;
  then a `[data-testid^="delete-location-"]` action.
- **Expected outcomes**: `UI-LOC-01` — `[data-testid="locations-table"]` lists name/zone with
  one `[data-testid^="location-row-"]` each. `UI-LOC-02` — create sets `?modal=new-location`;
  edit sets `?modal=edit-location&id=<id>` and prefills; both restore on a hard refresh.
  `UI-LOC-03` — as `USER` the create/edit/delete controls are absent but the list is readable.
- **Negative path**: `UI-LOC-04` — a duplicate name renders the field-scoped 400 in
  `[data-testid="location-name-error"]` with the modal still open. `UI-LOC-05` — deleting a
  location that is referenced by a movement surfaces the **409** as a readable message in
  `[data-testid="locations-notice"]` (or `locations-error`) and the row remains in the table.
  `UI-LOC-06` — empty/loading/error states render `locations-empty` / `locations-loading` /
  `locations-error` respectively.

### Journey: Record a stock movement
- **Steps**: `/movements/new` as `USER`; pick `movement-item`, choose a type in
  `movement-type`, set `movement-from` / `movement-to`, `movement-qty`, `movement-note`;
  click `movement-submit`.
- **Expected outcomes**: `UI-MOV-01` — deep-linking `/movements/new?itemId=<id>&type=OUT`
  preselects both the item and the type. `UI-MOV-02` — selecting `IN` shows only the **to**
  select; `OUT` shows only **from**; `TRANSFER` shows both (conditional rendering by type).
  `UI-MOV-03` — a successful `IN 50` shows `[data-testid="movement-success"]`, and the item's
  detail page then shows the new balance and a new history row.
  `UI-MOV-04` — a `TRANSFER` A→B leaves the item's total unchanged on `/items`.
- **Negative path**: `UI-MOV-05` — an `OUT` exceeding on-hand renders the API's exact message
  **`Insufficient stock at source location`** inline in `[data-testid="movement-error"]`, the
  form keeps its values, and the balance shown on the item detail page is unchanged.
  `UI-MOV-06` — `qty: 0` is blocked inline. `UI-MOV-07` — a `TRANSFER` with the same from and
  to location is blocked (client-side or via the rendered 400).

### Journey: Movement audit log (manager)
- **Steps**: `/movements` as `MANAGER`; set `filter-item`, `filter-type`, `filter-from`,
  `filter-to`; page via `movements-pager`; then `clear-filters`.
- **Expected outcomes**: `UI-AUDIT-01` — `[data-testid="movements-table"]` shows
  who / item / type / qty / from → to / timestamp, one `[data-testid^="movement-row-"]` each,
  newest first. `UI-AUDIT-02` — each filter writes to the URL
  (`/movements?itemId=…&type=…&from=…&to=…`) and a **hard refresh** restores both the filter
  controls and the narrowed result set. `UI-AUDIT-03` — pagination writes `?page=2` and the
  refreshed page shows the same rows. `UI-AUDIT-04` — `clear-filters` strips the query params
  and restores the full list.
- **Negative path**: `UI-AUDIT-05` — a filter combination with no matches shows
  `[data-testid="movements-empty"]`, not an error. `UI-AUDIT-06` — a `USER` navigating to
  `/movements` is sent to `/403` and never sees `movements-table`.

### Journey: Low-stock report (manager)
- **Steps**: `/reports/low-stock` as `MANAGER`.
- **Expected outcomes**: `UI-LOW-01` — `[data-testid="low-stock-table"]` shows sku, name,
  on-hand, reorderAt and **shortfall**, one `[data-testid^="low-stock-row-"]` each, worst
  shortfall first. `UI-LOW-02` — an item pushed below threshold by a movement recorded in the
  Record-a-movement journey appears here on the next load. `UI-LOW-03` — an item with zero
  stock rows appears with on-hand `0`.
- **Negative path**: `UI-LOW-04` — nothing below threshold shows
  `[data-testid="low-stock-empty"]`; an API failure shows `[data-testid="low-stock-error"]`.
  `UI-LOW-05` — a `USER` at `/reports/low-stock` is sent to `/403`.

### Journey: Admin settings (admin only)
- **Steps**: `/admin/settings` as `ADMIN`; edit a credential field in
  `[data-testid="settings-list"]` and save.
- **Expected outcomes**: `UI-SET-01` — one `[data-testid^="service-card-"]` per provisioned
  service (**postgresql**, **minio**) with a `[data-testid^="status-"]` configured/unconfigured
  badge and **masked** current values. `UI-SET-02` — saving `PATCH`es `/api/admin/settings`,
  shows `[data-testid="settings-success"]`, and the badge flips to configured.
  `UI-SET-03` — a banner lists every service reported `configured: false`
  ("The following need credentials to activate: …") and disappears once all are configured.
- **Negative path**: `UI-SET-04` — a failing PATCH renders `[data-testid="settings-error"]`
  and leaves the form values intact. `UI-SET-05` — a `MANAGER` navigating to `/admin/settings`
  is sent to `/403`; the nav link is not rendered for non-admins.

### Journey: Role gating, 403 and logout
- **Steps**: Sign in as `USER`; attempt `/movements`, `/reports/low-stock`, `/admin/settings`;
  then click `[data-testid="logout"]`.
- **Expected outcomes**: `UI-ROLE-01` — each blocked route lands on `/403` showing
  `[data-testid="forbidden-page"]`, and `[data-testid="back-to-items"]` returns to `/items`.
  `UI-ROLE-02` — the shell's nav hides manager links for `USER` and admin links for
  `MANAGER` (`auth.isManager()` / `auth.isAdmin()`); `[data-testid="nav-toggle"]` reveals
  `[data-testid="mobile-nav"]` at a narrow viewport. `UI-ROLE-03` — logout clears the token and
  user from `localStorage` and navigates to `/login`; pressing Back does not restore an
  authenticated view. `UI-ROLE-04` — with an **expired/invalid** token in `localStorage`, the
  first API call's `401` clears state and redirects to `/login?returnUrl=<current>`.
- **Negative path**: `UI-ROLE-05` — `[data-testid="preview-role"]` (the preview role switcher)
  is **absent** from a production build; no client-side control can escalate role.

### Journey: Deep links and SPA fallback
- **Steps**: With the app served by nginx, hard-refresh (full page load, not router navigation)
  each route in the SPA-routes table: `/login`, `/signup`, `/items`, `/items/<id>`,
  `/locations`, `/movements/new`, `/movements`, `/reports/low-stock`, `/admin/settings`, `/403`.
- **Expected outcomes**: `UI-DEEP-01` — every one returns HTTP `200` with the app shell
  (`try_files $uri $uri/ /index.html`), reaching `[data-testid="app-ready"]`, and lands on the
  intended screen for a suitably-privileged session. `UI-DEEP-02` — an unknown path
  (`/nope/deep/link`) redirects to `/items` via the `**` route (after auth), never a 404 page.
  `UI-DEEP-03` — `[data-testid="fab-new-movement"]` navigates to `/movements/new` from any
  authenticated route.
- **Negative path**: `UI-DEEP-04` — a hard refresh of `/items/<id>` must **not** return an
  nginx 404/403 — the classic symptom of a missing SPA fallback or a wrong Dockerfile `COPY`
  of the Angular output directory.

## Data integrity tests
- `DATA-01` — After any accepted `IN`, `item.totalQty` (as reported by `GET /api/items`) equals
  the sum of that item's `StockLevel.qty`, and equals the sum of the `/api/items/:id`
  breakdown rows.
- `DATA-02` — After any accepted `OUT`, the same three-way equality holds and the source level
  decreased by exactly `qty`.
- `DATA-03` — After any accepted `TRANSFER`, the source decreased by `qty`, the destination
  increased by `qty`, and the item's **total is unchanged** (transfers conserve quantity).
- `DATA-04` — **No `StockLevel.qty` is ever negative.** Assert `stockLevel.count({where:{qty:{lt:0}}}) === 0`
  at the end of every movements suite, including after the concurrency case `API-MOV-POST-26`.
- `DATA-05` — A rejected movement (validation, insufficient stock, unknown item/location)
  creates **zero** `Movement` rows and leaves every `StockLevel` byte-identical — verified by
  snapshotting all levels before and after.
- `DATA-06` — `Movement` rows are append-only: no code path updates or deletes one; a movement's
  `qty`, `type` and `createdAt` are immutable after creation.
- `DATA-07` — Every `Movement` has a non-null `userId` resolving to a real `User`, and it is the
  authenticated caller — never a client-supplied value.
- `DATA-08` — Movement shape invariants in the database: `type='IN'` rows have
  `fromLocId IS NULL` and `toLocId NOT NULL`; `type='OUT'` rows have `toLocId IS NULL` and
  `fromLocId NOT NULL`; `type='TRANSFER'` rows have both non-null and different.
- `DATA-09` — `qty >= 1` on every persisted `Movement` row.
- `DATA-10` — `@@unique([itemId, locationId])` on `StockLevel` holds: repeated `IN`s into the
  same item+location increment one row rather than creating duplicates.
- `DATA-11` — `Item.sku` and `Location.name` uniqueness is enforced at the **database** level
  (a direct Prisma `create` of a duplicate throws `P2002`), not merely in zod.
- `DATA-12` — FK `onDelete: Restrict` holds: a direct Prisma delete of an item or location
  referenced by a `Movement` or `StockLevel` throws `P2003`/`P2014` rather than cascading.
- `DATA-13` — Deleting an item that *is* deletable also removes its zero-qty `StockLevel` rows,
  leaving no orphaned stock rows (`stockLevel` rows always resolve to a live item and location).
- `DATA-14` — `User.passwordHash` is always a bcrypt hash and never appears in any API response
  body (grep the serialised body of every 2xx response in the suites for `$2a$`/`$2b$`).
- `DATA-15` — **Seed idempotency:** running `node prisma/seed/seed.js` twice leaves
  `user.count()` and `colossusAccount.count()` unchanged and re-asserts the same emails.
- `DATA-16` — **Fixture idempotency:** running `node prisma/seed/fixtures.js` twice leaves
  `item.count()`, `location.count()` and every `StockLevel.qty` unchanged (upsert-only; a
  `create`-based fixture would crash-loop the pod on restart).
- `DATA-17` — Fixtures satisfy their contract: exactly the locations `Zone A`/`Zone B`/`Zone C`
  with `zone` `A`/`B`/`C`, 8 items with varied `reorderAt`, **at least one** item at or below
  its threshold, **several** comfortably above, and **at least one** item with no stock rows.
- `DATA-18` — Fixtures create **no** users and no `manager@demo`/`clerk@demo` rows; every
  `User` originates from `COLOSSUS_ACCOUNTS_JSON`.
- `DATA-19` — `SystemSetting` is keyed by `key` (primary key): a second `PATCH` of the same key
  updates one row and bumps `updatedAt`.
- `DATA-20` — The migration in `backend/prisma/migrations/**` applies cleanly to an empty
  database via `prisma migrate deploy`, and `prisma migrate status` reports no drift against
  `schema.prisma`.
- `DATA-21` — The scaffolded `User`, `Role` and `ColossusAccount` models are unmodified by the
  StockRoom migration (diff the model blocks against the scaffold).

## Frontend unit tests
- `FE-01` — `authGuard` with no session returns a `UrlTree` to `/login` carrying
  `queryParams.returnUrl === state.url`.
- `FE-02` — `authGuard` with any authenticated role returns `true`.
- `FE-03` — `managerGuard` sends a `USER` to `/403`.
- `FE-04` — `managerGuard` allows `MANAGER` **and** `ADMIN` (inheritance).
- `FE-05` — `adminGuard` sends a `MANAGER` to `/403` and allows `ADMIN`.
- `FE-06` — Guards redirect **at most once** and never bounce off `/login` (no redirect loop /
  blank page) — assert an unauthenticated hit on `/login` itself is not re-redirected.
- `FE-07` — `authInterceptor` attaches `Authorization: Bearer <token>` when a token exists.
- `FE-08` — `authInterceptor` sends **no** `Authorization` header when the token is `null`.
- `FE-09` — On a `401` response the interceptor clears `localStorage` token+user and navigates
  to `/login?returnUrl=<current url>`.
- `FE-10` — On a `403` response the interceptor routes to `/403` and does **not** clear the session.
- `FE-11` — `AuthService.login()` posts `{email, password}` to `/api/auth/login` and stores
  `res.accessToken` + `res.user`; `signup()` posts `{name, email, password}` to `/api/auth/signup`.
- `FE-12` — `AuthService` hydrates `user`/`token` from `localStorage` on construction and
  **clears both** when the stored user shape is unrecognised (defensive restore, never throws).
- `FE-13` — `ApiService` is the only class injecting `HttpClient` for the domain API; its
  methods hit the documented `/api/...` paths with the documented query params, and errors are
  normalised to `ApiError { status, message, errors? }` so components can render field-scoped
  400s without touching `HttpErrorResponse`.

## Build / deploy gate
- `BUILD-01` — `cd backend && npx prisma generate && npx tsc --noEmit` exits 0.
- `BUILD-02` — `cd backend && npm test -- --maxWorkers=2` is green.
- `BUILD-03` — `cd frontend && npx ng build --configuration production` exits 0 **and** the
  emitted directory matches `colossus.yaml`'s `outputDir` (`dist/frontend/browser`) — assert by
  listing the directory and finding `index.html` there. This is the highest-risk deploy break.
- `BUILD-04` — `frontend/Dockerfile`'s `COPY --from=build` source path, `angular.json`'s
  `outputPath`, and `colossus.yaml`'s `outputDir` all agree.
- `BUILD-05` — **No new npm dependencies**: `git diff` of `backend/package.json` and
  `frontend/package.json` shows no added entry in `dependencies`/`devDependencies` (dependency
  drift disables the prebaked `node_modules` seed).
- `BUILD-06` — `frontend/nginx.conf` contains `try_files $uri $uri/ /index.html;` and its
  `/api/` `proxy_pass` port matches the backend's actual listening port (see the open question
  on `colossus.yaml` `backend.port: 3001` vs `main.ts` default `3000`); `proxy.conf.json` agrees
  for dev.
- `BUILD-07` — `docker compose up --build` reaches a healthy state; `curl /api/health/deep`
  returns `200` and `curl /api/docs` still answers (the backend probe path).
- `BUILD-08` — **File budget:** every file listed in `.pipeline/surface.json` `components` is
  ≤ 400 lines (soft) and none exceeds 500 (hard); `data-testid="app-ready"` appears **only** in
  `frontend/src/app/app.component.ts`.

## Out of scope
- **`k8s/*.yaml` manifests** (spec Step 15) — no `k8s/` directory exists; deployment is
  Colossus-managed via `.github/workflows/colossus-deploy.yml` (do not edit) plus `colossus.yaml`.
- **`api/` and `web/` directory layouts, Angular 21, Prisma `7.10.0`, `bcrypt`,
  `class-validator`, `passport-jwt`** (spec Steps 1–15) — superseded by the scaffold per
  `tasks.md`; testing them would test code that must not exist.
- **`manager@demo` / `clerk@demo` seeded logins with the password `Demo1234!`** — the platform
  contract forbids demo logins; credentials come from `COLOSSUS_ACCOUNTS_JSON`.
- **MinIO object-storage behaviour** (uploads, item photos, movement attachments) — the service
  is provisioned but the spec describes no feature using it. Only the admin *credential*
  surface is tested.
- **New tRPC procedures** — no StockRoom feature is built on tRPC; the existing `users` router
  is covered as regression only, and its internal behaviour is out of scope.
- **Token refresh / server-side logout / session revocation** — the spec defines logout as a
  client-side token discard; there is no refresh endpoint to test.
- **Password reset, email verification, account lockout, rate limiting** — the spec is silent
  on all of them.
- **Movement edit/delete and stock adjustments outside `IN`/`OUT`/`TRANSFER`** — the audit log
  is append-only by design; no such endpoint exists.
- **Multi-tenancy, per-location permissions, and item-level ACLs** — the spec's authorisation
  model is role-global.
- **Accessibility (WCAG), i18n, print styles, and visual regression** — not specified.
- **Load/performance thresholds** — beyond the single `groupBy` merge asserted in
  `API-ITEMS-LIST-11`, no latency or throughput targets are specified.
