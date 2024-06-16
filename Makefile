BUCKET := man.hwangsehyun.com

.PHONY: secret
secret: cloudant.env config/_default/params.json
cloudant.env config/_default/params.json: secret.mjs
	node $<

.PHONY: stackedit
stackedit: cloudant.env | src
	node --env-file $< src

.PHONY: server server/ec2 server/docker
server: config/_default/params.json
	hugo server
server/docker: config/_default/params.json
	docker run -it --rm \
		--net host \
		-v $$PWD:/src \
		hugomods/hugo:base \
		hugo server
server/ec2:
	docker run -it --rm --pod nginx-pod \
		-v $$PWD:/src -v man.hwangsehyun.com-public:/src/public \
		--security-opt label=disable \
		hugomods/hugo:base \
		hugo server -b https://dev.hwangsehyun.com --liveReloadPort 443 --appendPort=false

.PHONY: build build/ec2
build:
	hugo -b https://d2dkq8t3u28pba.cloudfront.net
build/ec2:
	hugo -b https://www.hwangsehyun.com/man.hwangsehyun.com/public

.PHONY: gitleaks eslint scan
gitleaks:
	gitleaks detect --no-git -v .
eslint:
	cd src && yarn lint
scan: gitleaks eslint

.PHONY: deploy
deploy:
	aws s3 sync public s3://${BUCKET}

	# https://stackoverflow.com/a/66467783/3389370
	python deploy_index_html.py

	aws cloudfront create-invalidation \
		--distribution-id E2JWAONP1BG780 \
		--paths '/*'
