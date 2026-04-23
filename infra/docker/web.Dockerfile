FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat && corepack enable && corepack prepare pnpm@9.12.2 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/claw/package.json packages/claw/
RUN pnpm install --filter @bd/web... --no-frozen-lockfile
COPY apps/web apps/web
COPY packages/core packages/core
COPY packages/claw packages/claw
RUN pnpm --filter @bd/web build

FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.12.2 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/ /app/
EXPOSE 3000
CMD ["pnpm", "--filter", "@bd/web", "start"]
