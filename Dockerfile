# syntax=docker/dockerfile:1

# Base image: Node 22 LTS with Corepack-managed Yarn 4.
FROM node:24.18.0-bookworm-slim AS base
ENV YARN_ENABLE_GLOBAL_CACHE=false
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
RUN corepack enable

# Dependencies. Includes the toolchain for native modules (better-sqlite3),
# in case prebuilt binaries are unavailable for the target platform.
FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

# Dev stage used by docker-compose: source is bind-mounted over /app at runtime.
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 3000
CMD ["yarn", "dev", "--host"]

# Build the production bundle (.output).
FROM deps AS build
COPY . .
RUN yarn build

# Production runtime: just the self-contained Nitro output, no package manager.
FROM base AS prod
ENV NODE_ENV=production
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3000
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]