## Documentation

- Docs are in `docs/` using [Mintlify](https://mintlify.com)
- Changelog is in `docs/changelog.mdx`

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

## UI Components (shadcn)

- NEVER manually create shadcn components. Always use the shadcn CLI to download them.
- Run from packages/web: `bunx shadcn@latest add <component-name>`
- Example: `bunx shadcn@latest add data-table`

## Server Functions & Loaders

- **One server function per loader**: Each route loader should call exactly ONE server function that orchestrates all data fetching.
- **Use parent context for session**: Child routes should use `context.session` from `beforeLoad` instead of calling `getSession()` again.
- **Why**: Reduces network round-trips (1 RPC instead of N), keeps server-side logic together, and makes data flow easier to reason about.

```typescript
// ❌ Bad: Multiple server function calls from loader
loader: async ({ params }) => {
  const [invite, session, team] = await Promise.all([
    getInviteInfo({ data: params.code }), // RPC 1
    getSession(), // RPC 2
    getTeam(), // RPC 3
  ]);
  return { invite, session, team };
};

// ✅ Good: Single server function orchestrates everything
loader: ({ params }) => getJoinPageData({ data: params.code });

// In server-functions.ts:
export const getJoinPageData = createServerFn({ method: "GET" })
  .validator(z.object({ code: z.string() }))
  .handler(async ({ data }) => {
    const [invite, session, team] = await Promise.all([
      getInviteInfoInternal(data.code),
      getSessionInternal(),
      getTeamInternal(),
    ]);
    return { invite, session, team, code: data.code };
  });
```

### Using Parent Context (for session checks)

```typescript
// ❌ Bad: Fetching session again when parent already has it
beforeLoad: async () => {
  const session = await getSession(); // Redundant RPC!
  if (!session) throw redirect({ to: "/" });
};

// ✅ Good: Use session from parent route's context
beforeLoad: ({ context }) => {
  if (!context.session) throw redirect({ to: "/" });
};
```

## Releasing the CLI

1. Bump version in `packages/cli/package.json` and commit: `cli: Release version X.Y.Z`
2. Push to main
3. Create and push a tag: `git tag cli-vX.Y.Z && git push origin cli-vX.Y.Z`
