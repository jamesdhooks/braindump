FROM node:20-alpine

RUN apk add --no-cache libc6-compat && corepack enable && corepack prepare pnpm@9.12.2 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/core/package.json packages/core/
COPY packages/claw/package.json packages/claw/

RUN pnpm install --filter @bd/api... --no-frozen-lockfile

COPY apps/api apps/api
COPY packages/core packages/core
COPY packages/claw packages/claw

ENV NODE_ENV=production
EXPOSE 3001
CMD ["pnpm", "--filter", "@bd/api", "start"]
