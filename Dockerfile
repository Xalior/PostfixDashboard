# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# 1) deps — install all node_modules (dev + prod) for the build stage
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN \
  if [ -f package-lock.json ]; then npm ci; \
  else npm install; \
  fi

# ---------------------------------------------------------------------------
# 2) builder — compile the Next.js app
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder env so modules that read env at import time during `next build`
# don't crash. Runtime values come from the container's real environment.
ENV SESSION_SECRET=build-time-placeholder-not-used-at-runtime-xxxxxxxxxxxxxxxx
ENV DB_USER=placeholder
ENV DB_PASSWORD=placeholder
ENV DB_NAME=placeholder

RUN npm run build

# Bundle the management CLI into a single self-contained file so it ships inside
# the lean runner image and runs with plain `node` (no tsx/source/devdeps).
RUN npm run build:cli

# Generate the schema SQL so `cli init` can create the schema on a virgin DB.
RUN npm run db:generate

# ---------------------------------------------------------------------------
# 3) runner — lean runtime image using Next's standalone output
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache tini \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && printf '#!/bin/sh\nexec node /app/cli.cjs "$@"\n' > /usr/local/bin/pfd-cli \
  && chmod +x /usr/local/bin/pfd-cli \
  && printf '#!/bin/sh\nexec pfd-cli "$@"\n' > /usr/local/bin/cli \
  && chmod +x /usr/local/bin/cli

# Next.js standalone output already contains only the minimal node_modules
# needed to run the compiled server.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Embedded management CLI — `docker exec <container> pfd-cli <module> <task> ...`
COPY --from=builder --chown=nextjs:nodejs /app/dist/cli.cjs ./cli.cjs
# Schema SQL for `cli init` (virgin-DB bootstrap)
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

USER nextjs
EXPOSE 3000

# tini reaps zombies and forwards signals cleanly.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

# ---------------------------------------------------------------------------
# 4) tools — image used for one-shot ops (db:seed, db:push)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS tools
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["npm", "run", "db:seed"]
