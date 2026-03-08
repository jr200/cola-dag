.PHONY: dev build preview clean test lint lint-fix bump release update install docker

VERSION := $(shell node -p "require('./package.json').version")

install:
	npm install

dev:
	npx vite

build:
	npx vite build

preview:
	npx vite preview

test:
	npx vitest run

lint:
	npx eslint . --ignore-pattern dist --ignore-pattern node_modules

lint-fix:
	npx eslint . --fix --ignore-pattern dist --ignore-pattern node_modules

docker:
	docker build -t cola-dag:local .

clean:
	rm -rf dist node_modules

update:
	npx npm-check-updates -u
	npm install --package-lock-only

bump: lint
	@echo "Usage: make bump v=patch|minor|major"
	npm version $(v) --no-git-tag-version
	npm install --package-lock-only

release:
	@if git rev-parse "v$(VERSION)" >/dev/null 2>&1; then \
		echo "Tag v$(VERSION) already exists. Bump the version in package.json first."; \
		exit 1; \
	fi
	gh release create "v$(VERSION)" --generate-notes --title "v$(VERSION)"
