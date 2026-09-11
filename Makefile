REMOTE ?= origin
VERSION ?=

.PHONY: help release-server release-node release-java release-go check-release check-node-version check-java-version

help:
	@echo "Release commands require VERSION in X.Y.Z format and a clean, current main branch"
	@echo "  make release-server VERSION=1.0.1"
	@echo "  make release-node   VERSION=1.0.1"
	@echo "  make release-java   VERSION=1.0.1"
	@echo "  make release-go     VERSION=1.0.1"

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

define create_release_tag
	@tag="$(1)/v$(VERSION)"; \
		if git rev-parse -q --verify "refs/tags/$$tag" >/dev/null; then echo "Tag $$tag already exists locally"; exit 1; fi; \
		if git ls-remote --exit-code --tags "$(REMOTE)" "refs/tags/$$tag" >/dev/null 2>&1; then echo "Tag $$tag already exists on $(REMOTE)"; exit 1; fi; \
		git tag -a "$$tag" -m "toToggle $(1) v$(VERSION)"; \
		git push "$(REMOTE)" "$$tag"
endef

release-server: check-release
	$(call create_release_tag,server)

release-node: check-release check-node-version
	$(call create_release_tag,totoggle_node)

release-java: check-release check-java-version
	$(call create_release_tag,totoggle_java)

release-go: check-release
	$(call create_release_tag,totoggle_go)
