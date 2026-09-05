FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
# --include=dev is explicit: `nest build` lives in @nestjs/cli (a devDependency),
# so a base image that defaults npm to omit=dev would otherwise fail the build.
RUN npm ci --include=dev
COPY . .
# A dummy URL satisfies the generator; no database is reachable at build time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate
# nest build can exit 0 while emitting to dist/src/ instead of dist/ — assert the
# path the runtime CMD actually starts, so a bad tsconfig fails here, not in prod.
RUN npm run build \
    && test -f dist/main.js \
    || (echo 'ERROR: dist/main.js missing after build - check tsconfig rootDir' && exit 1)

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./
EXPOSE 3000
# Business fixtures are idempotent and never exit non-zero, so they can front the
# app process safely; platform logins are seeded by the migrate job (seed.js).
CMD ["sh", "-c", "node prisma/seed/fixtures.js; node dist/main"]
