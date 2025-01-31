ARG NODE_MODULES_IMAGE
FROM ${NODE_MODULES_IMAGE} AS node-modules-image

FROM public.ecr.aws/codebuild/amazonlinux-aarch64-lambda-standard:nodejs20

COPY --from=node-modules-image /mnt/stackedit-prod /cofa_lambda_docker_build/stackedit-prod
