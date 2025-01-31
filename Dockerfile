# syntax=docker/dockerfile:1-labs
FROM node:22-alpine

WORKDIR /mnt
COPY --parents package.json pnpm-*.yaml assets/package.json browser/package.json browser/patches/*.patch src/package.json /mnt/

RUN corepack enable \
  && pnpm install --prod --frozen-lockfile

RUN pnpm --filter stackedit --prod deploy stackedit-prod
