comma:= ,
empty:=
space:= $(empty) $(empty)

BUCKET := man.hwangsehyun.com

.PHONY: server server/docker

server: | hugo.yml hugo.generated.json
	hugo server --config $(subst $(space),$(comma),$|)

server/docker: | hugo.yml hugo.generated.json
	echo "Hugo configs $@"
	docker run -it --rm --pod nginx-pod \
		-v $$PWD:/src -v man.hwangsehyun.com-public:/src/public \
		--security-opt label=disable \
		-e HUGO_PARAMS_MICROCMS=4nPhw5spjauuCnl9KmDiZmsVTXfm36M9DFUy \
		hugomods/hugo:base \
		hugo server -b https://dev.hwangsehyun.com --liveReloadPort 443 --appendPort=false --config $(subst $(space),$(comma),$|)

.PHONY: build
build: | hugo.yml hugo.generated.json
	hugo -b https://d2dkq8t3u28pba.cloudfront.net --config $(subst $(space),$(comma),$|)

.PHONY: deploy
deploy:
	aws s3 sync public s3://${BUCKET}

	# https://stackoverflow.com/a/66467783/3389370
	python deploy_index_html.py

	aws cloudfront create-invalidation \
		--distribution-id E2JWAONP1BG780 \
		--paths '/*'