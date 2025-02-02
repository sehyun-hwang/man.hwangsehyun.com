# syntax=docker/dockerfile:1-labs
FROM node:22-alpine AS pnpm

WORKDIR /mnt
COPY --parents package.json pnpm-*.yaml assets/package.json browser/package.json browser/patches/*.patch src/package.json /mnt/

RUN corepack enable \
  && pnpm config set -g store-dir "$PWD/pnpm-store" \
  && pnpm install --prod --frozen-lockfile \
  && pnpm store prune

RUN pnpm deploy --filter stackedit -P stackedit-prod \
  && pnpm deploy --filter browser -P browser-prod

FROM hugomods/hugo:base

COPY --from=pnpm /mnt /mnt
