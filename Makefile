.PHONY: test up down lint tf-validate jenkins

test:
	cd app && npm test

up:
	docker compose up -d --build --wait
	@echo "Console: http://localhost:8080"

down:
	docker compose down

tf-validate:
	terraform fmt -check -recursive infra
	for d in infra/bootstrap infra/stack; do terraform -chdir=$$d init -backend=false -input=false >/dev/null && terraform -chdir=$$d validate; done

lint:
	docker run --rm -i hadolint/hadolint hadolint --ignore DL3066 - < app/Dockerfile
	docker run --rm -v "$$PWD:/mnt" -w /mnt koalaman/shellcheck:stable scripts/*.sh

jenkins:
	docker compose -f jenkins/docker-compose.yml up -d --build
	@echo "Jenkins: http://localhost:8081"
