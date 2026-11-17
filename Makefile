BUCKET := man.hwangsehyun.com
SUBMODULES := $(wildcard themes/*)
DOCKER_CLI ?= docker
HUGO ?= hugo
HUGO_IMAGE ?= man-hwangsehyun-com-toolchain

.PHONY: secret
secret: cloudant.env config/_default/params.json
cloudant.env config/_default/params.json: src/bin/secret.js
	node $<

.PHONY: stackedit
stackedit: cloudant.env | src
	node --env-file $< src

$(SUBMODULES):
	git submodule update --init

.PHONY: prepare-hugo toolchain
prepare-hugo:
	node src/hugo-content.js
toolchain:
	${DOCKER_CLI} build -t ${HUGO_IMAGE} .

.PHONY: server server/ec2 server/docker
server: config/_default/params.json prepare-hugo | $(SUBMODULES)
	${HUGO} server -M
server/docker: config/_default/params.json prepare-hugo | $(SUBMODULES)
	${DOCKER_CLI} run -it --rm \
		--net host \
		-v $$PWD:/src \
		${HUGO_IMAGE} \
		${HUGO} server -M
server/ec2: prepare-hugo | $(SUBMODULES)
	${DOCKER_CLI} run -it --rm --pod nginx-pod \
		-v $$PWD:/src -v man.hwangsehyun.com-public:/src/public \
		--security-opt label=disable \
		${HUGO_IMAGE} \
		${HUGO} server -b https://dev.hwangsehyun.com --liveReloadPort 443 --appendPort=false

.PHONY: browser
browser: assets/image/index.webp public/index.pdf
assets/image/index.webp: browser/screenshot-index.js
	node $< > $@
public:
	mkdir -p $@
public/index.pdf: browser/print-pdf.js public/index.json | public

	node $< ${PDF_HTML_PATHS} > $@.tmp && mv $@.tmp $@


.PHONY: build build/ec2
build: public/index.json
public/index.json: prepare-hugo | $(SUBMODULES)
	${HUGO} -b https://man.hwangsehyun.com
build/ec2: prepare-hugo | $(SUBMODULES)
	${HUGO} -b https://www.hwangsehyun.com/man.hwangsehyun.com/public

.PHONY: gitleaks eslint scan
gitleaks:
	gitleaks detect -v
	gitleaks detect --no-git -v
eslint:
	pnpm --filter @man-hwangsehyun-com/stackedit lint
scan: gitleaks eslint

.PHONY: deploy
deploy:
	aws s3 sync public s3://${BUCKET}

	# https://stackoverflow.com/a/66467783/3389370
	uv run --locked python deploy_index_html.py

	aws cloudfront create-invalidation \
		--distribution-id E2JWAONP1BG780 \
		--paths '/*'
