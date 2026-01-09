- Use `bun` instead of `npm` or `pnpm`.
- `bun run test` in the workspace root for unit tests
- `bun run test:e2e` in the workspace root for e2e tests
- `bun run lint` in the workspace root for linting
- `bun run format` in the workspace root for formatting
- `bun run typecheck` in the workspace root for running TypeScript checks
- `bun vibeinsights` to run the CLI tool

## Code Style

- Project uses Prettier with double quotes and semicolons (standard Prettier defaults)
- Always run `bun run format` before committing any code changes

## Logging

- All development logs (server, client, dev server) are collected in `logs/dev.log`
- Use `tail -f logs/dev.log` to monitor logs in real-time
- For logger architecture details, see `packages/shared/README.md`
- Always use the project-specific logger module when adding logs (do not use `console.log`)

## Commits

- Use conventional commits (feat|fix|refactor|build|ci|chore|docs|style|perf|test).
- Do atomic and small commits.
