# Manual Teams for Transcript Sharing

**Status:** Ready for Implementation
**Created:** 2026-01-15
**Reviewed:** 2026-01-15

---

## Goal

Enable team members to see each other's transcripts via manual team invites.

---

## Team Model

- **Users can be in 0 or 1 team** (enforced at app level; DB allows multiple for future flexibility)
- **Team owner:** The user who creates the team
- **Team members:** Users who join via invite
- **Team name:** Auto-generated as `"${ownerName}'s Team"` (no UI input for now)
- **IMPORTANT:** Owner is ALSO added to `team_members` when team is created (required for access control query)

**App Constraint:** 0-1 team per user is enforced in application code (check before create/join). DB schema allows multiple teams for future flexibility - no migration needed to enable multi-team support.

---

## Sharing Options

Three visibility levels:
- **`private`** - Only the owner can see the transcript
- **`team`** - Owner + team members can see the transcript
- **`public`** - Anyone can see the transcript (no auth required)

---

## Default Sharing Behavior

When a transcript is uploaded:
1. **If repo is open source** → `visibility = "public"`
2. **Else if user is in a team** → `visibility = "team"`
3. **Otherwise** → `visibility = "private"`

### Open Source Detection

Check if repo is public via GitHub API on **every upload** (ensures fresh data):
```
GET https://api.github.com/repos/{owner}/{repo}
```
- If 200 response → repo is public → default to `public`
- If 404 or private → fall through to team/private logic

**Implementation:**
- Extract `{owner}/{repo}` from transcript's `repo` field (e.g., `sourcegraph/cody` from full path)
- Always fetch fresh from GitHub on upload (no TTL complexity)
- Update `repos.isPublic` cache after each fetch
- **Fallback on API failure:** Use cached value if available, else default to `private` (safe)
- Rate limit: 60 requests/hour unauthenticated (plenty for typical usage)

Users can toggle visibility on any transcript they own (private ↔ team ↔ public).

---

## Invite Mechanisms

**Two methods:**

1. **Invite link**
   - Generate shareable link: `/join/abc123`
   - Share via Slack/Discord/email manually
   - Link expires after 7 days
   - Anyone with link can join after signing up
   - Use crypto-random codes (16+ chars) to prevent enumeration

2. **Email address**
   - Team owner types email address
   - **Case-insensitive lookup** (normalize to lowercase)
   - If user exists in DB → Add to team immediately
   - If user doesn't exist → "User hasn't signed up. Share an invite link instead."

---

## Data Model

```sql
-- Teams table
teams (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  ownerId       TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  createdAt     INTEGER NOT NULL,
  updatedAt     INTEGER NOT NULL
)

-- Team membership
-- UNIQUE(teamId, userId) allows future multi-team support
-- App code enforces 0-1 team for MVP
-- NOTE: Owner MUST also be added here when team is created
team_members (
  id            TEXT PRIMARY KEY,
  teamId        TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  userId        TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  joinedAt      INTEGER NOT NULL,
  UNIQUE(teamId, userId)
)
CREATE INDEX idx_team_members_user ON team_members(userId);
CREATE INDEX idx_team_members_team ON team_members(teamId);

-- Invite links
team_invites (
  id            TEXT PRIMARY KEY,
  teamId        TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  code          TEXT NOT NULL UNIQUE,  -- crypto-random, 16+ chars
  expiresAt     INTEGER NOT NULL,
  createdAt     INTEGER NOT NULL
)

-- Transcripts (existing table, add column)
transcripts (
  ...existing columns...
  visibility       TEXT DEFAULT 'private'  -- 'private' | 'team' | 'public'
)

-- Repo visibility cache (fallback when GitHub API fails)
repos (
  ...existing columns...
  isPublic      INTEGER  -- 1 = public, 0 = private, NULL = never checked. Updated on each upload.
)
```

---

## Access Control Query

Using JOINs for simplicity (safe with 0-1 team per user - no cartesian product):

```sql
-- Get visible transcripts for a user (authenticated)
SELECT t.*,
       t.userId = :userId AS isOwner,
       u.name AS ownerName,
       u.image AS ownerImage
FROM transcripts t
LEFT JOIN user u ON t.userId = u.id
LEFT JOIN team_members owner_tm ON t.userId = owner_tm.userId
LEFT JOIN team_members my_tm ON owner_tm.teamId = my_tm.teamId AND my_tm.userId = :userId
WHERE
  t.visibility = 'public'                         -- public transcripts (anyone)
  OR t.userId = :userId                           -- own transcripts
  OR (t.visibility = 'team' AND my_tm.userId IS NOT NULL)  -- teammate's team transcripts
ORDER BY t.createdAt DESC

-- Get visible transcripts (unauthenticated / public feed)
SELECT t.*, u.name AS ownerName, u.image AS ownerImage
FROM transcripts t
LEFT JOIN user u ON t.userId = u.id
WHERE t.visibility = 'public'
ORDER BY t.createdAt DESC
```

**Note:** If multi-team support is enabled, revisit these queries (may need DISTINCT or EXISTS to avoid duplicates).

---

## Blob Access Control

**CRITICAL:** Team members and public viewers must be able to access blobs from shared transcripts.

Update `checkBlobAccess()` in `/api/blobs.$sha256.ts`:

```sql
-- Check if user can access blob (authenticated)
SELECT 1 FROM transcriptBlobs tb
JOIN transcripts t ON tb.transcriptId = t.id
LEFT JOIN team_members owner_tm ON t.userId = owner_tm.userId
LEFT JOIN team_members my_tm ON owner_tm.teamId = my_tm.teamId AND my_tm.userId = :userId
WHERE tb.sha256 = :sha256
  AND (
    t.visibility = 'public'                          -- public transcript (anyone)
    OR t.userId = :userId                            -- own transcript
    OR (t.visibility = 'team' AND my_tm.userId IS NOT NULL)  -- teammate's transcript
  )
LIMIT 1

-- Check if blob is public (unauthenticated)
SELECT 1 FROM transcriptBlobs tb
JOIN transcripts t ON tb.transcriptId = t.id
WHERE tb.sha256 = :sha256
  AND t.visibility = 'public'
LIMIT 1
```

**TypeScript Implementation (queries.ts):**

```typescript
// Check if user can access a blob via team membership or public visibility
// Uses JOINs (safe with 0-1 team per user - revisit if multi-team enabled)
export async function checkBlobAccess(db: DrizzleDB, sha256: string, userId: string | null): Promise<boolean> {
  const ownerTeamMembers = aliasedTable(teamMembers, "owner_tm");
  const myTeamMembers = aliasedTable(teamMembers, "my_tm");

  if (!userId) {
    // Unauthenticated: only public blobs
    const result = await db
      .select({ one: sql`1` })
      .from(transcriptBlobs)
      .innerJoin(transcripts, eq(transcriptBlobs.transcriptId, transcripts.id))
      .where(and(
        eq(transcriptBlobs.sha256, sha256),
        eq(transcripts.visibility, "public")
      ))
      .limit(1);
    return result.length > 0;
  }

  // Authenticated: own transcripts + team + public
  const result = await db
    .select({ one: sql`1` })
    .from(transcriptBlobs)
    .innerJoin(transcripts, eq(transcriptBlobs.transcriptId, transcripts.id))
    .leftJoin(ownerTeamMembers, eq(transcripts.userId, ownerTeamMembers.userId))
    .leftJoin(myTeamMembers, and(
      eq(ownerTeamMembers.teamId, myTeamMembers.teamId),
      eq(myTeamMembers.userId, userId)
    ))
    .where(
      and(
        eq(transcriptBlobs.sha256, sha256),
        or(
          eq(transcripts.visibility, "public"),
          eq(transcripts.userId, userId),
          and(
            eq(transcripts.visibility, "team"),
            isNotNull(myTeamMembers.userId)
          )
        )
      )
    )
    .limit(1);
  return result.length > 0;
}
```

---

## State Transitions & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Owner tries to leave team | Blocked - must delete team |
| Owner deletes account | Team deleted (CASCADE), member transcripts reset via trigger |
| Member leaves team | Their transcripts auto-flip to `visibility='private'` |
| Member removed by owner | Their transcripts auto-flip to `visibility='private'` |
| User already in team tries to join another | Blocked - "Leave current team first" |
| Expired invite link used | 410 Gone - "Invite expired, ask for new link" |
| Race condition: simultaneous joins | App-level check before insert; rare edge case acceptable |
| Owner tries to remove self via DELETE endpoint | Blocked - "Cannot remove team owner" |

### Transaction Requirements

**Member leave/removal must be transactional** to avoid inconsistent state:

```sql
BEGIN;
UPDATE transcripts SET visibility = 'private' WHERE userId = :leavingUserId AND visibility = 'team';
DELETE FROM team_members WHERE userId = :leavingUserId AND teamId = :teamId;
COMMIT;
```

**Team deletion must reset all member transcripts first:**

```sql
BEGIN;
-- Reset all members' transcript visibility before CASCADE deletes memberships
UPDATE transcripts SET visibility = 'private'
WHERE visibility = 'team'
  AND userId IN (SELECT userId FROM team_members WHERE teamId = :teamId);
DELETE FROM teams WHERE id = :teamId;  -- CASCADE handles team_members and team_invites
COMMIT;
```

**Owner account deletion requires a trigger** to reset member transcripts before CASCADE:

When an owner deletes their account, the `ON DELETE CASCADE` on `teams.ownerId` deletes the team, but application-level logic doesn't run. Add a SQLite trigger:

```sql
-- Reset transcript visibility when team_members rows are deleted (by any means)
CREATE TRIGGER reset_visibility_on_membership_delete
BEFORE DELETE ON team_members
FOR EACH ROW
BEGIN
  UPDATE transcripts SET visibility = 'private'
  WHERE userId = OLD.userId AND visibility = 'team';
END;
```

This trigger fires for: explicit DELETE, CASCADE from team deletion, and CASCADE from user deletion. This ensures transcripts are always reset to private when membership ends, regardless of how.

---

## Security Considerations

| Risk | Mitigation |
|------|------------|
| Invite link enumeration | Crypto-random codes (16+ chars), rate limit endpoint |
| IDOR on team operations | Always verify `ownerId = userId` for management ops |
| Unauthorized transcript access | Query always includes ownership OR (team + visibility) check |
| Unauthorized blob access | Same team check applied to blob access endpoint |
| CSRF on mutations | POST/DELETE methods only, verify Origin header |
| Email case mismatch | Normalize to lowercase for comparison |

---

## Server Functions (Web UI Only)

All team features are implemented as TanStack Start server functions (not API routes).
The CLI doesn't need team management - only `/api/blobs/:sha256` is modified for access control.

| Function | Auth | Description |
|----------|------|-------------|
| `getTeam()` | user | Get user's team with members |
| `createTeam()` | user | Create team (auto-generate name, add owner to members) |
| `deleteTeam(teamId)` | owner | Delete team |
| `leaveTeam(teamId)` | member | Leave team (not owner), resets transcript visibility |
| `addMemberByEmail(teamId, email)` | owner | Add member by email (case-insensitive) |
| `removeMember(teamId, userId)` | owner | Remove member (blocked if userId = ownerId) |
| `generateInvite(teamId)` | owner | Generate invite link |
| `revokeInvite(teamId)` | owner | Revoke invite link |
| `getInviteInfo(code)` | any | Get team info for invite (used in join page loader) |
| `acceptInvite(code)` | user | Accept invite |
| `updateVisibility(transcriptId, visibility)` | owner | Change transcript visibility |

**API Route (CLI access):**
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/blobs/:sha256` | GET | user | Download blob (add team + public access check) |

---

## UI Components

### 1. Transcript List (`/app`)
- Sharing indicator icon (lock = private, users = team, globe = public)
- For teammate transcripts: "Shared by [name]" with avatar
- For public transcripts from others: "Public by [name]" with avatar
- Filter: "All" | "Mine" | "Team" | "Public"

### 2. Transcript Detail (`/app/logs/:id`)
- Sharing dropdown (owner only): Private | Team | Public
- Status badge: "Private", "Shared with [Team Name]", or "Public"
- Auto-detected indicator: "Auto-shared (open source repo)" if defaulted to public

### 3. Team Page (`/app/team`)
- **No team state:** "Create a Team" button (no name input - auto-generated)
- **In team state:**
  - Team name header (shows "[Owner]'s Team")
  - Member list with avatars (owner badge on owner)
  - Invite section: link generator + email input
  - Leave/Delete button (context-dependent)

### 4. Join Page (`/join/:code`)
- Team name display
- "Join [Team Name]" button
- If not logged in: redirect to GitHub OAuth, then back to join

---

## Implementation Tasks

### Phase 1: Database & Schema
1. Add `visibility` column to transcripts table (private | team | public)
2. Add `isPublic` column to repos table (for caching open source status)
3. Create `teams` table
4. Create `team_members` table with indexes and trigger
5. Create `team_invites` table
6. Run migration

**Phase 1 Verification:**
```bash
# 1. Generate and run migrations
bun db:generate && bun db:migrate

# 2. Verify visibility column exists
sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  ".schema transcripts" | grep -q "visibility TEXT" && echo "PASS: visibility column exists"

# 3. Verify all new tables created
sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  ".tables" | grep -q "teams" && echo "PASS: teams table exists"
sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  ".tables" | grep -q "team_members" && echo "PASS: team_members table exists"
sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  ".tables" | grep -q "team_invites" && echo "PASS: team_invites table exists"

# 4. Verify indexes exist (userId index for lookup, not unique)
sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  ".indices team_members" | grep -q "idx_team_members_user" && echo "PASS: userId index exists"

# 5. Type check passes
bun run --filter packages/web check
```

### Phase 1.5: Open Source Detection
7. Create helper function to check if repo is public via GitHub API
8. Update transcript upload to always check repo visibility (fresh on every upload)
9. Update repos.isPublic cache after each check (for fallback on API failure)

**Phase 1.5 Verification:**
```bash
# 1. Test checkRepoIsPublic with known public repo
# In test or REPL:
# checkRepoIsPublic("facebook/react") should return true

# 2. Upload transcript for public repo, verify visibility='public'
curl -X POST http://localhost:3000/api/ingest -H "Cookie: $AUTH" \
  -d '{"repo":"github.com/facebook/react",...}' | jq '.visibility'
# Verify: "public"

# 3. Upload transcript for private/unknown repo (user not in team)
curl -X POST http://localhost:3000/api/ingest -H "Cookie: $AUTH" \
  -d '{"repo":"github.com/myorg/private-repo",...}' | jq '.visibility'
# Verify: "private"

# 4. Verify isPublic is cached in repos table
sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  "SELECT is_public FROM repos WHERE repo LIKE '%facebook/react%'"
# Verify: 1 (true)
```

### Phase 2: Core Server Functions
10. `createTeam()` - Create team (auto-generate name, insert owner into team_members)
11. `getTeam()` - Get user's team with members
12. `deleteTeam(teamId)` - Delete team (owner only)
13. `addMemberByEmail(teamId, email)` - Add by email (case-insensitive, owner only)
14. `removeMember(teamId, userId)` - Remove member (block owner self-removal, reset visibility)
15. `leaveTeam(teamId)` - Leave team (reset visibility to private)

**Phase 2 Verification:**
```bash
DB=".wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite"

# Chrome DevTools MCP E2E (primary verification):
# 1. Navigate to /app/team as logged-in user with no team
# mcp__chrome-devtools__navigate_page url="http://localhost:3000/app/team"
# mcp__chrome-devtools__take_snapshot - verify "No Team Yet" and "Create Team" button

# 2. Click create team button
# mcp__chrome-devtools__click uid="[create-team-button]"
# mcp__chrome-devtools__wait_for text="'s Team"
# mcp__chrome-devtools__take_snapshot - verify team dashboard with owner badge

# 3. Verify owner is in team_members table
sqlite3 $DB "SELECT COUNT(*) FROM team_members tm JOIN teams t ON tm.team_id = t.id WHERE tm.user_id = t.owner_id" | grep -q "1" && \
  echo "PASS: owner in team_members"

# 4. Test add member by email via UI
# mcp__chrome-devtools__fill uid="[email-input]" value="member@test.com"
# mcp__chrome-devtools__click uid="[add-member-button]"
# mcp__chrome-devtools__wait_for text="member@test.com"

# 5. Verify member appears in DB
sqlite3 $DB "SELECT COUNT(*) FROM team_members" | grep -q "2" && echo "PASS: 2 members in team"
```

### Phase 3: Invite System
16. `generateInvite(teamId)` - Generate invite link (owner only)
17. `revokeInvite(teamId)` - Revoke invite (owner only)
18. `getInviteInfo(code)` - Get invite info (used in join page loader)
19. `acceptInvite(code)` - Accept invite
20. Create /join/$code page with loader and UI

**Note:** Expired invites don't need cleanup - they're filtered at query time. Stale rows have negligible storage impact.

**Phase 3 Verification:**
```bash
DB=".wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite"

# Chrome DevTools MCP E2E (primary verification):
# 1. Generate invite via team page
# mcp__chrome-devtools__navigate_page url="http://localhost:3000/app/team"
# mcp__chrome-devtools__click uid="[generate-invite-button]"
# mcp__chrome-devtools__take_snapshot - verify invite link appears with copy button

# 2. Verify invite in DB with correct expiry (7 days)
sqlite3 $DB "SELECT code, (expires_at - created_at) / 1000 / 86400 as days FROM team_invites ORDER BY created_at DESC LIMIT 1"
# Verify: days = 7

# 3. Get invite code from DB for testing
CODE=$(sqlite3 $DB "SELECT code FROM team_invites ORDER BY created_at DESC LIMIT 1")

# 4. Test join page renders correctly
# mcp__chrome-devtools__navigate_page url="http://localhost:3000/join/$CODE"
# mcp__chrome-devtools__take_snapshot - verify team name, member count, "Join Team" button

# 5. Test expired invite shows error
sqlite3 $DB "UPDATE team_invites SET expires_at = 0 WHERE code = '$CODE'"
# mcp__chrome-devtools__navigate_page url="http://localhost:3000/join/$CODE"
# mcp__chrome-devtools__take_snapshot - verify "expired" error message

# 6. Test accept invite flow (as different user)
# Generate fresh invite, open in incognito, sign in as new user, click join
# Verify redirect to /app/team showing the team
```

### Phase 4: Transcript Sharing
21. `updateVisibility(transcriptId, visibility)` - Update visibility (private | team | public)
22. Update transcript queries for team + public access (JOIN pattern)
23. Update `/api/blobs/:sha256` for team + public access (CLI needs this)
24. Add visibility dropdown to transcript detail page (hide "team" option if user has no team)
25. Add visibility indicator to transcript list (lock/users/globe icons)

**Phase 4 Verification:**
```bash
DB=".wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite"

# Setup: Create two users - User A (team owner), User B (team member)
# User A has a transcript

# Chrome DevTools MCP E2E (primary verification):
# 1. As User A, change transcript visibility to "team"
# mcp__chrome-devtools__navigate_page url="http://localhost:3000/app/logs/$TRANSCRIPT_ID"
# mcp__chrome-devtools__click uid="[visibility-dropdown]"
# mcp__chrome-devtools__click uid="[visibility-option-team]"
# mcp__chrome-devtools__take_snapshot - verify "Team" indicator shown

# 2. Verify in DB
sqlite3 $DB "SELECT visibility FROM transcripts WHERE id = '$TRANSCRIPT_ID'" | grep -q "team" && \
  echo "PASS: visibility updated to team"

# 3. As User B (team member), verify transcript appears in list
# mcp__chrome-devtools__navigate_page url="http://localhost:3000/app"
# mcp__chrome-devtools__take_snapshot - verify transcript visible with "Shared by [User A]"

# 4. Blob access test via CLI (only API route that remains)
# As team member:
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/blobs/$SHA256 -H "Cookie: $USER_B_AUTH")
[ "$STATUS" = "200" ] && echo "PASS: team member can access blob via API"

# As non-team member:
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/blobs/$SHA256 -H "Cookie: $USER_C_AUTH")
[ "$STATUS" = "403" ] && echo "PASS: non-team member blocked from blob"

# 5. Public visibility test
# Set to public via UI, then test unauthenticated blob access
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/blobs/$SHA256)
[ "$STATUS" = "200" ] && echo "PASS: public blob accessible without auth"

# 6. Test "team" option hidden for user without team
# Sign in as user with no team, open transcript detail
# mcp__chrome-devtools__click uid="[visibility-dropdown]"
# mcp__chrome-devtools__take_snapshot - verify only "Private" and "Public" options (no "Team")
```

### Phase 5: Team Management UI
26. Install @tanstack/react-query and set up QueryClientProvider in __root.tsx
27. Create /app/team page with TanStack Query mutations
28. Create team button (no form - just calls createTeam() with auto-generated name)
29. Member list component (show owner badge)
30. Invite controls component (link + email input) using useMutation

**Phase 5 Verification:**
```bash
# Chrome DevTools MCP E2E (primary verification):
# 1. Navigate to team page as user without team
# mcp__chrome-devtools__navigate_page url="http://localhost:3000/app/team"
# mcp__chrome-devtools__take_snapshot - verify "No Team Yet" message and "Create Team" button

# 2. Create team via button click
# mcp__chrome-devtools__click uid="[create-team-button]"
# mcp__chrome-devtools__wait_for text="'s Team"

# 3. Verify team dashboard UI elements
# mcp__chrome-devtools__take_screenshot - visual check for:
#   - Team name "[User]'s Team" at top
#   - Owner badge on first member
#   - "Generate Invite Link" button
#   - Email input for adding members
#   - "Leave Team" or "Delete Team" button

# 4. Test invite link generation
# mcp__chrome-devtools__click uid="[generate-invite-button]"
# mcp__chrome-devtools__take_snapshot - verify invite URL appears with copy button

# 5. Test add member by email
# mcp__chrome-devtools__fill uid="[email-input]" value="existing-user@test.com"
# mcp__chrome-devtools__click uid="[add-member-button]"
# mcp__chrome-devtools__wait_for text="existing-user@test.com"
# mcp__chrome-devtools__take_snapshot - verify member appears in list
```

### Phase 6: Polish & Edge Cases
31. Handle "already in team" error gracefully in UI
32. Auto-reset visibility to private on team leave AND removal (SQLite trigger)

**Phase 6 Verification:**
```bash
DB=".wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite"

# Chrome DevTools MCP E2E:
# 1. Test "already in team" error shown gracefully
# - As user already in a team, try to join another team via invite link
# mcp__chrome-devtools__navigate_page url="http://localhost:3000/join/$OTHER_TEAM_CODE"
# mcp__chrome-devtools__click uid="[join-button]"
# mcp__chrome-devtools__take_snapshot - verify "Already in a team" error message

# 2. Test visibility auto-reset on leave
# Setup: User has transcript with visibility="team"
TRANSCRIPT_ID=$(sqlite3 $DB "SELECT id FROM transcripts WHERE visibility = 'team' LIMIT 1")
USER_ID=$(sqlite3 $DB "SELECT user_id FROM transcripts WHERE id = '$TRANSCRIPT_ID'")

# Leave team via UI
# mcp__chrome-devtools__navigate_page url="http://localhost:3000/app/team"
# mcp__chrome-devtools__click uid="[leave-team-button]"
# mcp__chrome-devtools__handle_dialog action="accept"

# Verify visibility reset in DB
sqlite3 $DB "SELECT visibility FROM transcripts WHERE id = '$TRANSCRIPT_ID'" | grep -q "private" && \
  echo "PASS: visibility reset to private on leave"

# 3. Test visibility auto-reset on member removal
# As owner, remove a member who has team-shared transcripts
# mcp__chrome-devtools__click uid="[remove-member-button]"
# Verify their transcripts reset to private

# 4. Final E2E check - transcript list with visibility indicators
# mcp__chrome-devtools__navigate_page url="http://localhost:3000/app"
# mcp__chrome-devtools__take_screenshot - verify lock/users/globe icons on transcripts
```

---

## Concrete Implementation Details

### File Structure

```
packages/web/
├── package.json                           # ADD: @tanstack/react-query dependency
packages/web/src/
├── lib/
│   └── query-client.ts                    # NEW: TanStack Query client setup
├── db/
│   └── schema.ts                          # ADD: teams, teamMembers, teamInvites tables
├── db/
│   └── queries.ts                         # ADD: team query functions
├── lib/
│   ├── server-functions.ts                # ADD: team server functions
│   └── github.ts                          # NEW: GitHub API helper for open source detection
├── routes/
│   └── __root.tsx                         # MODIFY: wrap with QueryClientProvider
│   ├── api/
│   │   └── blobs.$sha256.ts               # MODIFY: add team + public access check
│   ├── _app/app/
│   │   ├── index.tsx                      # MODIFY: add visibility indicators
│   │   ├── logs.$id.tsx                   # MODIFY: add visibility dropdown
│   │   └── team.tsx                       # NEW: team management page
│   └── join.$code.tsx                     # NEW: invite acceptance page
```

### Schema Changes (schema.ts)

```typescript
// ADD after transcriptBlobs table

export const visibilityOptions = ["private", "team", "public"] as const;
export type SharingOption = (typeof visibilityOptions)[number];

// Teams table - all timestamps use timestamp_ms for consistency
export const teams = sqliteTable("teams", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

// Team membership - all timestamps use timestamp_ms for consistency
export const teamMembers = sqliteTable(
  "team_members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => ({
    teamUserUnique: uniqueIndex("idx_team_members_unique").on(table.teamId, table.userId),
    userIdx: index("idx_team_members_user").on(table.userId),  // For lookup, not unique (multi-team ready)
    teamIdx: index("idx_team_members_team").on(table.teamId),
  }),
);

// Team invites - all timestamps use timestamp_ms for consistency
export const teamInvites = sqliteTable("team_invites", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

// ADD to transcripts table definition:
visibility: text("visibility").$type<SharingOption>().default("private").notNull(),

// ADD to repos table definition:
// Cache of GitHub public status - updated on each upload, used as fallback if API fails
isPublic: integer("is_public", { mode: "boolean" }),

// ADD relations
export const teamsRelations = relations(teams, ({ one, many }) => ({
  owner: one(user, { fields: [teams.ownerId], references: [user.id] }),
  members: many(teamMembers),
  invites: many(teamInvites),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(user, { fields: [teamMembers.userId], references: [user.id] }),
}));

export const teamInvitesRelations = relations(teamInvites, ({ one }) => ({
  team: one(teams, { fields: [teamInvites.teamId], references: [teams.id] }),
}));
```

### Query Functions (queries.ts)

```typescript
import { aliasedTable } from "drizzle-orm";

// Get user's current team (0 or 1)
export async function getUserTeam(db: DrizzleDB, userId: string) {
  const membership = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, userId),
    with: {
      team: {
        with: {
          owner: true,
          members: { with: { user: true } },
        },
      },
    },
  });
  return membership?.team ?? null;
}

// Get team by ID with members
export async function getTeamWithMembers(db: DrizzleDB, teamId: string) {
  return db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    with: {
      owner: true,
      members: { with: { user: true } },
      invites: true,
    },
  });
}

// Check if user is team owner
export async function isTeamOwner(db: DrizzleDB, teamId: string, userId: string) {
  const team = await db.query.teams.findFirst({
    where: and(eq(teams.id, teamId), eq(teams.ownerId, userId)),
  });
  return !!team;
}

// Check if user is team member
export async function isTeamMember(db: DrizzleDB, teamId: string, userId: string) {
  const member = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
  });
  return !!member;
}

// Find user by email (case-insensitive)
export async function findUserByEmail(db: DrizzleDB, email: string) {
  const result = await db
    .select()
    .from(user)
    .where(sql`LOWER(${user.email}) = LOWER(${email})`)
    .limit(1);
  return result[0] ?? null;
}

// Get visible transcripts (with team access)
// Uses JOINs (safe with 0-1 team per user - revisit if multi-team enabled)
export async function getVisibleTranscripts(db: DrizzleDB, userId: string | null) {
  if (!userId) {
    // Unauthenticated: only public
    return db
      .select({
        id: transcripts.id,
        // ... other fields
        visibility: transcripts.visibility,
        ownerName: user.name,
        ownerImage: user.image,
      })
      .from(transcripts)
      .leftJoin(user, eq(transcripts.userId, user.id))
      .where(eq(transcripts.visibility, "public"))
      .orderBy(desc(transcripts.createdAt));
  }

  // Create aliases for self-join on team_members
  const ownerTeamMembers = aliasedTable(teamMembers, "owner_tm");
  const myTeamMembers = aliasedTable(teamMembers, "my_tm");

  // Authenticated: own + team + public
  return db
    .select({
      id: transcripts.id,
      // ... other fields
      visibility: transcripts.visibility,
      isOwner: sql<boolean>`${transcripts.userId} = ${userId}`,
      ownerName: user.name,
      ownerImage: user.image,
    })
    .from(transcripts)
    .leftJoin(user, eq(transcripts.userId, user.id))
    .leftJoin(ownerTeamMembers, eq(transcripts.userId, ownerTeamMembers.userId))
    .leftJoin(myTeamMembers, and(
      eq(ownerTeamMembers.teamId, myTeamMembers.teamId),
      eq(myTeamMembers.userId, userId)
    ))
    .where(
      or(
        eq(transcripts.visibility, "public"),
        eq(transcripts.userId, userId),
        and(
          eq(transcripts.visibility, "team"),
          isNotNull(myTeamMembers.userId)
        )
      )
    )
    .orderBy(desc(transcripts.createdAt));
}

// Get invite by code
export async function getInviteByCode(db: DrizzleDB, code: string) {
  return db.query.teamInvites.findFirst({
    where: eq(teamInvites.code, code),
    with: {
      team: {
        with: {
          owner: true,
          members: true,
        },
      },
    },
  });
}
```

### Server Functions (server-functions.ts)

Add these server functions to `packages/web/src/lib/server-functions.ts`:

```typescript
// =============================================================================
// Team Server Functions
// =============================================================================

/**
 * Get user's team with members
 */
export const getTeam = createServerFn({ method: "GET" }).handler(async () => {
  const db = createDrizzle(env.DB);
  const userId = await getAuthenticatedUserId();
  return queries.getUserTeam(db, userId);
});

/**
 * Create a new team (auto-generated name)
 */
export const createTeam = createServerFn({ method: "POST" }).handler(async () => {
  const db = createDrizzle(env.DB);
  const auth = createAuth();
  const headers = getRequestHeaders();

  const session = await auth.api.getSession({ headers });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;
  const teamName = `${session.user.name}'s Team`;

  // Check if user is already in a team (app-level enforcement)
  const existingMembership = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, userId),
  });
  if (existingMembership) {
    throw new Error("Already in a team. Leave current team first.");
  }

  // Transaction: create team + add owner as member atomically
  const result = await db.transaction(async (tx) => {
    const [newTeam] = await tx.insert(teams).values({
      name: teamName,
      ownerId: userId,
    }).returning();

    await tx.insert(teamMembers).values({
      teamId: newTeam.id,
      userId: userId,
    });

    return newTeam;
  });

  logger.info("Team created", { teamId: result.id, ownerId: userId });
  return { id: result.id, name: result.name };
});

/**
 * Delete team (owner only)
 */
export const deleteTeam = createServerFn({ method: "POST" })
  .validator((teamId: string) => teamId)
  .handler(async ({ data: teamId }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    // Verify team exists and user is owner
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    if (!team) {
      throw new Error("Team not found");
    }
    if (team.ownerId !== userId) {
      throw new Error("Only the owner can delete the team");
    }

    // Get all member IDs to reset their transcript visibility
    const members = await db.query.teamMembers.findMany({
      where: eq(teamMembers.teamId, teamId),
    });
    const memberIds = members.map((m) => m.userId);

    // Transaction: reset visibility + delete team (cascades to members/invites)
    await db.transaction(async (tx) => {
      if (memberIds.length > 0) {
        await tx
          .update(transcripts)
          .set({ visibility: "private" })
          .where(
            and(
              inArray(transcripts.userId, memberIds),
              eq(transcripts.visibility, "team")
            )
          );
      }
      await tx.delete(teams).where(eq(teams.id, teamId));
    });

    logger.info("Team deleted", { teamId, deletedBy: userId });
    return { success: true };
  });

/**
 * Leave team (non-owner only)
 */
export const leaveTeam = createServerFn({ method: "POST" })
  .validator((teamId: string) => teamId)
  .handler(async ({ data: teamId }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    // Verify team exists
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    if (!team) {
      throw new Error("Team not found");
    }

    // Owner cannot leave (must delete team instead)
    if (team.ownerId === userId) {
      throw new Error("Owner cannot leave. Delete the team instead.");
    }

    // Check if user is member
    const isMember = await queries.isTeamMember(db, teamId, userId);
    if (!isMember) {
      throw new Error("Not a member of this team");
    }

    // Transaction: reset transcripts + remove membership
    await db.transaction(async (tx) => {
      await tx
        .update(transcripts)
        .set({ visibility: "private" })
        .where(and(eq(transcripts.userId, userId), eq(transcripts.visibility, "team")));

      await tx.delete(teamMembers).where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
      );
    });

    logger.info("User left team", { teamId, userId });
    return { success: true };
  });

/**
 * Add member by email (owner only)
 */
export const addMemberByEmail = createServerFn({ method: "POST" })
  .validator((input: { teamId: string; email: string }) => input)
  .handler(async ({ data: { teamId, email } }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    // Verify team exists and user is owner
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    if (!team) {
      throw new Error("Team not found");
    }
    if (team.ownerId !== userId) {
      throw new Error("Only the owner can add members");
    }

    // Find user by email (case-insensitive)
    const targetUser = await queries.findUserByEmail(db, email);
    if (!targetUser) {
      throw new Error("User not found. They must sign up first.");
    }

    // Check if target user is already in a team
    const existingMembership = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.userId, targetUser.id),
    });
    if (existingMembership) {
      throw new Error("User is already in a team");
    }

    // Add member
    await db.insert(teamMembers).values({
      teamId,
      userId: targetUser.id,
    });

    logger.info("Member added to team", { teamId, memberId: targetUser.id, addedBy: userId });
    return { success: true, userId: targetUser.id };
  });

/**
 * Remove member (owner only, cannot remove self)
 */
export const removeMember = createServerFn({ method: "POST" })
  .validator((input: { teamId: string; targetUserId: string }) => input)
  .handler(async ({ data: { teamId, targetUserId } }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    // Verify team exists and user is owner
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    if (!team) {
      throw new Error("Team not found");
    }
    if (team.ownerId !== userId) {
      throw new Error("Only the owner can remove members");
    }

    // Cannot remove owner
    if (targetUserId === team.ownerId) {
      throw new Error("Cannot remove the owner. Delete the team instead.");
    }

    // Check if target is actually a member
    const isMember = await queries.isTeamMember(db, teamId, targetUserId);
    if (!isMember) {
      throw new Error("User is not a member of this team");
    }

    // Transaction: reset transcripts + remove membership
    await db.transaction(async (tx) => {
      await tx
        .update(transcripts)
        .set({ visibility: "private" })
        .where(and(eq(transcripts.userId, targetUserId), eq(transcripts.visibility, "team")));

      await tx.delete(teamMembers).where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId))
      );
    });

    logger.info("Member removed from team", { teamId, memberId: targetUserId, removedBy: userId });
    return { success: true };
  });

/**
 * Generate invite link (owner only)
 */
export const generateInvite = createServerFn({ method: "POST" })
  .validator((teamId: string) => teamId)
  .handler(async ({ data: teamId }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    // Verify team exists and user is owner
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    if (!team) {
      throw new Error("Team not found");
    }
    if (team.ownerId !== userId) {
      throw new Error("Only the owner can generate invites");
    }

    // Delete existing invite if any
    await db.delete(teamInvites).where(eq(teamInvites.teamId, teamId));

    // Generate new invite (16 chars = ~95 bits entropy)
    const code = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(teamInvites).values({
      teamId,
      code,
      expiresAt,
    });

    logger.info("Invite generated", { teamId, code });
    return { code, url: `/join/${code}`, expiresAt };
  });

/**
 * Revoke invite (owner only)
 */
export const revokeInvite = createServerFn({ method: "POST" })
  .validator((teamId: string) => teamId)
  .handler(async ({ data: teamId }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    // Verify team exists and user is owner
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    if (!team) {
      throw new Error("Team not found");
    }
    if (team.ownerId !== userId) {
      throw new Error("Only the owner can revoke invites");
    }

    await db.delete(teamInvites).where(eq(teamInvites.teamId, teamId));

    logger.info("Invite revoked", { teamId });
    return { success: true };
  });

/**
 * Get invite info (public - used in join page loader)
 */
export const getInviteInfo = createServerFn({ method: "GET" })
  .validator((code: string) => code)
  .handler(async ({ data: code }) => {
    const db = createDrizzle(env.DB);

    const invite = await queries.getInviteByCode(db, code);
    if (!invite) {
      return null;
    }

    const isExpired = new Date(invite.expiresAt) < new Date();

    return {
      code: invite.code,
      teamName: invite.team.name,
      memberCount: invite.team.members.length,
      ownerName: invite.team.owner.name,
      expired: isExpired,
    };
  });

/**
 * Accept invite (authenticated users only)
 */
export const acceptInvite = createServerFn({ method: "POST" })
  .validator((code: string) => code)
  .handler(async ({ data: code }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    const invite = await queries.getInviteByCode(db, code);
    if (!invite) {
      throw new Error("Invite not found or has been revoked");
    }

    if (new Date(invite.expiresAt) < new Date()) {
      throw new Error("This invite has expired. Please ask for a new one.");
    }

    // Check if user is already in a team
    const existingMembership = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.userId, userId),
    });
    if (existingMembership) {
      throw new Error("Already in a team. Leave current team first.");
    }

    // Add user to team
    await db.insert(teamMembers).values({
      teamId: invite.teamId,
      userId,
    });

    logger.info("User joined team via invite", { teamId: invite.teamId, userId, code });
    return { success: true, teamId: invite.teamId };
  });

/**
 * Update transcript visibility
 */
export const updateVisibility = createServerFn({ method: "POST" })
  .validator((input: { transcriptId: string; visibility: string }) => input)
  .handler(async ({ data: { transcriptId, visibility } }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    // Verify transcript exists and user owns it
    const transcript = await db.query.transcripts.findFirst({
      where: eq(transcripts.id, transcriptId),
    });
    if (!transcript) {
      throw new Error("Transcript not found");
    }
    if (transcript.userId !== userId) {
      throw new Error("You can only change visibility of your own transcripts");
    }

    // Validate visibility value
    if (!visibility || !visibilityOptions.includes(visibility as SharingOption)) {
      throw new Error(`Invalid visibility. Must be one of: ${visibilityOptions.join(", ")}`);
    }

    // If setting to "team", verify user is in a team
    if (visibility === "team") {
      const userTeam = await queries.getUserTeam(db, userId);
      if (!userTeam) {
        throw new Error("You must be in a team to share with team. Create or join a team first.");
      }
    }

    // Update visibility
    await db.update(transcripts)
      .set({ visibility: visibility as SharingOption })
      .where(eq(transcripts.id, transcriptId));

    logger.info("Transcript visibility updated", { transcriptId, visibility, userId });
    return { success: true, visibility };
  });
```

### Blob Access API Route (blobs.$sha256.ts - MODIFY)

Modify the existing `checkBlobAccess` function to support team + public visibility:

```typescript
// In packages/web/src/routes/api/blobs.$sha256.ts
// MODIFY checkBlobAccess function to use the shared query function

import { checkBlobAccess as checkBlobAccessQuery } from "../../db/queries";

async function checkBlobAccess(request: Request, sha256: string): Promise<BlobAccessResult> {
  const db = createDrizzle(env.DB);
  const auth = createAuth();

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  // Get userId (null if not authenticated - allows public access check)
  const userId = session?.user?.id ?? null;

  // Use shared access control query
  const hasAccess = await checkBlobAccessQuery(db, sha256, userId);

  if (!hasAccess) {
    logger.warn("Blob access denied", {
      sha256: sha256.slice(0, 8),
      userId,
    });
    return { authorized: false, response: new Response(null, { status: userId ? 404 : 401 }) };
  }

  // Get media type for response
  const blob = await db.query.blobs.findFirst({
    where: eq(blobs.sha256, sha256),
  });

  return { authorized: true, mediaType: blob?.mediaType ?? "application/octet-stream" };
}

// Rest of the file (HEAD/GET handlers) remains unchanged
```

The `checkBlobAccessQuery` function is defined in queries.ts and uses the same JOIN pattern as transcript access control.

### GitHub Helper (github.ts)

```typescript
import { logger } from "./logger";

export async function checkRepoIsPublic(repoFullName: string): Promise<boolean | null> {
  // Extract owner/repo from full name or path
  const match = repoFullName.match(/([^/]+\/[^/]+)$/);
  if (!match) return null;

  const ownerRepo = match[1];

  try {
    const response = await fetch(`https://api.github.com/repos/${ownerRepo}`, {
      headers: { "User-Agent": "AgentLogs/1.0" },
    });

    if (response.status === 200) {
      const data = await response.json();
      return !data.private; // public if not private
    }

    if (response.status === 404) {
      return false; // private or doesn't exist
    }

    logger.warn("GitHub API unexpected status", { status: response.status, repo: ownerRepo });
    return null; // unknown
  } catch (error) {
    logger.error("GitHub API error", { error, repo: ownerRepo });
    return null;
  }
}

/**
 * Get default visibility for a new transcript.
 * Always fetches fresh from GitHub, updates cache, falls back on failure.
 */
export async function getDefaultVisibility(
  db: DrizzleDB,
  repoId: string | null,
  repoFullName: string | null,
  userId: string
): Promise<SharingOption> {
  // 1. Check if repo is public (fresh fetch from GitHub)
  if (repoId && repoFullName) {
    const freshIsPublic = await checkRepoIsPublic(repoFullName);

    if (freshIsPublic !== null) {
      // Update cache with fresh value
      await db.update(repos).set({ isPublic: freshIsPublic }).where(eq(repos.id, repoId));

      if (freshIsPublic) {
        return "public";
      }
    } else {
      // API failed - check cached value as fallback
      const repo = await db.query.repos.findFirst({ where: eq(repos.id, repoId) });
      if (repo?.isPublic) {
        return "public";
      }
      // No cache or cache says private - fall through
    }
  }

  // 2. Check if user is in a team
  const membership = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, userId),
  });
  if (membership) {
    return "team";
  }

  // 3. Default to private
  return "private";
}
```

### TanStack Query Setup

**Install dependency:**
```bash
cd packages/web && bun add @tanstack/react-query
```

**Query client (lib/query-client.ts):**
```typescript
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      // Don't retry mutations by default
      retry: false,
    },
  },
});
```

**Add provider to __root.tsx:**
```typescript
// ADD to imports
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";

// WRAP the app in createRootRoute's component:
export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      {/* existing app content */}
      <Outlet />
    </QueryClientProvider>
  ),
});
```

### UI: Team Page (team.tsx)

```typescript
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Users, Plus, Link, Trash2, LogOut, Crown, Loader2, Copy, UserPlus, AlertCircle } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "../../../components/ui/avatar";
import { Badge } from "../../../components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "../../../components/ui/card";
import { getTeam, createTeam, generateInvite, addMemberByEmail, removeMember, leaveTeam, deleteTeam } from "../../../lib/server-functions";

// Infer types from server function returns (Drizzle pattern)
type Team = NonNullable<Awaited<ReturnType<typeof getTeam>>>;
type TeamMember = Team["members"][number];

// Inline error display component
function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md" role="alert">
      {message}
    </div>
  );
}

export const Route = createFileRoute("/_app/app/team")({
  loader: async () => {
    const team = await getTeam();
    return { team };
  },
  component: TeamPage,
  errorComponent: TeamErrorPage,
});

function TeamErrorPage({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-6">
      <AlertCircle className="h-16 w-16 text-destructive" aria-hidden="true" />
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Try Again
      </Button>
    </div>
  );
}

function TeamPage() {
  const { team } = Route.useLoaderData();
  const router = useRouter();

  const createTeamMutation = useMutation({
    mutationFn: createTeam,
    onSuccess: () => router.invalidate(),
  });

  if (!team) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-6">
        <Users className="h-16 w-16 text-muted-foreground" aria-hidden="true" />
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">No Team Yet</h2>
          <p className="text-muted-foreground">Create a team to share transcripts with colleagues.</p>
        </div>
        {createTeamMutation.error && (
          <ErrorMessage message={createTeamMutation.error.message} />
        )}
        <Button
          onClick={() => createTeamMutation.mutate()}
          disabled={createTeamMutation.isPending}
          aria-busy={createTeamMutation.isPending}
          aria-label="Create a new team"
        >
          {createTeamMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
          )}
          {createTeamMutation.isPending ? "Creating..." : "Create Team"}
        </Button>
      </div>
    );
  }

  return <TeamDashboard team={team} />;
}

function TeamDashboard({ team }: { team: Team }) {
  const { session } = Route.useRouteContext();
  const router = useRouter();
  const isOwner = team.ownerId === session.user.id;

  const deleteTeamMutation = useMutation({
    mutationFn: () => deleteTeam(team.id),
    onSuccess: () => router.invalidate(),
  });

  const leaveTeamMutation = useMutation({
    mutationFn: () => leaveTeam(team.id),
    onSuccess: () => router.invalidate(),
  });

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this team? All members will be removed.")) {
      deleteTeamMutation.mutate();
    }
  };

  const handleLeave = () => {
    if (confirm("Are you sure you want to leave this team?")) {
      leaveTeamMutation.mutate();
    }
  };

  const actionError = deleteTeamMutation.error || leaveTeamMutation.error;
  const actionPending = deleteTeamMutation.isPending || leaveTeamMutation.isPending;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{team.name}</h1>
        <p className="text-muted-foreground">{team.members.length} member{team.members.length !== 1 ? "s" : ""}</p>
      </div>

      {actionError && <ErrorMessage message={actionError.message} />}

      {/* Member List */}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4" role="list" aria-label="Team members">
          {team.members.map((member) => (
            <MemberRow
              key={member.userId}
              teamId={team.id}
              member={member}
              isOwner={member.userId === team.ownerId}
              canRemove={isOwner && member.userId !== team.ownerId}
            />
          ))}
        </CardContent>
      </Card>

      {/* Invite Section (owner only) */}
      {isOwner && <InviteSection teamId={team.id} />}

      {/* Actions */}
      <div className="flex gap-4">
        {isOwner ? (
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={actionPending}
            aria-busy={actionPending}
            aria-label="Delete team"
          >
            {deleteTeamMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            Delete Team
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={handleLeave}
            disabled={actionPending}
            aria-busy={actionPending}
            aria-label="Leave team"
          >
            {leaveTeamMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            Leave Team
          </Button>
        )}
      </div>
    </div>
  );
}

function MemberRow({ teamId, member, isOwner, canRemove }: {
  teamId: string;
  member: TeamMember;
  isOwner: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();

  const removeMutation = useMutation({
    mutationFn: () => removeMember(teamId, member.userId),
    onSuccess: () => router.invalidate(),
  });

  const handleRemove = () => {
    if (confirm(`Remove ${member.user.name} from the team?`)) {
      removeMutation.mutate();
    }
  };

  return (
    <div className="flex items-center justify-between" role="listitem">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={member.user.image} alt="" />
          <AvatarFallback aria-hidden="true">{member.user.name[0]}</AvatarFallback>
        </Avatar>
        <div>
          <div className="font-medium flex items-center gap-2">
            {member.user.name}
            {isOwner && (
              <Badge variant="secondary">
                <Crown className="h-3 w-3 mr-1" aria-hidden="true" />
                Owner
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground">{member.user.email}</div>
          {removeMutation.error && (
            <div className="text-sm text-destructive">{removeMutation.error.message}</div>
          )}
        </div>
      </div>
      {canRemove && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRemove}
          disabled={removeMutation.isPending}
          aria-label={`Remove ${member.user.name} from team`}
          aria-busy={removeMutation.isPending}
        >
          {removeMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      )}
    </div>
  );
}

function InviteSection({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

  const generateLinkMutation = useMutation({
    mutationFn: () => generateInvite(teamId),
  });

  const addMemberMutation = useMutation({
    mutationFn: (email: string) => addMemberByEmail(teamId, email),
    onSuccess: () => {
      setEmail("");
      router.invalidate();
    },
  });

  const handleCopy = async () => {
    if (!generateLinkMutation.data?.url) return;
    await navigator.clipboard.writeText(generateLinkMutation.data.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddByEmail = () => {
    if (email.trim()) {
      addMemberMutation.mutate(email.trim());
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite Members</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Invite Link */}
        <div className="space-y-2">
          <label id="invite-link-label" className="text-sm font-medium">Invite Link</label>
          {generateLinkMutation.data?.url ? (
            <div className="flex gap-2">
              <Input
                value={generateLinkMutation.data.url}
                readOnly
                aria-labelledby="invite-link-label"
                aria-describedby="invite-link-desc"
              />
              <Button
                variant="outline"
                onClick={handleCopy}
                aria-label={copied ? "Copied!" : "Copy invite link"}
              >
                <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => generateLinkMutation.mutate()}
              disabled={generateLinkMutation.isPending}
              aria-busy={generateLinkMutation.isPending}
              aria-label="Generate invite link"
            >
              {generateLinkMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <Link className="h-4 w-4 mr-2" aria-hidden="true" />
              )}
              {generateLinkMutation.isPending ? "Generating..." : "Generate Invite Link"}
            </Button>
          )}
          {generateLinkMutation.error && (
            <p className="text-sm text-destructive" role="alert">{generateLinkMutation.error.message}</p>
          )}
          <p id="invite-link-desc" className="text-sm text-muted-foreground">Link expires in 7 days</p>
        </div>

        {/* Email Address */}
        <div className="space-y-2">
          <label htmlFor="member-email" className="text-sm font-medium">Add by Email</label>
          <div className="flex gap-2">
            <Input
              id="member-email"
              type="email"
              placeholder="teammate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddByEmail()}
              aria-describedby="member-email-desc"
              disabled={addMemberMutation.isPending}
            />
            <Button
              onClick={handleAddByEmail}
              disabled={addMemberMutation.isPending || !email.trim()}
              aria-busy={addMemberMutation.isPending}
              aria-label="Add member by email"
            >
              {addMemberMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" aria-hidden="true" />
              )}
              Add
            </Button>
          </div>
          {addMemberMutation.error && (
            <p className="text-sm text-destructive" role="alert">{addMemberMutation.error.message}</p>
          )}
          {addMemberMutation.isSuccess && (
            <p className="text-sm text-green-600" role="status">Member added successfully</p>
          )}
          <p id="member-email-desc" className="text-sm text-muted-foreground">User must have signed up already</p>
        </div>
      </CardContent>
    </Card>
  );
}
```

### UI: Join Page (join.$code.tsx)

```typescript
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Users, Loader2, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { getInviteInfo, acceptInvite, getSession } from "../lib/server-functions";

export const Route = createFileRoute("/join/$code")({
  loader: async ({ params }) => {
    const session = await getSession();
    const invite = await getInviteInfo(params.code);

    if (!invite) {
      throw new Error("Invite not found or has been revoked");
    }

    if (invite.expired) {
      throw new Error("This invite link has expired. Please ask for a new one.");
    }

    return { invite, session };
  },
  component: JoinPage,
  errorComponent: JoinErrorPage,
});

function JoinPage() {
  const { invite, session } = Route.useLoaderData();
  const router = useRouter();

  const joinMutation = useMutation({
    mutationFn: () => acceptInvite(invite.code),
    onSuccess: () => {
      router.navigate({ to: "/app/team" });
    },
  });

  const handleJoin = () => {
    if (!session) {
      // Redirect to login, then back here
      window.location.href = `/auth/github?callbackURL=/join/${invite.code}`;
      return;
    }
    joinMutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <Users className="h-16 w-16 mx-auto text-primary" aria-hidden="true" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Join {invite.teamName}</h1>
          <p className="text-muted-foreground">
            {invite.memberCount} member{invite.memberCount !== 1 ? "s" : ""}
          </p>
        </div>

        {joinMutation.error && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md" role="alert">
            {joinMutation.error.message}
          </div>
        )}

        <Button
          size="lg"
          onClick={handleJoin}
          disabled={joinMutation.isPending}
          aria-busy={joinMutation.isPending}
          aria-label={session ? "Join this team" : "Sign in to join this team"}
        >
          {joinMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              Joining...
            </>
          ) : session ? (
            "Join Team"
          ) : (
            "Sign in to Join"
          )}
        </Button>

        {!session && (
          <p className="text-sm text-muted-foreground">
            You'll be redirected to sign in with GitHub
          </p>
        )}
      </div>
    </div>
  );
}

function JoinErrorPage({ error }: { error: Error }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <AlertCircle className="h-16 w-16 mx-auto text-destructive" aria-hidden="true" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Invalid Invite</h1>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
        <Button variant="outline" asChild>
          <a href="/" aria-label="Go to homepage">Go Home</a>
        </Button>
      </div>
    </div>
  );
}
```

---

## Out of Scope (MVP)

- Multiple teams per user (schema supports, app blocks)
- Team roles beyond owner/member
- Team-level settings
- Email notifications
- Audit log
- Ownership transfer (owner must delete team)

