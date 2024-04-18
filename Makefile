comma:= ,
empty:=
space:= $(empty) $(empty)

PHONY: server server/docker

server: | hugo.yml hugo.generated.json
	hugo server $(subst $(space),$(comma),$|)

server/docker: | hugo.yml hugo.generated.json
	echo "Hugo configs $@"
	docker run -it --rm --pod nginx-pod \
		-v $$PWD:/src -v man.hwangsehyun.com-public:/src/public \
		--security-opt label=disable \
		-e HUGO_PARAMS_MICROCMS=4nPhw5spjauuCnl9KmDiZmsVTXfm36M9DFUy \
		hugomods/hugo:base \
		hugo server -b https://dev.hwangsehyun.com --liveReloadPort 443 --appendPort=false --config $(subst $(space),$(comma),$|)
