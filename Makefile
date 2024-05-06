BUCKET := man.hwangsehyun.com

.PHONY: server server/ec2 server/docker
server:
	hugo server
server/docker:
	docker run -it --rm \
		--net host \
		-v $$PWD:/src \
		-e HUGO_PARAMS_MICROCMS=4nPhw5spjauuCnl9KmDiZmsVTXfm36M9DFUy \
		hugomods/hugo:base \
		hugo server
server/ec2:
	docker run -it --rm --pod nginx-pod \
		-v $$PWD:/src -v man.hwangsehyun.com-public:/src/public \
		--security-opt label=disable \
		-e HUGO_PARAMS_MICROCMS=4nPhw5spjauuCnl9KmDiZmsVTXfm36M9DFUy \
		hugomods/hugo:base \
		hugo server -b https://dev.hwangsehyun.com --liveReloadPort 443 --appendPort=false

.PHONY: build build/ec2
build:
	hugo -b https://d2dkq8t3u28pba.cloudfront.net
build/ec2:
	hugo -b https://www.hwangsehyun.com/man.hwangsehyun.com/public

.PHONY: deploy
deploy:
	aws s3 sync public s3://${BUCKET}

	# https://stackoverflow.com/a/66467783/3389370
	python deploy_index_html.py

	aws cloudfront create-invalidation \
		--distribution-id E2JWAONP1BG780 \
		--paths '/*'