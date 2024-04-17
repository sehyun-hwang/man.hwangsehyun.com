PHONY: dev
dev:
	docker run -it --rm --pod nginx-pod \
		-v $$PWD:/src -v man.hwangsehyun.com-public:/src/public \
		--security-opt label=disable \
		-e HUGO_PARAMS_MICROCMS=4nPhw5spjauuCnl9KmDiZmsVTXfm36M9DFUy \
		hugomods/hugo:base \
		hugo server -b https://dev.hwangsehyun.com --liveReloadPort 443 --appendPort=false