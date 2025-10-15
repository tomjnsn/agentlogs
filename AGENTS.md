- Use `bun` instead of `npm` or `pnpm`.
- `bun run test` in the workspace root for unit tests
- `bun run lint` in the workspace root for linting
- `bun run format` in the workspace root for formatting
- `bun run typecheck` in the workspace root for running TypeScript checks

## Code Style

- Project uses Prettier with double quotes and semicolons (standard Prettier defaults)
- **IMPORTANT**: Always run `bun run format` before committing any code changes
- Run `bun run format:check` to verify formatting without making changes

## Logging

- All development logs (server, client, dev server) are collected in `logs/dev.log`
- Use `tail -f logs/dev.log` to monitor logs in real-time
- For logger architecture details, see `packages/shared/README.md`
