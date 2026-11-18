# syntax=docker/dockerfile:1-labs
FROM --platform=${BUILDPLATFORM} node:26.13.1-alpine AS pnpm

WORKDIR /mnt
COPY --parents package.json .npmrc pnpm-*.yaml assets/package.json browser/package.json src/package.json cdk/package.json /mnt/

RUN npm install --global pnpm@12.21.0 \
  && pnpm config set store-dir "$PWD/pnpm-store" \
  && pnpm install --prod --frozen-lockfile

RUN pnpm deploy --filter @man-hwangsehyun-com/stackedit -P stackedit-prod \
  && pnpm deploy --filter @man-hwangsehyun-com/browser -P browser-prod \
  && pnpm store prune

FROM hugomods/hugo:base-0.165.0@sha256:e608e2ceb59b9a0270e5f4c88a0aa453fd21d9e95ac62acc887eb87e8d0dafb7

ARG TARGETARCH
ARG HUGO_VERSION=0.170.0
RUN wget -q "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-${TARGETARCH}.tar.gz" -O /tmp/hugo.tar.gz \
  && wget -q "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_${HUGO_VERSION}_checksums.txt" -O /tmp/hugo-checksums.txt \
  && grep " hugo_extended_${HUGO_VERSION}_linux-${TARGETARCH}.tar.gz$" /tmp/hugo-checksums.txt | sed 's|hugo_extended_.*|/tmp/hugo.tar.gz|' | sha256sum -c - \
  && tar -xzf /tmp/hugo.tar.gz -C /usr/bin hugo \
  && rm /tmp/hugo.tar.gz /tmp/hugo-checksums.txt

COPY --from=pnpm /mnt /mnt
