ARG NODE_MODULES_IMAGE
FROM ${NODE_MODULES_IMAGE} AS node-modules-image

FROM node:26.13.1-bookworm-slim AS node-runtime

FROM public.ecr.aws/codebuild/amazonlinux-aarch64-lambda-standard:nodejs22

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
ENV PATH="/usr/local/bin:${PATH}"
RUN node --version && test "$(node -p 'process.arch')" = arm64

COPY --from=node-modules-image /mnt/stackedit-prod /cofa_lambda_docker_build/stackedit-prod
