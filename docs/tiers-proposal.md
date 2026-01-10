# Pricing Tier Implementation Plan

## Overview
Add pricing tiers to vibeinsights: **Free** (unlimited open-source, 10 commits/month private), **Pro** (unlimited), **Enterprise** (TBD).

## Key Decisions
- **Open-source detection**: HTTP HEAD to `https://github.com/{owner}/{repo}` (200 = public, 404 = private)
- **Billing**: Polar.sh with BetterAuth plugin (`@polar-sh/better-auth`)
- **Limit behavior**: Hard block at 10 commits for free tier on private repos
- **Reset cycle**: Calendar month (1st of each month)

---

## Implementation Steps

### 1. Install Polar Dependencies

```bash
bun add @polar-sh/better-auth @polar-sh/sdk
```

### 2. Polar Dashboard Setup

1. Create products in Polar dashboard:
   - **Pro Monthly** (e.g., $19/mo) → note the `productId`
   - **Pro Annual** (e.g., $190/yr) → note the `productId`
2. Create webhook endpoint pointing to `https://vibeinsights.dev/api/polar/webhooks`
3. Get webhook secret and access token

### 3. Environment Variables

```bash
POLAR_ACCESS_TOKEN=your_access_token
POLAR_WEBHOOK_SECRET=your_webhook_secret
```

### 4. Database Schema (`packages/web/src/db/schema.ts`)

Add two tables (Polar handles subscriptions, we track usage):

```typescript
// monthlyUsage - track commits per month (calendar month reset)
export const monthlyUsage = sqliteTable("monthly_usage", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  periodMonth: text("period_month").notNull(),  // "YYYY-MM" format
  privateCommitCount: integer("private_commit_count").notNull().default(0),
  publicCommitCount: integer("public_commit_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })...
}, (table) => ({
  userPeriodIdx: uniqueIndex("idx_user_period").on(table.userId, table.periodMonth),
}));

// repoVisibilityCache - cache GitHub public/private check (24h TTL)
export const repoVisibilityCache = sqliteTable("repo_visibility_cache", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  repoIdentifier: text("repo_identifier").notNull().unique(),  // "github.com/owner/repo"
  isPublic: integer("is_public", { mode: "boolean" }).notNull(),
  checkedAt: integer("checked_at", { mode: "timestamp" }).notNull(),
  lastHttpStatus: integer("last_http_status"),
});
```

Note: Polar plugin auto-creates `polar_customer` table via BetterAuth.

### 5. Configure BetterAuth with Polar (`packages/web/src/lib/auth.ts`)

```typescript
import { polar, checkout, portal, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";

const polarClient = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
  server: process.env.NODE_ENV === "production" ? "production" : "sandbox",
});

export const auth = betterAuth({
  // ... existing config ...
  plugins: [
    // ... existing plugins ...
    polar({
      client: polarClient,
      createCustomerOnSignUp: true,  // Auto-create Polar customer
      use: [
        checkout({
          products: [
            { productId: "YOUR_PRO_MONTHLY_ID", slug: "pro-monthly" },
            { productId: "YOUR_PRO_ANNUAL_ID", slug: "pro-annual" },
          ],
          successUrl: "/settings/billing?success=true",
          authenticatedUsersOnly: true,
        }),
        portal(),  // Customer portal for managing subscriptions
        webhooks({
          secret: process.env.POLAR_WEBHOOK_SECRET,
          onSubscriptionCreated: async (payload) => {
            // Log or sync subscription data
          },
          onSubscriptionCanceled: async (payload) => {
            // Handle cancellation
          },
        }),
      ],
    }),
  ],
});
```

### 6. Update Auth Client (`packages/web/src/lib/auth-client.ts`)

```typescript
import { polarClient } from "@polar-sh/better-auth/client";

export const authClient = createAuthClient({
  plugins: [polarClient()],
});
```

### 7. Repo Visibility Service (`packages/web/src/lib/repo-visibility.ts`)

New file:
- `parseGitHubRepo(repoIdentifier)` - Extract owner/repo from paths like `github.com/owner/repo`, SSH URLs, HTTPS URLs
- `checkGitHubVisibility(owner, repo)` - HTTP HEAD request with 5s timeout
- `getRepoVisibility(db, repoIdentifier)` - Main function with 24h cache lookup/update

### 8. Quota Service (`packages/web/src/lib/quota.ts`)

New file:
- `TIER_LIMITS` constant: `{ free: { privateCommitsPerMonth: 10 }, pro: { privateCommitsPerMonth: Infinity }, ... }`
- `getCurrentPeriodMonth()` - Returns "YYYY-MM" format
- `getUserTier(authClient, userId)` - Check Polar subscriptions to determine tier
- `getOrCreateMonthlyUsage(db, userId, periodMonth)` - Get or create usage record
- `checkQuota(db, authClient, userId, isPublicRepo)` - Returns `{ canCommit, tier, used, limit, remaining }`
- `incrementCommitCount(db, userId, isPublicRepo)` - Increment appropriate counter

```typescript
// Get tier from Polar subscriptions
async function getUserTier(userId: string): Promise<"free" | "pro" | "enterprise"> {
  const subscriptions = await authClient.customer.subscriptions.list({
    query: { active: true }
  });

  if (subscriptions?.data?.length > 0) {
    // Check if any active subscription matches pro/enterprise products
    return "pro";
  }
  return "free";
}
```

### 9. Update `/api/commit-track` (`packages/web/src/routes/api/commit-track.ts`)

Before inserting commit:
```typescript
// 1. Check repo visibility
const visibility = await getRepoVisibility(db, repo_path);

// 2. Check quota
const quota = await checkQuota(db, userId, visibility.isPublic);
if (!quota.canCommit) {
  return json({
    error: "quota_exceeded",
    message: "Monthly commit limit reached. Upgrade to Pro.",
    quota: { tier, used, limit, remaining, periodMonth }
  }, { status: 403 });
}

// 3. After successful insert, increment counter
await incrementCommitCount(db, userId, visibility.isPublic);

// 4. Return success with quota info
return json({ success: true, quota: { ... } });
```

### 10. Update CLI Hook (`packages/cli/src/commands/hook.ts`)

In `trackCommit()` function, handle 403 response:
```typescript
if (response.status === 403) {
  const body = await response.json();
  if (body.error === "quota_exceeded") {
    // Log warning (not blocking git commit)
    logger.warn("Commit tracking blocked: quota exceeded", { ... });
    // Show user-friendly message to stderr
    console.error(`\n⚠️  Vibe Insights: ${body.message}`);
    console.error(`   Upgrade at: https://vibeinsights.dev/settings/billing\n`);
    return; // Don't block the git commit itself
  }
}
```

### 11. Add `/api/quota` Endpoint (`packages/web/src/routes/api/quota.ts`)

New endpoint for CLI status and dashboard:
- GET returns: `{ tier, periodMonth, privateCommitsUsed, publicCommitsUsed, privateCommitsLimit, remainingCommits }`

### 12. Dashboard & Billing UI

**Server function** (`packages/web/src/lib/server-functions.ts`):
- Add `getQuota()` server function

**Usage Card** (`packages/web/src/components/usage-card.tsx`):
- Show tier badge, progress bar for private commits, upgrade CTA when at limit

**Dashboard** (`packages/web/src/routes/index.tsx`):
- Add `getQuota()` to loader, render `<UsageCard />`

**Billing Page** (`packages/web/src/routes/settings/billing.tsx`):
- Show current plan, usage stats
- "Upgrade to Pro" button → `authClient.checkout({ slug: "pro-monthly" })`
- "Manage Subscription" button → `authClient.customer.portal()`

---

## Files to Modify/Create

| Action | File |
|--------|------|
| Modify | `packages/web/src/db/schema.ts` |
| Modify | `packages/web/src/lib/auth.ts` |
| Modify | `packages/web/src/lib/auth-client.ts` |
| Create | `packages/web/src/lib/repo-visibility.ts` |
| Create | `packages/web/src/lib/quota.ts` |
| Modify | `packages/web/src/routes/api/commit-track.ts` |
| Create | `packages/web/src/routes/api/quota.ts` |
| Modify | `packages/cli/src/commands/hook.ts` |
| Modify | `packages/web/src/lib/server-functions.ts` |
| Create | `packages/web/src/components/usage-card.tsx` |
| Modify | `packages/web/src/routes/index.tsx` |
| Create | `packages/web/src/routes/settings/billing.tsx` |

---

## Verification

1. **Unit tests**: Add tests for `parseGitHubRepo()`, `checkQuota()`, quota increment logic
2. **Polar sandbox testing**:
   - Use Polar sandbox environment for dev/test
   - Test checkout flow → subscription created → tier updates
   - Test subscription cancellation → reverts to free
3. **Manual testing**:
   - Create fresh user → should be free tier (no Polar subscription)
   - Make commits on public GitHub repo → unlimited, no blocking
   - Make 10 commits on private repo → should block 11th
   - Subscribe via checkout → tier becomes "pro" → unlimited commits
   - Check dashboard shows usage correctly
   - Check CLI shows warning when blocked
4. **E2E test**: Full flow from CLI hook → API → quota check → response handling
5. **Run existing tests**: `bun run test` and `bun run test:e2e`
6. **Lint/format**: `bun run lint && bun run format`
