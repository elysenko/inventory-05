FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

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
