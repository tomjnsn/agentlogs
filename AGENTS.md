## Autonomous Workflow

### Session Start

1. Read `.claude/progress.txt` for current state
2. Read `features.json` for task list
3. Find first feature with `"status": "pending"`

### Implementation Loop

For each feature:

1. Mark status `"in_progress"`
2. Implement the feature
3. Run verification command from features.json
4. Parallel review (3 agents check quality)
5. Fix issues from review
6. Re-verify
7. If pass: commit, mark `"complete"`
8. If fail: debug and retry (NEVER skip)

### Rules

- ONE feature at a time
- NEVER skip verification
- NEVER mark complete without passing
- Commit after each feature

---

## Setup & Tooling

- Use Bun 1.3.x: install deps with `bun install` from the repo root.
- Workspace-aware commands run from root; prefer `bun run --filter <path> <script>` for package-specific scripts.
- Type checking uses `tsgo`; formatting uses `oxfmt`; linting uses `oxlint`.

## Commands

- `bun run check` — runs formatting check, lint, and workspace `check` scripts (tsgo) in parallel
- `bun run lint` — runs `oxlint` with `--fix --deny-warnings` across the repo
- `bun run format` — formats with `oxfmt` and then lint-fixes
- `bun run test:e2e` — runs e2e tests for CLI package
- `bun agentlogs` — run the CLI tool

## Code Style

- TypeScript/ESM throughout; avoid default exports for shared modules
- Follow linted defaults: 2-space indentation via oxfmt, 120 char print width
- Always run `bun run format` before committing (auto-runs via pre-commit hook)

## Migrations

- Do not create .sql files yourself. Always use `bun db:generate` to generate them.
- Run migrations locally using `bun db:migrate`

## Logging

- All development logs collected in `logs/dev.log`
- Use `tail -f logs/dev.log` to monitor logs in real-time
- Always use the project-specific logger module (not `console.log`)

## Commits

- Do atomic and small commits
- Capitalize the first letter of the commit message
- Prefix the commit with the package name or area if necessary, e.g. web,plugin,shared,ci
