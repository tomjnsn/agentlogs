## Setup & Tooling

- Use Bun 1.3.x: install deps with `bun install` from the repo root.
- Workspace-aware commands run from root; prefer `bun run --filter <path> <script>` for package-specific scripts.
- Type checking uses `tsgo`; formatting uses `oxfmt`; linting uses `oxlint`.

## Commands

- `bun run check` — runs formatting check, lint, and workspace `check` scripts (tsgo) in parallel
- `bun run lint` — runs `oxlint` with `--fix --deny-warnings` across the repo
- `bun run format` — formats with `oxfmt` and then lint-fixes
- `bun run test:e2e` — runs e2e tests for CLI package
- `bun vibeinsights` — run the CLI tool

## Code Style

- TypeScript/ESM throughout; avoid default exports for shared modules
- Follow linted defaults: 2-space indentation via oxfmt, 120 char print width
- Always run `bun run format` before committing (auto-runs via pre-commit hook)

## Logging

- All development logs collected in `logs/dev.log`
- Use `tail -f logs/dev.log` to monitor logs in real-time
- Always use the project-specific logger module (not `console.log`)

## Commits

- Use conventional commits: `<type>(<scope>): <message>`
- Types: feat|fix|refactor|build|ci|chore|docs|style|perf|test
- Do atomic and small commits
- Capitalize the first letter of the commit message
