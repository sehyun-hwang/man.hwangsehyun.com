BUCKET := man.hwangsehyun.com
SUBMODULES := $(wildcard themes/*)
DOCKER_CLI=nerdctl

.PHONY: secret
secret: cloudant.env config/_default/params.json
cloudant.env config/_default/params.json: src/bin/secret.js
	node $<

.PHONY: stackedit
stackedit: cloudant.env | src
	node --env-file $< src

$(SUBMODULES):
	git submodule update --init

.PHONY: server server/ec2 server/docker
server: config/_default/params.json | $(SUBMODULES)
	hugo server -M
server/docker: config/_default/params.json | $(SUBMODULES)
	${DOCKER_CLI} run -it --rm \
		--net host \
		-v $$PWD:/src \
		hugomods/hugo:base \
		hugo server -M
server/ec2: | $(SUBMODULES)
	${DOCKER_CLI} run -it --rm --pod nginx-pod \
		-v $$PWD:/src -v man.hwangsehyun.com-public:/src/public \
		--security-opt label=disable \
		hugomods/hugo:base \
		hugo server -b https://dev.hwangsehyun.com --liveReloadPort 443 --appendPort=false

.PHONY: browser
browser: assets/image/index.webp public/index.pdf
assets/image/index.webp: browser/screenshot-index.js
	cat $< \
		| ${DOCKER_CLI} run -i --rm \
			-v $$PWD/browser/lib:/usr/src/app/lib:ro \
			ghcr.io/browserless/chromium \
			node --input-type module > $@
public:
	mkdir -p $@
public/index.pdf: browser/print-pdf.js public/index.json | public

	${DOCKER_CLI} run --rm \
		-e DEBUG="puppeteer:*" \
		-v $$PWD/public:/usr/src/app/public -v $$PWD/browser:/usr/src/app/browser:ro \
		ghcr.io/browserless/chromium \
		node $< ${PDF_HTML_PATHS} > $@

	which open && open $@ || true

.PHONY: build build/ec2
build: public/index.json
public/index.json: | $(SUBMODULES)
	hugo -b https://man.hwangsehyun.com
build/ec2: | $(SUBMODULES)
	hugo -b https://www.hwangsehyun.com/man.hwangsehyun.com/public

.PHONY: gitleaks eslint scan
gitleaks:
	gitleaks detect -v
	gitleaks detect --no-git -v
eslint:
	cd src && yarn lint
scan: gitleaks eslint

.PHONY: deploy
deploy:
	aws s3 sync public s3://${BUCKET}

	# https://stackoverflow.com/a/66467783/3389370
	poetry run python deploy_index_html.py

	aws cloudfront create-invalidation \
		--distribution-id E2JWAONP1BG780 \
		--paths '/*'
