# syntax=docker/dockerfile:1-labs
FROM --platform=${BUILDPLATFORM} node:22-alpine AS pnpm

WORKDIR /mnt
COPY --parents package.json .npmrc pnpm-*.yaml patches/*.patch assets/package.json browser/package.json src/package.json /mnt/

RUN corepack enable \
  && pnpm config set store-dir "$PWD/pnpm-store" \
  && pnpm install --prod --frozen-lockfile

RUN pnpm deploy --filter stackedit -P stackedit-prod \
  && pnpm deploy --filter browser -P browser-prod \
  && pnpm store prune

FROM hugomods/hugo:base

COPY --from=pnpm /mnt /mnt
