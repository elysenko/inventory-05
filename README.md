# StockRoom

Multi-location inventory tracking: a catalogue of items, the zones they live in,
an append-only log of every stock movement, and a low-stock report.

- **`frontend/`** — Angular 19 standalone SPA (nginx + SPA fallback in production)
- **`backend/`** — NestJS 11 REST API under `/api`, Prisma + PostgreSQL
- **`k8s` / deploy** — driven by `colossus.yaml`; do not hand-edit `.github/workflows/colossus-deploy.yml`

## Data model

`Item` ─< `StockLevel` >─ `Location`, with `Movement` as the audit log.

An item's on-hand total is **always** the sum of its `StockLevel` rows — no
denormalised total is stored anywhere. Every balance change is written in the
same transaction as its `Movement` row, so the log and the balances cannot drift.

## Roles

| Role | Can |
| --- | --- |
| `USER` (clerk) | browse items and locations, record movements, view per-item history |
| `MANAGER` | everything above, plus create/edit/delete items and locations, the org-wide audit log, and the low-stock report |
| `ADMIN` | everything above, plus `/admin/settings` |

Roles are a hierarchy: `@Roles('MANAGER')` also admits an `ADMIN`.

Logins are **platform-owned**. `prisma/seed/seed.js` materialises one
`colossus_accounts` row and one `User` per `COLOSSUS_ACCOUNTS_JSON` entry, hashed
with `bcryptjs` exactly as `AuthService` verifies it. There are no demo
credentials in this repo and none are printed.

## API

Everything is under `/api`; the SPA's nginx proxies exactly that prefix, so the
browser never needs CORS in production. `/healthz` is deliberately outside the
prefix so a Kubernetes probe can reach the pod directly.

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/healthz`, `/api/health` | public (liveness — touches nothing) |
| GET | `/api/health/deep` | public (readiness — round-trips to Postgres) |
| POST | `/api/auth/login`, `/api/auth/signup` | public |
| GET | `/api/auth/me` | authenticated |
| GET | `/api/items`, `/api/items/:id`, `/api/items/:id/movements` | authenticated |
| POST/PATCH/DELETE | `/api/items`, `/api/items/:id` | MANAGER |
| GET | `/api/locations` | authenticated |
| POST/PATCH/DELETE | `/api/locations`, `/api/locations/:id` | MANAGER |
| POST | `/api/movements` | authenticated |
| GET | `/api/movements` | MANAGER |
| GET | `/api/reports/low-stock` | MANAGER |
| GET/PATCH | `/api/admin/settings` | ADMIN |

Interactive docs: `/api/docs`.

### Movements

`IN` credits a destination, `OUT` debits a source, `TRANSFER` does both. The
debit is a conditional update (`WHERE qty >= n`) rather than a read-then-write,
so two concurrent issues can never both pass the check and drive a balance
negative; the loser gets a `400` and the transaction rolls back, leaving neither
a balance change nor an audit entry.

### Errors

Validation failures and unique-constraint clashes share one envelope, so the SPA
has a single error shape to render:

```json
{ "statusCode": 400, "message": "Validation failed",
  "errors": [{ "field": "sku", "message": "must be unique" }] }
```

## Running it locally

```bash
docker compose up -d postgres          # Postgres 16 on :5432

cd backend
npm install
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_development
export JWT_SECRET=dev-secret
npx prisma migrate deploy
node prisma/seed/fixtures.js           # items, zones, opening balances
COLOSSUS_ACCOUNTS_JSON='[…]' node prisma/seed/seed.js   # logins (platform-injected in a deploy)
npm run start:dev                      # http://localhost:3000/api

cd ../frontend
npm install
npm start                              # http://localhost:4200 (proxies /api → :3000)
```

## Deploy notes

- `colossus.yaml` is the build manifest. The frontend's `outputDir`
  (`dist/frontend/browser`) must stay in step with `angular.json`'s
  `outputPath` and the `COPY` in `frontend/Dockerfile` — a mismatch yields a
  blank page that no source change can fix.
- The backend listens on `PORT` (default `3000`), which is what
  `frontend/nginx.conf` proxies to.
- `prisma/seed/fixtures.js` is idempotent and fronts the app process, so a pod
  restart never clobbers real balances and never crash-loops.
