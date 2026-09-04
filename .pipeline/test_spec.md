# Test Specification

> **WARNING — stale `surface.json`.** `.pipeline/surface.json` is still the scaffolder-generated
> stub (`GET /health`, `GET /trpc/users.findAll`, `GET /trpc/users.findById`, `app-home` /
> `home-title` test-ids). It does **not** describe the StockRoom surface. The authoritative
> endpoint list for this spec is the REST table in `.pipeline/tasks.md`, which reconciles the
> product spec against the scaffolded `backend/` + `frontend/` layout (NOT the `api/` + `web/`
> layout named in the raw spec text). This document therefore covers:
> 1. all 19 StockRoom REST endpoints from `.pipeline/tasks.md`, **and**
> 2. the 3 legacy `surface.json` routes, as *regression* cases only — `tasks.md` requires the
>    tRPC `users` router to stay wired and compiling, so it must not break.
> `service_agent` is tasked with regenerating `surface.json`; when that lands, this file's
> endpoint coverage should be re-verified against it (the 19 REST rows are expected to match).
>
> **Other binding deviations from the raw spec text** (all per `tasks.md`):
> roles are `USER` / `MANAGER` / `ADMIN` (spec "clerk" = `USER`, spec "manager" = `MANAGER`,
> `ADMIN` inherits every `MANAGER` privilege); validation is **zod**, hashing is **bcryptjs**,
> JWT is raw `@nestjs/jwt` (no passport); there are no `manager@demo` / `clerk@demo` logins
> (accounts come from `COLOSSUS_ACCOUNTS_JSON`); there is no `k8s/` directory to test.

## Coverage summary
- Total cases: 240 (202 API e2e + 14 frontend unit + 16 data-integrity + 8 build/deploy gate)
- API endpoints covered: 21 / 21 (19 StockRoom REST from `tasks.md` + 2 legacy tRPC from `surface.json`; `surface.json`'s bare `GET /health` is the same handler as `GET /api/health` under the global prefix)
- User journeys covered: 13

### Test harness assumptions
- **API e2e** (`backend/test/*.e2e-spec.ts`, Jest + supertest) runs against a throwaway Postgres with
  `prisma migrate deploy` applied. Suites create their **own** users directly through `PrismaService`
  (email + `bcryptjs.hash(pw, 10)` + explicit `role`) because `POST /api/auth/signup` can only ever
  mint `USER` once the table is non-empty. Suites must **not** invoke `prisma/seed/seed.js`.
- **Fixture isolation:** every suite uses SKUs/location names namespaced per-suite
  (e.g. `SKU-ITM-001`, `LOC-ITM-A`) so parallel workers never collide on the `@unique` columns.
- **Fixture data** (`backend/prisma/seed/fixtures.js`) is exercised separately in DATA-*.
- **Frontend unit** specs run under the Angular CLI test runner with `HttpClientTestingModule`
  and a stubbed `Router`.
- **Smoke/journey** cases run against `docker compose up --build` using the
  `angular_testability` wait strategy (never `networkidle`), authenticating with the
  Colossus-minted `USER` / `MANAGER` / `ADMIN` accounts.
- Shorthand: `T(role)` = a valid `Authorization: Bearer` token for that role. "no token" = header omitted.

---

## API tests

### `POST /api/auth/signup`
- **Happy path**
  - `API-SIGNUP-01` — `{email:"new.user@test.local", password:"Passw0rd!"}` on an **empty** `User` table → `201`, body `{accessToken:<non-empty string>, user:{id, email:"new.user@test.local", role:"MANAGER"}}`. No `passwordHash` field anywhere in the response.
  - `API-SIGNUP-02` — same request on a **non-empty** `User` table → `201` and `user.role === "USER"` (this is the real-world case; the Colossus seed always populates users first).
  - `API-SIGNUP-03` — the returned `accessToken` is immediately usable: `GET /api/auth/me` with it → `200`.
  - `API-SIGNUP-04` — persisted `User.passwordHash` is a bcrypt hash (`/^\$2[aby]\$/`), never the plaintext, and `bcryptjs.compare("Passw0rd!", hash)` is `true`.
- **Validation failures** (all → `400`, body `{message:"Validation failed", errors:[{field, message}]}`)
  - `API-SIGNUP-05` — missing `email` → `errors[]` contains `field:"email"`.
  - `API-SIGNUP-06` — `email:"not-an-email"` → `errors[]` contains `field:"email"`.
  - `API-SIGNUP-07` — missing `password` → `errors[]` contains `field:"password"`.
  - `API-SIGNUP-08` — `password:"abc"` (below minimum length) → `errors[]` contains `field:"password"`.
  - `API-SIGNUP-09` — duplicate email (signup twice with `dupe@test.local`) → `400` with `errors:[{field:"email", message:"must be unique"}]` (Prisma `P2002` via the exception filter), **not** `409`, and `user.count()` is unchanged.
  - `API-SIGNUP-10` — body carries an unexpected `role:"ADMIN"` key → the response `user.role` is `USER`; privilege is never client-assignable.
- **Auth failures**
  - `API-SIGNUP-11` — endpoint is `@Public()`: succeeds with no `Authorization` header (never `401`).
- **Idempotency / edge cases**
  - `API-SIGNUP-12` — `email` is matched case-insensitively or normalised consistently: signing up `A@test.local` then `a@test.local` must not produce two logins that both work; whichever policy is implemented, assert it deterministically.

### `POST /api/auth/login`
- **Happy path**
  - `API-LOGIN-01` — correct credentials for a seeded `MANAGER` → `200`, `{accessToken, user:{id, email, role:"MANAGER"}}`.
  - `API-LOGIN-02` — decoded JWT payload contains `{sub:<user id>, email, role}` and an `exp` ≈ 12h after `iat` (allow ±60s).
  - `API-LOGIN-03` — token is verifiable HS256 against `JWT_SECRET`.
- **Validation failures**
  - `API-LOGIN-04` — missing `email` → `400 {message:"Validation failed", errors:[{field:"email"}]}`.
  - `API-LOGIN-05` — missing `password` → `400` with `field:"password"`.
- **Auth failures**
  - `API-LOGIN-06` — unknown email `nobody@test.local` → `401`; response body must not reveal whether the email exists.
  - `API-LOGIN-07` — known email, wrong password → `401`, and the message is byte-identical to `API-LOGIN-06`'s (no user-enumeration oracle).
- **Idempotency / edge cases**
  - `API-LOGIN-08` — logging in twice returns two independently valid tokens (no session invalidation); both pass `GET /api/auth/me`.

### `GET /api/auth/me`
- **Happy path**
  - `API-ME-01` — `T(USER)` → `200 {id, email, role:"USER"}`, matching the user the token was minted for.
  - `API-ME-02` — `T(ADMIN)` → `200` with `role:"ADMIN"`.
  - `API-ME-03` — response never includes `passwordHash`.
- **Auth failures**
  - `API-ME-04` — no token → `401`.
  - `API-ME-05` — `Authorization: Bearer garbage` → `401`.
  - `API-ME-06` — token signed with a different secret → `401`.
  - `API-ME-07` — expired token (mint with `expiresIn:"-1s"`) → `401`.
  - `API-ME-08` — header without the `Bearer ` scheme (raw token) → `401`.

### `GET /api/items?q=&sort=`
- **Happy path**
  - `API-ITEMS-LIST-01` — `T(USER)` → `200` array; each row is exactly `{id, sku, name, unit, reorderAt, totalQty}`.
  - `API-ITEMS-LIST-02` — item with `StockLevel` rows `Zone A:30`, `Zone B:12` → `totalQty === 42`.
  - `API-ITEMS-LIST-03` — item with **no** `StockLevel` rows is **present** in the list with `totalQty === 0` (never omitted, never `null`). This is the `groupBy` merge-default invariant.
  - `API-ITEMS-LIST-04` — `?q=widget` returns only items whose sku or name matches, case-insensitively; a non-matching item is absent.
  - `API-ITEMS-LIST-05` — `?q=` (empty) and `?q` omitted both return the full list.
  - `API-ITEMS-LIST-06` — `?q=zzzz-no-match` → `200 []` (empty array, not `404`).
  - `API-ITEMS-LIST-07` — `?sort=sku` returns rows ordered by `sku` ascending; `?sort=totalQty` orders by on-hand.
- **Validation failures**
  - `API-ITEMS-LIST-08` — `?sort=<unknown field>` → `400` validation error (or a documented deterministic fallback order — assert whichever is implemented, never a `500`).
  - `API-ITEMS-LIST-09` — `?q=%27%20OR%201%3D1--` is treated as a literal search string → `200 []`, no error, no leaked rows.
- **Auth failures**
  - `API-ITEMS-LIST-10` — no token → `401`.
- **Idempotency / edge cases**
  - `API-ITEMS-LIST-11` — the endpoint issues one `groupBy`, not N+1: with 8 fixture items the response is still a single well-formed payload and `totalQty` is correct for all 8.

### `GET /api/items/:id`
- **Happy path**
  - `API-ITEM-GET-01` — `T(USER)` with a valid id → `200 {id, sku, name, description, unit, reorderAt, totalQty, stockLevels:[...]}`.
  - `API-ITEM-GET-02` — each `stockLevels[]` entry embeds its location: `{locationId, qty, location:{id, name, zone}}`.
  - `API-ITEM-GET-03` — **sum invariant:** `stockLevels.reduce((a,s)=>a+s.qty,0) === totalQty` for an item stocked in 3 zones (30+12+5 → `totalQty === 47`).
  - `API-ITEM-GET-04` — item with no stock rows → `200`, `stockLevels: []`, `totalQty: 0`.
- **Validation failures**
  - `API-ITEM-GET-05` — `:id` that is not a uuid → `400` or `404` (assert the implemented one), never `500`.
- **Auth failures**
  - `API-ITEM-GET-06` — no token → `401` (asserted *before* existence: a bad id with no token is still `401`, not `404`).
- **Idempotency / edge cases**
  - `API-ITEM-GET-07` — well-formed but unknown uuid → `404`.
  - `API-ITEM-GET-08` — `totalQty` here equals the same item's `totalQty` in `GET /api/items` (the two code paths must agree).

### `POST /api/items`
- **Happy path**
  - `API-ITEM-POST-01` — `T(MANAGER)` + `{sku:"SKU-NEW-1", name:"Bolt", unit:"ea", reorderAt:10}` → `201` with the created item echoed (`id` present, `totalQty` 0 if returned).
  - `API-ITEM-POST-02` — `T(ADMIN)` with the same shape → `201` (ADMIN inherits MANAGER writes).
  - `API-ITEM-POST-03` — optional `description` persists and is readable via `GET /api/items/:id`.
  - `API-ITEM-POST-04` — `reorderAt: 0` is accepted (0 is valid, not falsy-rejected).
- **Validation failures** (all → `400 {message:"Validation failed", errors:[{field, message}]}`)
  - `API-ITEM-POST-05` — missing `sku` → `field:"sku"`.
  - `API-ITEM-POST-06` — `sku:""` → `field:"sku"`.
  - `API-ITEM-POST-07` — missing `name` → `field:"name"`.
  - `API-ITEM-POST-08` — missing `unit` → `field:"unit"`.
  - `API-ITEM-POST-09` — `reorderAt:-1` → `field:"reorderAt"`.
  - `API-ITEM-POST-10` — `reorderAt:"ten"` → `field:"reorderAt"`.
  - `API-ITEM-POST-11` — `reorderAt:1.5` → `field:"reorderAt"` (must be an integer).
  - `API-ITEM-POST-12` — **duplicate SKU:** create `SKU-001`, then POST `SKU-001` again → `400` with `errors:[{field:"sku", message:"must be unique"}]` (**not** `409`, **not** `500`) **and** `prisma.item.count()` is unchanged from before the second call.
  - `API-ITEM-POST-13` — unknown extra key `{hacked:true}` is stripped, not persisted, and does not cause a `500`.
- **Auth failures**
  - `API-ITEM-POST-14` — no token → `401`.
  - `API-ITEM-POST-15` — `T(USER)` → `403`, and `item.count()` unchanged (401-before-403 ordering: `APP_GUARD` runs JwtAuthGuard first).
- **Idempotency / edge cases**
  - `API-ITEM-POST-16` — two concurrent `POST`s with the same SKU (`Promise.all`) → exactly one `201` and one `400`; `item.count()` increases by exactly 1.

### `PATCH /api/items/:id`
- **Happy path**
  - `API-ITEM-PATCH-01` — `T(MANAGER)` + `{name:"Renamed"}` → `200`; `GET /api/items/:id` reflects the new name and leaves `sku`/`unit` untouched (partial update).
  - `API-ITEM-PATCH-02` — `{reorderAt: 25}` → `200` and the item's low-stock eligibility recomputes on the next `GET /api/reports/low-stock`.
  - `API-ITEM-PATCH-03` — `T(ADMIN)` → `200`.
- **Validation failures**
  - `API-ITEM-PATCH-04` — `{reorderAt:-5}` → `400`, `field:"reorderAt"`.
  - `API-ITEM-PATCH-05` — `{sku:""}` → `400`, `field:"sku"`.
  - `API-ITEM-PATCH-06` — `{sku:"<an existing other item's sku>"}` → `400` with `field:"sku"`, `message:"must be unique"`; neither item is mutated.
  - `API-ITEM-PATCH-07` — `{}` (empty body) → `200` no-op or `400`; assert the implemented behaviour, never `500`.
- **Auth failures**
  - `API-ITEM-PATCH-08` — no token → `401`.
  - `API-ITEM-PATCH-09` — `T(USER)` → `403` and the item is unchanged.
- **Idempotency / edge cases**
  - `API-ITEM-PATCH-10` — unknown uuid → `404` (Prisma `P2025` via the filter).
  - `API-ITEM-PATCH-11` — applying the same PATCH twice yields identical state (idempotent).

### `DELETE /api/items/:id`
- **Happy path**
  - `API-ITEM-DEL-01` — `T(MANAGER)` deleting an item with **no** movements and **no** non-zero stock → `200`/`204`; subsequent `GET /api/items/:id` → `404`; the item is absent from `GET /api/items`.
  - `API-ITEM-DEL-02` — `T(ADMIN)` → same.
- **Validation failures**
  - `API-ITEM-DEL-03` — malformed id → `400`/`404`, never `500`.
- **Auth failures**
  - `API-ITEM-DEL-04` — no token → `401`.
  - `API-ITEM-DEL-05` — `T(USER)` → `403` and the item still exists.
- **Idempotency / edge cases**
  - `API-ITEM-DEL-06` — **audit protection:** item referenced by at least one `Movement` → `409`; `prisma.item.count()` and `prisma.movement.count()` are both unchanged (the audit log is never orphaned).
  - `API-ITEM-DEL-07` — item with a non-zero `StockLevel` but no movements → the documented outcome (`409` if guarded by the `onDelete: Restrict` FK → `P2003`); assert no `500` and no partial delete.
  - `API-ITEM-DEL-08` — deleting the same id twice → second call `404`.

### `GET /api/locations`
- **Happy path**
  - `API-LOC-LIST-01` — `T(USER)` → `200` array of `{id, name, zone, createdAt}`. **Clerks must be able to read this** (they need it in the movement form) — this is explicitly *not* manager-gated.
  - `API-LOC-LIST-02` — `T(MANAGER)` and `T(ADMIN)` → `200` with the same payload shape.
  - `API-LOC-LIST-03` — after fixtures, contains `Zone A`/`Zone B`/`Zone C` with `zone` values `A`/`B`/`C`.
- **Validation failures** — n/a (no parameters).
- **Auth failures**
  - `API-LOC-LIST-04` — no token → `401`.
- **Idempotency / edge cases**
  - `API-LOC-LIST-05` — with zero locations → `200 []`, not `404`.

### `POST /api/locations`
- **Happy path**
  - `API-LOC-POST-01` — `T(MANAGER)` + `{name:"Zone D", zone:"D"}` → `201` with `{id, name, zone}`.
  - `API-LOC-POST-02` — `T(ADMIN)` → `201`.
- **Validation failures**
  - `API-LOC-POST-03` — missing `name` → `400`, `field:"name"`.
  - `API-LOC-POST-04` — missing `zone` → `400`, `field:"zone"`.
  - `API-LOC-POST-05` — `name:""` → `400`, `field:"name"`.
  - `API-LOC-POST-06` — duplicate `name` → `400` with `errors:[{field:"name", message:"must be unique"}]` (not `409`), and `location.count()` unchanged.
- **Auth failures**
  - `API-LOC-POST-07` — no token → `401`.
  - `API-LOC-POST-08` — `T(USER)` → `403`, `location.count()` unchanged.

### `PATCH /api/locations/:id`
- **Happy path**
  - `API-LOC-PATCH-01` — `T(MANAGER)` + `{zone:"Z"}` → `200`; `GET /api/locations` reflects it; `name` unchanged.
  - `API-LOC-PATCH-02` — renaming a location does **not** alter any `StockLevel.qty` or `Movement` row.
- **Validation failures**
  - `API-LOC-PATCH-03` — `{name:"<another location's name>"}` → `400` with `field:"name"`.
  - `API-LOC-PATCH-04` — `{zone:""}` → `400`.
- **Auth failures**
  - `API-LOC-PATCH-05` — no token → `401`.
  - `API-LOC-PATCH-06` — `T(USER)` → `403` and the location is unchanged.
- **Idempotency / edge cases**
  - `API-LOC-PATCH-07` — unknown uuid → `404`.

### `DELETE /api/locations/:id`
- **Happy path**
  - `API-LOC-DEL-01` — `T(MANAGER)` deleting an unreferenced location (no movements, no non-zero stock) → `200`/`204`; absent from `GET /api/locations`.
- **Validation failures**
  - `API-LOC-DEL-02` — malformed id → `400`/`404`, never `500`.
- **Auth failures**
  - `API-LOC-DEL-03` — no token → `401`.
  - `API-LOC-DEL-04` — `T(USER)` → `403` and the location still exists.
- **Idempotency / edge cases**
  - `API-LOC-DEL-05` — location referenced as `fromLoc` on a movement → `409`; `location.count()` and `movement.count()` unchanged.
  - `API-LOC-DEL-06` — location referenced as `toLoc` on a movement → `409` (both named relations are guarded, not just one).
  - `API-LOC-DEL-07` — location holding a **non-zero** `StockLevel` → `409`.
  - `API-LOC-DEL-08` — location holding only **zero-qty** `StockLevel` rows and no movements → deletes successfully (`200`/`204`) or `409`; assert the implemented rule consistently with `API-LOC-DEL-01`.
  - `API-LOC-DEL-09` — deleting the same id twice → second call `404`.

### `POST /api/movements`
- **Happy path** (any authenticated user, including `USER` — clerks record stock)
  - `API-MOV-POST-01` — `T(USER)` + `{type:"IN", itemId:I, toLocId:A, qty:50}` → `201`; `StockLevel(I,A).qty === 50` (row created by upsert when absent).
  - `API-MOV-POST-02` — a second `IN` of 20 into A → `StockLevel(I,A).qty === 70` (increment, not overwrite).
  - `API-MOV-POST-03` — `{type:"OUT", itemId:I, fromLocId:A, qty:20}` against 50 on hand → `201`, `StockLevel(I,A).qty === 30`.
  - `API-MOV-POST-04` — `{type:"TRANSFER", itemId:I, fromLocId:A, toLocId:B, qty:10}` against A=30 → `201`, A=20, B=10, **and the item's `totalQty` is unchanged across the transfer**.
  - `API-MOV-POST-05` — the created `Movement` row records `userId` = the caller (from the JWT `sub`), never a client-supplied value: posting `{userId:"<other user id>"}` in the body still records the caller.
  - `API-MOV-POST-06` — optional `note` persists and is returned by `GET /api/movements`.
  - `API-MOV-POST-07` — `OUT` of exactly the full on-hand (5 against 5) → `201`, level `0`, and the zero row still exists / totals to 0.
- **Validation failures** (all → `400`, and `movement.count()` + every affected `StockLevel.qty` unchanged)
  - `API-MOV-POST-08` — `IN` with **no** `toLocId` → `400`.
  - `API-MOV-POST-09` — `IN` **with** a `fromLocId` → `400` (explicitly rejected, not silently ignored).
  - `API-MOV-POST-10` — `OUT` with no `fromLocId` → `400`.
  - `API-MOV-POST-11` — `TRANSFER` with only `fromLocId` → `400`.
  - `API-MOV-POST-12` — `TRANSFER` with only `toLocId` → `400`.
  - `API-MOV-POST-13` — `TRANSFER` with `fromLocId === toLocId` → `400`.
  - `API-MOV-POST-14` — `qty: 0` → `400`.
  - `API-MOV-POST-15` — `qty: -5` → `400`.
  - `API-MOV-POST-16` — `qty: 2.5` → `400` (integer required).
  - `API-MOV-POST-17` — `type:"SHRINKAGE"` (not in the enum) → `400`.
  - `API-MOV-POST-18` — missing `itemId` → `400`, `field:"itemId"`.
  - `API-MOV-POST-19` — unknown `itemId` uuid → `400` or `404`; never `500`, never a partial `StockLevel` write.
  - `API-MOV-POST-20` — unknown `toLocId` uuid → `400`/`404` and no `StockLevel` row is created for the phantom location.
  - `API-MOV-POST-21` — **over-draw:** `OUT` 10 against 5 on hand → `400` with message `"Insufficient stock at source location"`, **and the stored level is still exactly 5**, and no `Movement` row was written.
  - `API-MOV-POST-22` — `OUT` from a location where the item has **no** `StockLevel` row at all → `400` insufficient-stock (not a `-qty` row created by upsert).
  - `API-MOV-POST-23` — `TRANSFER` whose debit would over-draw → `400`, **and the destination was not credited** (full transactional rollback: B's qty unchanged).
- **Auth failures**
  - `API-MOV-POST-24` — no token → `401`.
- **Idempotency / edge cases**
  - `API-MOV-POST-25` — **race safety:** two concurrent `OUT 3` requests against 5 on hand (`Promise.all`) → exactly one `201` and one `400`; final level is `2`, never negative. This is the guarded-`updateMany` contract; a read-then-write implementation fails here.
  - `API-MOV-POST-26` — after any `400`, `prisma.movement.count()` is identical to its pre-call value (the movement insert is last inside the transaction).

### `GET /api/movements?itemId=&type=&from=&to=&page=&pageSize=`
- **Happy path**
  - `API-MOV-LIST-01` — `T(MANAGER)` → `200 {data:[...], total:<int>, page:<int>, pageSize:<int>}` — exactly these four keys.
  - `API-MOV-LIST-02` — each `data[]` row exposes **who** (`user.email`), **item** (`item.sku`/`item.name`), `type`, `qty`, `fromLoc` and `toLoc` (name/zone, `null` where not applicable) and `createdAt`.
  - `API-MOV-LIST-03` — rows are ordered `createdAt` **descending** (most recent first).
  - `API-MOV-LIST-04` — `data[].user` exposes only `email` — no `passwordHash`, no `role` leak beyond what the shape declares.
  - `API-MOV-LIST-05` — `T(ADMIN)` → `200` (ADMIN inherits MANAGER reads).
  - `API-MOV-LIST-06` — `?itemId=<I>` returns only movements for `I`; a movement for item `J` is absent and `total` reflects the filtered count, not the global count.
  - `API-MOV-LIST-07` — `?type=OUT` returns only `OUT` rows.
  - `API-MOV-LIST-08` — `?from=<ISO of tomorrow>` → `data: []`, `total: 0`.
  - `API-MOV-LIST-09` — `?to=<ISO of yesterday>` → excludes today's movements.
  - `API-MOV-LIST-10` — `?from` + `?to` bracketing today → includes today's movements (inclusive `gte`/`lte` bounds).
  - `API-MOV-LIST-11` — combined `?itemId=<I>&type=IN` narrows on both predicates simultaneously.
  - `API-MOV-LIST-12` — pagination: with 3 movements, `?page=1&pageSize=2` → `data.length === 2`, `total === 3`; `?page=2&pageSize=2` → `data.length === 1`, `total === 3`; the two pages share no ids.
  - `API-MOV-LIST-13` — `pageSize` omitted → defaults to `50` in the response body.
- **Validation failures**
  - `API-MOV-LIST-14` — `?from=not-a-date` → `400` validation error (ISO date string required), not `500`.
  - `API-MOV-LIST-15` — `?type=BOGUS` → `400`.
  - `API-MOV-LIST-16` — `?page=0` or `?page=-1` → `400` or clamped to 1; assert the implemented behaviour deterministically.
  - `API-MOV-LIST-17` — `?pageSize=100000` → `400` or clamped to a documented maximum (must not attempt to load the whole table).
- **Auth failures**
  - `API-MOV-LIST-18` — no token → `401`.
  - `API-MOV-LIST-19` — `T(USER)` → `403` (clerks may write movements but not read the audit log).
- **Idempotency / edge cases**
  - `API-MOV-LIST-20` — `?page=99` beyond the end → `200` with `data: []` and the correct `total`, not `404`.
  - `API-MOV-LIST-21` — a `TRANSFER` row surfaces **both** `fromLoc` and `toLoc`; an `IN` row has `fromLoc: null`; an `OUT` row has `toLoc: null`.

### `GET /api/reports/low-stock`
- **Happy path**
  - `API-LOW-01` — `T(MANAGER)` → `200` array of `{id, sku, name, unit, reorderAt, totalQty}` (exactly these keys).
  - `API-LOW-02` — spec scenario: item with `reorderAt:10` and 12 on hand is **absent**; after `OUT 5` (→ 7 on hand) the same item **appears**.
  - `API-LOW-03` — item with `reorderAt:10` and 40 on hand is **absent**.
  - `API-LOW-04` — **boundary:** item with `reorderAt:10` and exactly 10 on hand **appears** (`<=`, not `<`).
  - `API-LOW-05` — item with `reorderAt:10` and 11 on hand is absent (the other side of the boundary).
  - `API-LOW-06` — item with **no** `StockLevel` rows and `reorderAt:0` appears with `totalQty: 0` (missing sums map to `0`, so `0 <= 0` holds).
  - `API-LOW-07` — ordering: rows are sorted by `totalQty - reorderAt` **ascending**, so the deepest shortfall is first (seed shortfalls of `-8`, `-3`, `0` → that exact order).
  - `API-LOW-08` — `T(ADMIN)` → `200`.
  - `API-LOW-09` — `totalQty` for a given item equals the same item's `totalQty` from `GET /api/items` (single source of truth).
- **Validation failures** — n/a (no parameters).
- **Auth failures**
  - `API-LOW-10` — no token → `401`.
  - `API-LOW-11` — `T(USER)` → `403`.
- **Idempotency / edge cases**
  - `API-LOW-12` — with every item comfortably above threshold → `200 []`, not `404`.
  - `API-LOW-13` — recording an `IN` that lifts an item above its threshold removes it from the next call's result (report is live, not cached).

### `GET /api/admin/settings`
- **Happy path**
  - `API-SET-GET-01` — `T(ADMIN)` → `200` listing the known keys for **postgresql** (`DATABASE_URL`) and **minio** (`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`) — 5 keys, each `{key, service, value:<masked>, configured:<boolean>}`.
  - `API-SET-GET-02` — **masking:** the response `value` for a set credential never contains the full plaintext (e.g. only a suffix/`****`); asserted by checking the raw response body does not contain `process.env.MINIO_SECRET_KEY`.
  - `API-SET-GET-03` — a key whose env var is unset and has no `SystemSetting` row → `configured: false`.
  - `API-SET-GET-04` — a key whose env var equals `PLACEHOLDER_CONFIGURE_IN_SETTINGS` → `configured: false` (placeholder counts as unset).
  - `API-SET-GET-05` — a key set via a real env var → `configured: true`.
- **Validation failures** — n/a (no parameters).
- **Auth failures**
  - `API-SET-GET-06` — no token → `401`.
  - `API-SET-GET-07` — `T(USER)` → `403`.
  - `API-SET-GET-08` — `T(MANAGER)` → `403` (this is the one surface `MANAGER` does **not** inherit).

### `PATCH /api/admin/settings`
- **Happy path**
  - `API-SET-PATCH-01` — `T(ADMIN)` + `{pairs:[{key:"MINIO_BUCKET", value:"stockroom"}]}` → `200`; a `SystemSetting` row exists with that key/value and a fresh `updatedAt`.
  - `API-SET-PATCH-02` — the following `GET /api/admin/settings` reports `configured: true` for `MINIO_BUCKET`.
  - `API-SET-PATCH-03` — multiple pairs in one request are all upserted.
- **Validation failures**
  - `API-SET-PATCH-04` — unknown key `{key:"HACK_ME"}` → `400` (only the declared service keys are writable).
  - `API-SET-PATCH-05` — missing `value` → `400` with a field-scoped error.
  - `API-SET-PATCH-06` — empty `pairs: []` → `400` or `200` no-op; assert the implemented behaviour.
- **Auth failures**
  - `API-SET-PATCH-07` — no token → `401`.
  - `API-SET-PATCH-08` — `T(MANAGER)` → `403` and no `SystemSetting` row is written.
- **Idempotency / edge cases**
  - `API-SET-PATCH-09` — PATCHing the same key twice **upserts** (one row, latest value), never duplicates or `P2002`s.
  - `API-SET-PATCH-10` — `resolveConfig(key)` precedence: env wins over `SystemSetting`; with the env var unset the `SystemSetting` value is returned; with neither set it returns `null` and the dependent surface answers `503` (`ServiceUnconfiguredError`), not `500`.

### `GET /api/health`
- **Happy path**
  - `API-HEALTH-01` — no token → `200 {status:"ok"}`.
  - `API-HEALTH-02` — responds `200` even with Postgres stopped (must **not** touch the DB — it backs the K8s liveness probe, so a DB blip must not restart the pod).
- **Auth failures**
  - `API-HEALTH-03` — `@Public()`: never `401`, with or without a token.
- **Idempotency / edge cases**
  - `API-HEALTH-04` — this is the same handler `surface.json` lists as bare `GET /health`; under `app.setGlobalPrefix('api')` the live path is `/api/health`, and a request to `/health` returns `404`. Assert both so the stale surface entry can't be mistaken for a live route.

### `GET /api/health/deep`
- **Happy path**
  - `API-DEEP-01` — no token, DB reachable → `200` with a healthy body (`SELECT 1` via `$queryRaw` succeeded).
- **Auth failures**
  - `API-DEEP-02` — `@Public()`: never `401`.
- **Idempotency / edge cases**
  - `API-DEEP-03` — DB unreachable (bad `DATABASE_URL` / stopped container) → **`503`**, not `200` and not `500`; the readiness probe must actually fail.
  - `API-DEEP-04` — repeated calls do not leak Prisma connections (100 sequential calls all `200`).

### `GET /trpc/users.findAll` *(legacy — `surface.json`; regression only)*
- **Happy path**
  - `API-TRPC-01` — the tRPC `users` router is still mounted and returns a well-formed tRPC envelope (`200`) after all StockRoom modules are wired. `tasks.md` requires `TrpcAppModule`/`UsersModule` to remain registered and compiling.
- **Auth failures**
  - `API-TRPC-02` — the global `JwtAuthGuard` does not accidentally `401` the tRPC mount in a way that breaks the compile-time contract; whichever behaviour is chosen (public or guarded) is asserted explicitly rather than left undefined.
- **Idempotency / edge cases**
  - `API-TRPC-03` — no StockRoom feature depends on this route: removing its data yields no failure in any other suite.

### `GET /trpc/users.findById` *(legacy — `surface.json`; regression only)*
- **Happy path**
  - `API-TRPC-04` — resolves for an existing user id and returns a tRPC envelope, unbroken by the new `User` fields.
- **Validation failures**
  - `API-TRPC-05` — unknown id → the router's documented error envelope, not an unhandled `500`.

---

## UI / journey tests

### Journey: Unauthenticated smoke — brand + readiness *(highest-risk case)*
- **Steps**: Fresh browser, no `localStorage`. Navigate to `/`. Wait on the `angular_testability` strategy (never `networkidle`).
- **Expected outcomes**: `/` redirects to `/login`; `data-testid="app-ready"` is present in the DOM; the rendered text **contains the literal `StockRoom`** (from the persistent shell header, which renders on `/login` too); `<title>` is StockRoom-branded; `.colossus-acceptance.json` has `expect_text: ["StockRoom"]` and `ready_testid: "app-ready"`.
- **Negative path**: The reject signatures never render anywhere — no `home-title">Users<`, no `Loading...`, no `Failed to load users.`; `frontend/src/app/home/home.component.ts` and its route are deleted; `data-testid="app-ready"` remains in `app.component.ts` and appears exactly once.

### Journey: Login
- **Steps**: Go to `/login` → type the Colossus `MANAGER` email/password → click Sign in.
- **Expected outcomes**: URL becomes `/items`; the item table renders; `localStorage` holds the JWT; the shell header shows the user's email and a Logout control plus manager-only nav (Audit, Low stock).
- **Negative path**: (a) Wrong password → stays on `/login`, an inline error is shown, no token is stored, the app does not crash. (b) Empty email/password → the form is invalid, Sign in is disabled or blocked, no request is sent. (c) Deep-link gating: visit `/reports/low-stock` while logged out → redirected to `/login?returnUrl=%2Freports%2Flow-stock`; after logging in, land on `/reports/low-stock`, **not** `/items`.

### Journey: Signup
- **Steps**: `/login` → click the signup link → `/signup` → enter a new email + password → submit.
- **Expected outcomes**: Authenticated and redirected to `/items`; the new account's role is `USER` (Colossus already seeded users), so manager-only nav links are **not** rendered.
- **Negative path**: Reusing an existing email → the API's `400` field-scoped error renders inline against the email field ("must be unique"), the user stays on `/signup`, and no token is stored.

### Journey: Browse the item catalogue
- **Steps**: Log in as `USER` → land on `/items` → read the table → type `bolt` in the search box → clear it → click a sort header.
- **Expected outcomes**: Table columns are sku / name / unit / reorderAt / totalQty; an item with no stock rows shows `0`, not blank; typing writes `?q=bolt` into the URL (`queryParamsHandling: 'merge'`) and the table narrows; clearing restores the full list; sorting writes `?sort=`; **reloading the page with `?q=bolt&sort=sku` restores both the input value and the table state**; items at/below `reorderAt` are visually flagged; the list container and primary action carry stable `data-testid`s.
- **Negative path**: `?q=zzzz` → an explicit **empty state** ("No items match…"), not a blank page or a spinner; while loading, a **loading state** renders; if the API errors, an **error state** renders (never a silent blank). A `USER` sees no "New item" button.

### Journey: Item detail — stock breakdown and history
- **Steps**: From `/items`, click a row → `/items/:id` → read the header → view `?tab=stock` → click the movements tab → hard-refresh the browser on `/items/:id?tab=movements`.
- **Expected outcomes**: Header shows sku / name / unit / reorderAt / totalQty; `?tab=stock` shows a per-location table (location, zone, qty) with a **total row whose value equals the header `totalQty`**; the tab click writes `?tab=movements` and shows only that item's movements (who / type / qty / from → to / when); the hard refresh restores the movements tab directly (URL-addressable state + nginx SPA fallback).
- **Negative path**: An item with no stock rows shows an empty-state breakdown and a total of `0`; an item with no movements shows an empty history state; an unknown `:id` shows a not-found state, not a crash.

### Journey: Manager creates and edits an item
- **Steps**: Log in as `MANAGER` → `/items` → click "New item" → fill sku/name/unit/reorderAt → save → open the new row → click Edit → change the name → save.
- **Expected outcomes**: Clicking "New item" writes `?modal=new-item` into the URL and opens the modal; **loading `/items?modal=new-item` directly opens the modal on first paint** (restored from the URL); saving closes the modal, drops the query param, and the new item appears in the table without a manual reload; Edit writes `?modal=edit-item` on `/items/:id` and the same restore-from-URL rule holds.
- **Negative path**: Submitting a duplicate SKU renders the API's field-scoped `400` inline on the sku input ("must be unique") with the modal still open and no row added. `reorderAt: -1` is blocked client-side or rejected inline. Deleting an item that has movements surfaces the `409` as a readable message ("still referenced by movements"), not a silent failure.

### Journey: Manager manages locations
- **Steps**: Log in as `MANAGER` → `/locations` → click "New location" → enter name + zone → save → click Edit on a row → change the zone → save.
- **Expected outcomes**: Table shows name / zone; create writes `?modal=new-location`; edit writes `?modal=edit-location&id=<id>` and pre-fills the form from that `id` **on a cold load of that URL**; saving refreshes the table.
- **Negative path**: Duplicate name → inline `400` on the name field, modal stays open. Deleting a referenced location → the `409` renders as a readable message. A `USER` on `/locations` can read the table but sees **no** create/edit/delete controls.

### Journey: Clerk records a movement
- **Steps**: Log in as `USER` → click "New movement" (or arrive from an item page via `/movements/new?itemId=<I>&type=OUT`) → confirm prefills → choose type → pick locations → enter qty → optionally a note → submit.
- **Expected outcomes**: `?itemId` preselects the item and `?type` preselects the type; selecting `IN` shows **only** a "To location" select; `OUT` shows **only** "From location"; `TRANSFER` shows both; submitting succeeds, the user is routed to a confirmation or the item detail, and the affected `StockLevel` reflects the change on `/items/:id?tab=stock`; a `TRANSFER` leaves the item's `totalQty` unchanged.
- **Negative path**: `OUT` of more than on hand → the API's **`400` message "Insufficient stock at source location" renders inline** in the form, the form retains its input, and no balance changes (verify by returning to the item detail). `qty: 0` is blocked. `TRANSFER` with the same from/to is blocked (client-side or via the inline `400`).

### Journey: Manager reviews the movement audit log
- **Steps**: Log in as `MANAGER` → `/movements` → set the item filter → set type = `TRANSFER` → set a date range → page forward → reload the browser.
- **Expected outcomes**: Columns are who (user email) / item / type / qty / from → to / timestamp, newest first; each filter change merges into the query params (`?itemId=&type=&from=&to=&page=`); the table narrows accordingly; paging writes `?page=2`; **a full reload of the filtered URL reproduces exactly the same filtered, paged view**; pagination controls reflect `total`/`pageSize`.
- **Negative path**: A filter combination with no matches → explicit empty state, pagination disabled. An invalid date typed by hand into the URL → a readable error state, not a crash. A `USER` navigating to `/movements` is sent to `/403` and never sees audit data.

### Journey: Manager reads the low-stock report
- **Steps**: Log in as `MANAGER` → click "Low stock" → `/reports/low-stock` → note the rows → record an `IN` that lifts the worst item above its threshold → return to the report.
- **Expected outcomes**: Columns are sku / name / on-hand / reorderAt / **shortfall**; rows are ordered by shortfall ascending (deepest first); the seeded at-or-below-threshold item is present on first load; after the `IN`, the item is gone from the report.
- **Negative path**: With nothing below threshold → an explicit "all stocked" empty state. A `USER` navigating to `/reports/low-stock` lands on `/403`.

### Journey: Admin configures backing services
- **Steps**: Log in as `ADMIN` → `/admin/settings` → read the postgresql and minio cards → fill a minio credential → save.
- **Expected outcomes**: One card per service with a configured/unconfigured badge; current values are **masked**; saving PATCHes and flips the badge to configured with success feedback; the ADMIN sees the "Admin settings" nav link.
- **Negative path**: A `MANAGER` navigating to `/admin/settings` lands on `/403` and the nav link is not rendered for them; a failed save renders an error, not a silent no-op.

### Journey: Role gating, 401 handling, and logout
- **Steps**: Log in as `USER` → attempt `/movements`, `/reports/low-stock`, `/admin/settings` by URL → land on `/403` → follow the link back to `/items` → tamper with the stored JWT in `localStorage` → trigger any API call → click Logout.
- **Expected outcomes**: Each manager/admin route sends the `USER` to `/403` (never a blank page, never leaked data); `/403` offers a working link back to `/items`; a tampered/expired token yields a `401` from the API, at which point the interceptor **clears auth state and redirects to `/login?returnUrl=<current url>`**; Logout clears `localStorage` and routes to `/login`; pressing Back after logout does **not** restore an authenticated view.
- **Negative path**: A `403` from the API (rather than a route guard) also routes to `/403` via the interceptor. After logout, deep-linking to `/items` redirects to `/login`.

### Journey: Deep links and SPA fallback
- **Steps**: Logged in, hard-refresh (F5, not client-side navigation) each route from the SPA-routes table: `/login`, `/signup`, `/items`, `/items/:id`, `/locations`, `/movements/new`, `/movements`, `/reports/low-stock`, `/admin/settings`, `/403`, and an unknown path `/does-not-exist`.
- **Expected outcomes**: Every route returns the SPA shell (HTTP `200`, not `404`) thanks to `try_files $uri $uri/ /index.html;` in `frontend/nginx.conf`; each renders its screen with `data-testid="app-ready"` present; `/` and `/does-not-exist` redirect to `/items` (or `/login` when unauthenticated); every route's `data.flow` value matches the tasks.md table.
- **Negative path**: `/items/<id>` hard-refresh returning `404` or a blank page means the nginx fallback or the Docker `COPY` path is wrong — assert the built asset path `dist/frontend/browser` matches `colossus.yaml` `outputDir` **and** the `COPY` in `frontend/Dockerfile` (a mismatch yields a blank/403 page that no source change can fix).

### Frontend unit specs (guards, interceptor, services)
- `UNIT-01` — `authGuard` with no token → returns a `UrlTree`/navigates to `/login?returnUrl=<attempted url>`.
- `UNIT-02` — `authGuard` with a token → returns `true`.
- `UNIT-03` — `managerGuard` for a `USER` → routes to `/403`.
- `UNIT-04` — `managerGuard` for a `MANAGER` and for an `ADMIN` → both return `true` (ADMIN inherits).
- `UNIT-05` — `adminGuard` for a `MANAGER` → routes to `/403`; for an `ADMIN` → `true`.
- `UNIT-06` — `authInterceptor` attaches `Authorization: Bearer <token>` when a token exists.
- `UNIT-07` — `authInterceptor` omits the header when no token exists (no `Bearer null`).
- `UNIT-08` — on a `401` response the interceptor clears `localStorage` and navigates to `/login?returnUrl=…`.
- `UNIT-09` — on a `403` response the interceptor navigates to `/403` and does **not** clear the token.
- `UNIT-10` — `AuthService` signals hydrate from `localStorage` on construction; `isManager()` is `true` for `MANAGER` and `ADMIN`, `false` for `USER`; `isAdmin()` is `true` only for `ADMIN`.
- `UNIT-11` — `AuthService.logout()` clears both signals and storage and routes to `/login`.
- `UNIT-12` — `ApiService` is the only class injecting `HttpClient` for REST, and prefixes every call with `/api`.
- `UNIT-13` — the error normaliser maps an `HttpErrorResponse` `400 {message, errors:[{field,message}]}` into `ApiError` with `errors` intact, and a `500` into `ApiError {status:500, message:<generic>}` with no `errors`.
- `UNIT-14` — `provideHttpClient(withInterceptors([authInterceptor]))` is registered **and** the pre-existing `TRPC_CLIENT` provider is still present in `app.config.ts`.

---

## Data integrity tests
- `DATA-01` — **Total invariant:** after any sequence of movements, for every item `sum(StockLevel.qty where itemId) === GET /api/items[].totalQty === GET /api/items/:id.totalQty`. Assert after each of IN, OUT and TRANSFER.
- `DATA-02` — **Non-negativity:** no `StockLevel.qty` is ever `< 0`, including after the concurrent-OUT race (`API-MOV-POST-25`).
- `DATA-03` — **Transfer conservation:** a `TRANSFER` changes exactly two `StockLevel` rows by `-qty` and `+qty`; the item's grand total is byte-identical before and after.
- `DATA-04` — **Rollback completeness:** after any rejected movement (over-draw, bad shape, unknown id), `movement.count()` and every `StockLevel.qty` equal their pre-call values — no orphan movement row, no half-applied balance.
- `DATA-05` — **Movement immutability:** there is no update or delete endpoint for `Movement`; the audit log is append-only. Assert `PATCH /api/movements/:id` and `DELETE /api/movements/:id` return `404`/`405`.
- `DATA-06` — **Referential guards:** deleting an `Item` or `Location` referenced by a `Movement` is refused (`409`) and `movement.count()` is unchanged — the audit log is never orphaned (`onDelete: Restrict`).
- `DATA-07` — **Uniqueness:** `Item.sku`, `Location.name` and `User.email` are `@unique` at the DB level; a direct Prisma insert of a duplicate throws `P2002` (the constraint is not merely app-level).
- `DATA-08` — **StockLevel uniqueness:** `@@unique([itemId, locationId])` holds; repeated `IN`s into the same item+location produce exactly **one** row whose qty accumulates, never duplicates.
- `DATA-09` — **Attribution:** every `Movement.userId` references a real `User`, and equals the JWT subject of the request that created it — never a client-supplied value.
- `DATA-10` — **Password storage:** no `User.passwordHash` matches a known plaintext; all match `/^\$2[aby]\$/` at 10 rounds.
- `DATA-11` — **Seed idempotency:** running `node prisma/seed/seed.js && node prisma/seed/fixtures.js` **twice** leaves identical row counts for `User`, `ColossusAccount`, `Item`, `Location` and `StockLevel`, and exits `0` both times (upsert-only; a `create`-based seed crash-loops the pod on restart).
- `DATA-12` — **Fixture shape:** after fixtures, there are exactly 3 locations (`Zone A|B|C` with zones `A|B|C`) and 8 items; **at least one** item is at or below its `reorderAt`, **several** are comfortably above, and **at least one** has no `StockLevel` rows at all — so the item list, per-location breakdown and low-stock report all have data on first load.
- `DATA-13` — **Platform seed untouched:** `backend/prisma/seed/seed.js` is byte-identical to its scaffolded version (no demo logins added), and `package.json`'s `prisma.seed` still points at `prisma/seed/seed.js` with the fixtures script chained separately.
- `DATA-14` — **Migrations committed:** `backend/prisma/migrations/**` contains the StockRoom migration; `npx prisma migrate deploy` on an empty database succeeds and `npx prisma migrate status` reports no drift.
- `DATA-15` — **Scaffold models preserved:** `model ColossusAccount`, `model User` and `enum Role { USER MANAGER ADMIN }` are unmodified in `schema.prisma`; the existing `ColossusAccount` rows survive the new migration.
- `DATA-16` — **SystemSetting upsert:** repeated `PATCH /api/admin/settings` on the same key yields exactly one row with the latest `value` and a monotonically increasing `updatedAt`.

### Build / deploy gate
- `GATE-01` — `cd backend && npx prisma generate && npx tsc --noEmit` exits `0`.
- `GATE-02` — `cd backend && npm test -- --maxWorkers=2` passes with all e2e suites green.
- `GATE-03` — `cd frontend && npx ng build --configuration production` exits `0` and emits to `dist/frontend/browser`, matching `colossus.yaml` `outputDir` and the `COPY` in `frontend/Dockerfile`.
- `GATE-04` — `frontend/package.json` and `backend/package.json` dependency lists are unchanged from the scaffold (no new npm deps — drift disables the prebaked `node_modules` seed). Specifically: **no** `class-validator`, `class-transformer`, `passport`, `passport-jwt` or `bcrypt`.
- `GATE-05` — `docker compose up --build` reaches healthy; `curl -f localhost:<port>/api/health/deep` → `200`; `curl` on `/items/<id>` returns the SPA shell (`200`).
- `GATE-06` — no source file exceeds the 400-line soft budget without justification, and none exceeds the 500-line hard limit (`.pipeline/surface.json` `fileBudget`).
- `GATE-07` — `.github/workflows/colossus-deploy.yml` is unmodified.
- `GATE-08` — the backend port is consistent end-to-end: `main.ts` default, `frontend/nginx.conf` `proxy_pass`, `frontend/proxy.conf.json` and `colossus.yaml` `backend.port` all agree (see the open question below).

## Out of scope
- **`k8s/` manifests** (spec Step 15) — deployment is Colossus-managed via `.github/workflows/colossus-deploy.yml` + `colossus.yaml`, and `tasks.md` emits no `k8s/` work. Nothing to test.
- **`api/` and `web/` directory layouts, Angular 21, Prisma `7.10.0`, `bcrypt`, `class-validator`, `passport-jwt`** — superseded by the scaffold stack contract (`backend/`+`frontend/`, Angular 19, Prisma `^6.16`, `bcryptjs`, `zod`, `@nestjs/jwt`). Tests assert the scaffold stack; `GATE-04` actively asserts the spec's dependencies are *absent*.
- **`manager@demo` / `clerk@demo` seeded logins with password `Demo1234!`** (spec Step 10) — the platform contract forbids demo logins; accounts come from `COLOSSUS_ACCOUNTS_JSON`. No test asserts these credentials.
- **MinIO object storage behaviour** (uploads, item photos, movement attachments) — the spec describes no such feature; only the admin *credential surface* exists, and only that is tested (`API-SET-*`).
- **Building StockRoom features on tRPC** — the stack glue declares `api_client: trpc` but the entire spec surface is REST. tRPC is covered as regression only (`API-TRPC-01..05`); no StockRoom feature test targets it.
- **Token revocation / refresh tokens / password reset / email verification** — the spec defines logout as client-side token discard only; there is no server-side session store to test.
- **Rate limiting, CSRF, account lockout, audit-log export, CSV/PDF reports, i18n, offline mode, real-time updates** — the spec is silent on all of these.
- **Concurrency beyond the single documented race** — `API-MOV-POST-25` covers the guarded-`updateMany` contract; broader load/soak testing is not specified.
- **Visual regression / pixel styling** — only structural and text assertions (`data-testid`s, column presence, the `StockRoom` marker) are in scope.
- **Cross-browser matrix** — the smoke oracle runs one browser; the spec sets no browser support target.

## Open questions carried from `tasks.md` (resolve before the gate is meaningful)
- **Backend port:** `colossus.yaml` says `3001`; `main.ts` and `nginx.conf` say `3000`. `GATE-08` will fail until one of the three changes. These tests assume **3000**.
- **`surface.json` regeneration:** `service_agent` must replace the stale `users`/`home` entries; re-verify this file's endpoint coverage afterwards.
- **ADMIN inheriting MANAGER writes:** assumed `true` throughout (`API-ITEM-POST-02`, `API-LOW-08`, `UNIT-04`). If that changes, those cases invert.
- **`/admin/settings` being ADMIN-only:** assumed (`API-SET-GET-08` asserts `MANAGER` → `403`). If it should be manager-visible, that case inverts.
