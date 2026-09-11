REMOTE ?= origin
VERSION ?=

.PHONY: help install-hooks sync-release-metadata next-server next-node next-java next-go release-server release-node release-java release-go release-component check-release check-component-version check-node-version check-java-version create-release-tag

help:
	@echo "Release commands calculate SemVer from Conventional Commits and require a clean, current main branch"
	@echo "  make install-hooks"
	@echo "  make sync-release-metadata"
	@echo "  make next-server"
	@echo "  make release-server"
	@echo "  make release-node VERSION=1.0.1"
	@echo "  make release-java VERSION=1.0.1"
	@echo "  make release-go VERSION=1.0.1"

install-hooks:
	@git config core.hooksPath .githooks
	@echo "Git hooks installed"

sync-release-metadata:
	@./scripts/sync-release-metadata.sh

next-server:
	@./scripts/next-version.sh server

next-node:
	@./scripts/next-version.sh node

next-java:
	@./scripts/next-version.sh java

next-go:
	@./scripts/next-version.sh go

check-release:
	@test -n "$(VERSION)" || { echo "VERSION is required"; exit 1; }
	@printf '%s\n' "$(VERSION)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$' || { echo "VERSION must use the X.Y.Z format"; exit 1; }
	@test -z "$$(git status --porcelain)" || { echo "Working tree must be clean"; exit 1; }
	@git fetch "$(REMOTE)" main --tags
	@test "$$(git rev-parse HEAD)" = "$$(git rev-parse "$(REMOTE)/main")" || { echo "HEAD must match $(REMOTE)/main before creating a release"; exit 1; }

check-node-version:
	@actual="$$(node -p 'require("./totoggle_node/package.json").version')"; \
		test "$$actual" = "$(VERSION)" || { echo "Node package version is $$actual, expected $(VERSION)"; exit 1; }

check-java-version:
	@actual="$$(sed -nE 's/^version = "([^"]+)"/\1/p' totoggle_java/build.gradle.kts)"; \
		test "$$actual" = "$(VERSION)" || { echo "Java package version is $$actual, expected $(VERSION)"; exit 1; }

check-component-version:
	@case "$(COMPONENT)" in \
		node) $(MAKE) check-node-version VERSION="$(VERSION)" ;; \
		java) $(MAKE) check-java-version VERSION="$(VERSION)" ;; \
		server|go) ;; \
		*) echo "Unknown component: $(COMPONENT)"; exit 2 ;; \
	esac

create-release-tag:
	@tag="$(PREFIX)/v$(VERSION)"; \
		if git rev-parse -q --verify "refs/tags/$$tag" >/dev/null; then echo "Tag $$tag already exists locally"; exit 1; fi; \
		if git ls-remote --exit-code --tags "$(REMOTE)" "refs/tags/$$tag" >/dev/null 2>&1; then echo "Tag $$tag already exists on $(REMOTE)"; exit 1; fi; \
		git tag -a "$$tag" -m "toToggle $(COMPONENT) v$(VERSION)"; \
		git push "$(REMOTE)" "$$tag"

release-component:
	@version="$(VERSION)"; \
		if [ -z "$$version" ]; then version="$$(./scripts/next-version.sh "$(COMPONENT)")"; fi; \
		$(MAKE) check-release VERSION="$$version" && \
		$(MAKE) check-component-version COMPONENT="$(COMPONENT)" VERSION="$$version" && \
		$(MAKE) create-release-tag COMPONENT="$(COMPONENT)" PREFIX="$(PREFIX)" VERSION="$$version"

release-server:
	@$(MAKE) release-component COMPONENT=server PREFIX=server VERSION="$(VERSION)"

release-node:
	@$(MAKE) release-component COMPONENT=node PREFIX=totoggle_node VERSION="$(VERSION)"

release-java:
	@$(MAKE) release-component COMPONENT=java PREFIX=totoggle_java VERSION="$(VERSION)"

release-go:
	@$(MAKE) release-component COMPONENT=go PREFIX=totoggle_go VERSION="$(VERSION)"
