# Contributing to ToToggle

Thanks for your interest in ToToggle. This is a small, actively-maintained monorepo (Go server +
3 client libraries) — here's how to propose a change.

## Direct commits to `main`

Reserved for the project maintainer. Everyone else contributes through a pull request — `main`
is branch-protected and requires an approved PR from anyone without write access.

## How to contribute

1. **Have an idea, found a bug, or want a new feature?** [Open an issue](https://github.com/manorfm/toToggles/issues/new)
   first, describing what you found or want to change — especially before starting non-trivial
   work, so we can agree on the approach before you spend time on it.
2. **Ready to submit a change?** Fork the repo, branch off `main`, and open a pull request. Small
   fixes/docs typos can skip straight to a PR without an issue first.
3. Each component in this monorepo is independent (own stack, own tests, own CI workflow — see
   the root [README](README.md#-architecture)). Only touch what you need to for your change.
4. Make sure the relevant test suite passes before opening the PR:
   ```bash
   cd server && go test ./...              # Go server
   cd totoggle_java && ./gradlew test      # Kotlin/Java client
   cd totoggle_go && go test ./...         # Go client
   cd totoggle_node && npm test            # Node/TypeScript client
   ```
5. CI runs automatically on the PR (only the workflows for the directories you touched). All
   checks must pass, and the PR needs at least one approval, before it can be merged.

## Where things live

- API contract: [`docs/rest-flow.md`](docs/rest-flow.md) — treat it as the source of truth when
  changing anything that touches the public API.
- Backend architecture (Go server): [`server/CLAUDE.md`](server/CLAUDE.md).
- Frontend (`server/web/`): still being rewritten — see the note at the top of the root
  [README](README.md).

## License

By contributing, you agree that your contribution is licensed under the same
[ToToggle License 1.0](LICENSE) as the rest of the project.
