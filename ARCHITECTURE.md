# Architecture

## Requested stack
- `enterprise` — Angular 19 (standalone) + NestJS 11 + tRPC + Prisma + PostgreSQL

## Status
Project directory contained only a `README.md` stub (`# inventory-05`) and `.github/` before this run — no existing platform code was detected. The `enterprise` template was newly scaffolded in full.

## Layout
- `frontend/` — Angular 19 SPA (Angular CLI project name: `frontend`). Entry: `src/app/app.component.ts` (root, carries `data-testid="app-ready"`), routes in `src/app/app.routes.ts`, demo `HomeComponent` at `src/app/home/home.component.ts` calling the tRPC `users` router.
- `backend/` — NestJS 11 API. `AppModule` wires `ConfigModule`, `PrismaModule`, `TrpcAppModule`, `HealthModule`. tRPC routers live under `src/<feature>/*.router.ts` (see `src/users/users.router.ts`); REST-style Nest controllers (e.g. `src/health/health.controller.ts`) coexist for infra endpoints. Prisma schema/client under `backend/prisma/`.
- `.pipeline/surface.json` — generated contract of routes, component selectors, and `data-testid`s for the test_spec agent and Playwright generator. Regenerate/extend as features are added — never let it drift from the actual source.
- `.colossus-acceptance.json` — post-deploy render-gate contract (`ready_testid`, `expect_text`, `reject_signatures`). The coder must fill in `expect_text` once the real front page content is known, and must never remove `data-testid="app-ready"` from `app.component.ts`.
- `colossus.yaml` — build manifest read by deploy agents (framework, output dir, ports). Do not delete.
- `docker-compose.yml` — local Postgres + services for dev.

## Plan note
The technical plan attached to this run (StockRoom: NestJS + REST + JWT auth + Prisma 7.10.0, Angular 21) names different specific versions/patterns than this platform's fixed `enterprise` template (Angular 19, NestJS 11, tRPC, Prisma ^6.16, bcryptjs). Per the stack contract, the template's stack is authoritative — build the plan's *features* (auth, items/locations/movements, reports, RBAC) on top of this scaffolded structure rather than introducing a different framework/ORM/version set.

## Next steps
1. `cd backend && npm install` (or let the Docker build's prebaked-seed path handle it if deps stay verbatim).
2. `cd frontend && npm install` — keep `dependencies`/`devDependencies` in `frontend/package.json` byte-for-byte identical to the template unless a new feature strictly requires an addition; any drift disables the prebaked `node_modules` seed in the frontend Dockerfile.
3. Configure `DATABASE_URL` (see `docker-compose.yml` for local Postgres) and run Prisma migrations/generate from `backend/`.
4. `docker-compose up` for local end-to-end dev, or run `frontend`/`backend` separately (`npm run start`).
5. Extend `.pipeline/surface.json` and `.colossus-acceptance.json`'s `expect_text` as real routes/components/testids are added.

## Template sources
- `template_dir`: `/app/scaffold-templates`
- Copied: `template-enterprise/` → project root (`frontend/`, `backend/`, `.pipeline/`, `docker-compose.yml`, `.gitignore`)
