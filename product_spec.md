# 🧠 Product Spec: Vibe Insights (VI)

## 1. Product Idea — _"Observability for Agentic Coding"_

**Concept:**
VI captures and analyzes all **Claude Code transcripts** (full user ↔ assistant ↔ tool conversations) across an organization to surface **anti-patterns, performance bottlenecks, and improvement opportunities** in how engineers use AI coding assistants.

It then proposes or even commits **automated improvements** — e.g., editing `agent.md`, adjusting Claude Code settings, adding hooks or feedback loops, or restructuring repos to make agentic coding smoother and more effective.

**Analogy:**

> GitHub Copilot → "autocomplete"
> Sourcegraph → "search"
> VI → "introspection layer for AI-assisted development"

---

## 2. Value Proposition

| Value Axis        | Description                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Visibility**    | Full per-repo transcript capture: see exactly how engineers interact with Claude Code, what works, what fails, and where friction occurs. |
| **Optimization**  | Detect recurring issues (retries, tool failures, context overflows) and generate actionable recommendations.                              |
| **Governance**    | Centralized transcript storage with enterprise-grade privacy (self-hosted). Optional zero-retention upstream configuration.               |
| **Acceleration**  | Suggest concrete repo or config changes that improve "agentic loop throughput" (less spinning, more accepted changes).                    |
| **Learning Loop** | Aggregate lessons from thousands of sessions into best practices per repo or team.                                                        |

---

## 3. Target Audience

| Persona                                  | Needs                                             | Why They Care                                    |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| **VP of Engineering / Head of Platform** | ROI of AI assistants, standardization, compliance | Visibility + measurable improvement              |
| **Staff Engineer / Tech Lead**           | Improve team efficiency, diagnose "AI thrash"     | Diagnoses usage patterns, teaches best practices |
| **AI/DevEx Platform Teams**              | Manage internal Claude Code deployments           | Unified telemetry + full transcript archive      |
| **Enterprises (Fintech, Health, Gov)**   | Self-hosted, audit logs, no cloud data leak       | VI acts as local observability & insight layer   |

---

## 4. Market & Competitors

| Category                       | Examples                                                   | Strengths                 | Gap VI Fills                                       |
| ------------------------------ | ---------------------------------------------------------- | ------------------------- | -------------------------------------------------- |
| **LLM Observability**          | Langfuse, Helicone, LangSmith, TruEra                      | Great tracing/evals       | No repo-context, no action generation              |
| **AI Coding Analytics**        | Anthropic Claude Code Analytics, GitHub Copilot Enterprise | Aggregated metrics only   | No transcript content, no per-repo feedback        |
| **Dev Productivity Analytics** | LinearB, Swarmia, Pluralsight Flow                         | Code throughput metrics   | Not AI-specific, no model behavior insights        |
| **AI Agents/Orchestration**    | LangChain, Semantic Kernel, Continue                       | Agent frameworks          | No org-level learning or optimization              |
| **Potential Threat**           | Anthropic or GitHub could expand into this                 | Deep platform integration | VI must stay cross-vendor, multi-repo, self-hosted |

---

## 5. Integration Points

| Layer                               | Integration Method                                                   | Data You Get                                                | Notes                                      |
| ----------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| **Claude Code Plugins + Hooks**     | Subscribe to `UserPromptSubmit`, `PostToolUse`, `Stop`, `SessionEnd` | Path to full transcript (`transcript_path`) + tool metadata | Official hooks API, stable JSON schema     |
| **Claude Code SDK / Headless Mode** | Run sessions programmatically                                        | Stream JSON of full message flow                            | Ideal for CI capture & backfills           |
| **LLM Gateway (LiteLLM / Proxy)**   | Route all API calls through a self-hosted proxy                      | Raw request/response pairs                                  | Adds audit trail + cost tracking           |
| **OpenTelemetry (OTel)**            | Enable Claude Code telemetry                                         | Metrics/events (timing, retries, failures)                  | Redacted by default; opt-in to log prompts |
| **GitHub App**                      | Repo access, metadata, commits, agent.md                             | Links transcripts → code outcomes                           | Enables automatic PR generation            |
| **Storage Layer**                   | Bun SQLite (POC) → PostgreSQL (production)                           | Persistent session transcripts + derived features           | Supports redaction, indexing, analytics    |

---

## 6. Technical Architecture (Simplified POC Approach)

### Overview

**Monorepo Structure:**

```
vibeinsights/
├── packages/
│   ├── plugin/      # Claude Code plugin (150 lines)
│   └── server/      # All-in-one: API + Analyzer + Web (1200 lines)
```

**Key Design Principles:**

- **POC-first**: Absolute minimum to demonstrate value
- **Type-safe**: TypeScript strict mode + Zod validation
- **Fast iteration**: Bun for zero-config development
- **Self-hosted**: SQLite → PostgreSQL migration path

---

### Plugin Package (`packages/plugin`)

**Technology:**

- Pure TypeScript functions (no classes)
- Zod for validation
- Bun runtime

**Files:**

```
plugin/
├── src/
│   ├── hooks.ts       # Hook handlers (~100 lines)
│   ├── upload.ts      # Upload function (~50 lines)
│   └── index.ts       # Re-exports (~5 lines)
└── .claude-plugin/
    └── manifest.json  # Plugin configuration
```

**Responsibilities:**

- Subscribe to `UserPromptSubmit` and `SessionEnd` hooks
- Read transcript deltas from `transcript_path`
- Extract repo metadata (single git command)
- Upload to server via HTTP POST
- **Fail-open**: Never block IDE on errors

**Key Implementation Details:**

```typescript
// Simple state management
const sessionState = new Map<
  string,
  {
    events: TranscriptEvent[];
    repoId: string;
  }
>();

// Upload on session end
await uploadTranscript({
  repoId: session.repoId,
  sessionId: session_id,
  events: session.events,
});
```

---

### Server Package (`packages/server`)

**Technology:**

- Hono (fast HTTP framework)
- Bun SQLite (POC) → PostgreSQL (production)
- Server-rendered JSX for web UI
- Tailwind CSS via CDN

**Files:**

```
server/
├── src/
│   ├── types.ts        # All types + Zod schemas (~300 lines)
│   ├── db.ts           # SQLite setup + queries (~150 lines)
│   ├── api.ts          # REST API routes (~200 lines)
│   ├── analyzer.ts     # Analysis logic (~300 lines)
│   ├── web.tsx         # Web pages (~200 lines)
│   └── index.ts        # Server entry point (~50 lines)
```

**Database Schema (SQLite):**

```sql
CREATE TABLE repos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  transcript_count INTEGER DEFAULT 0,
  last_activity TEXT
);

CREATE TABLE transcripts (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  session_id TEXT,
  events TEXT NOT NULL,  -- JSON array
  created_at INTEGER DEFAULT (unixepoch()),
  analyzed BOOLEAN DEFAULT FALSE
);

CREATE TABLE analysis (
  transcript_id TEXT PRIMARY KEY,
  retry_count INTEGER,
  error_count INTEGER,
  tool_failure_rate REAL,
  context_overflows INTEGER,
  health_score INTEGER,
  anti_patterns TEXT,      -- JSON array
  recommendations TEXT,    -- JSON array
  analyzed_at INTEGER
);
```

**API Endpoints:**

```
POST /api/ingest                    # Receive transcript from plugin
GET  /api/repos                     # List all repositories
GET  /api/repos/:id/transcripts     # Get transcripts for a repo
GET  /api/transcripts/:id           # Get full transcript + analysis
```

**Web Routes:**

```
GET  /                              # Dashboard (repo list)
GET  /repos/:id                     # Repo detail (transcripts + insights)
GET  /transcripts/:id               # Transcript viewer
```

---

### Analysis Engine (`analyzer.ts` in server)

**Heuristics (Deterministic):**

1. **Retry Loop Detection**
   - Pattern: Same tool called 2+ times consecutively
   - Threshold: 3+ retries = medium severity, 5+ = high severity

2. **Context Overflow Detection**
   - Pattern: Errors containing "context", "token limit", "too large"
   - Also flags large file reads (>100KB)

3. **Tool Failure Rate**
   - Calculate: errors / total tool calls
   - Flag if > 30% failure rate for any tool

4. **Missing Tests**
   - Pattern: Code changes (Write/Edit) without test execution (Bash with test commands)

**Health Score Calculation (0-100):**

```typescript
let score = 100;
score -= retries * 5; // -5 per retry
score -= errors * 3; // -3 per error
score -= contextOverflows * 10; // -10 per overflow
score -= highSeverityPatterns * 15; // -15 per high severity
score -= mediumSeverityPatterns * 10; // -10 per medium severity
return Math.max(0, Math.min(100, score));
```

**Output:**

```typescript
{
  transcriptId: string;
  metrics: {
    totalEvents: number;
    toolCalls: number;
    errors: number;
    retries: number;
    contextOverflows: number;
  };
  antiPatterns: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  recommendations: string[];
  healthScore: number; // 0-100
}
```

---

## 7. POC Implementation Timeline (5 Days)

| Day       | Focus          | Deliverables                                          | Time    |
| --------- | -------------- | ----------------------------------------------------- | ------- |
| **Day 1** | Infrastructure | Monorepo setup, packages initialized, database schema | 2 hours |
| **Day 2** | Plugin         | Hook handlers, upload logic, local testing            | 2 hours |
| **Day 3** | API + DB       | Types, database, REST endpoints, test with curl       | 4 hours |
| **Day 4** | Analysis + Web | Analyzer logic, web pages, browser testing            | 4 hours |
| **Day 5** | Integration    | End-to-end testing, bug fixes, demo prep              | 2 hours |

**Total: ~14 hours over 5 days**

---

## 8. Success Criteria (POC Validation)

| Metric                 | Target                                      | How to Measure                    |
| ---------------------- | ------------------------------------------- | --------------------------------- |
| **Transcript capture** | ≥95% successful uploads                     | Monitor server logs               |
| **Analysis accuracy**  | Correctly identifies 3+ anti-pattern types  | Manual review of 10 sessions      |
| **Performance**        | Analysis completes in <500ms per transcript | Measure with Bun's built-in timer |
| **UI functionality**   | Can view repos, transcripts, and analysis   | Manual testing in browser         |
| **End-to-end flow**    | Plugin → Server → Analysis → Web (working)  | Full integration test             |

---

## 9. Migration Path to Production

### Phase 1 → Phase 2 (Post-POC)

**When to enhance:**

- SQLite → PostgreSQL: When >100k transcripts or need multi-region
- Simple analysis → LLM insights: When basic heuristics prove value
- Monolithic server → Microservices: When team has 5+ developers
- Single file → Split packages: When files exceed 500 lines

**Migration is designed to be easy:**

```typescript
// Database: Just swap the driver
import { Database } from "bun:sqlite"; // POC

// to
import { drizzle } from "drizzle-orm/postgres-js"; // Production

// Files: Extract when needed
// analyzer.ts (300 lines) → split when hits 500+ lines
// api.ts (200 lines) → split when hits 500+ lines
```

---

## 10. Key Constraints & Trade-offs

### POC Constraints (Accepted)

✅ **SQLite only** - Fast, zero-config, good for <100k transcripts
✅ **No queue system** - Analysis runs in setTimeout() (fine for POC)
✅ **Bearer token auth** - Simple, secure if kept secret
✅ **No retry logic** - Uploads fail-open (just log and continue)
✅ **Inline code** - Extract abstractions only when copied 3+ times

### Production Requirements (Later)

⏰ **PostgreSQL + Redis** - Better concurrency, queueing
⏰ **OAuth/RBAC** - Proper authentication system
⏰ **Retry with backoff** - Reliable upload guarantees
⏰ **Observability** - OpenTelemetry, metrics, alerting
⏰ **Multi-tenancy** - Organization/team isolation

---

## 11. Privacy & Security

**Self-Hosted First:**

- All data stays on customer infrastructure
- No cloud dependencies (except optional Claude API)
- Encrypted transport (HTTPS)
- Bearer token authentication

**Redaction Options (Future):**

- PII detection and masking
- Configurable retention policies
- Opt-out per repo or user
- Export/delete controls (GDPR compliance)

---

## 12. Monetization Strategy

| Model                   | Description                                 | Pricing            |
| ----------------------- | ------------------------------------------- | ------------------ |
| **Self-Hosted License** | Annual license for unlimited users          | $10k-$50k/year     |
| **SaaS (Future)**       | Hosted version with per-seat pricing        | $20-$40/user/month |
| **Enterprise Support**  | Dedicated support + custom features         | $25k-$100k/year    |
| **Free Tier**           | Open source core + paid enterprise features | $0                 |

**Pilot Strategy:**

- Free 30-day trial for teams (5-20 engineers)
- Focus on demonstrating ROI (reduced retries, faster sessions)
- Partner with DevEx/Platform teams

---

## 13. Strategic Outlook

**Vision:** VI becomes the "Datadog of AI-assisted development" — monitoring and optimizing _how code is written by humans + agents together_.

**Future Scope:**

- Multi-vendor analytics (Claude, Copilot, Cursor)
- Unified agent-efficiency benchmark
- Automatic feedback loop generation
- Real-time session monitoring
- Team collaboration insights

**Exit Routes:**

- Acquisition by Anthropic, GitHub, Sourcegraph, or observability companies
- IPO as standalone developer tools company

---

## 14. Next Steps

### Immediate (Today)

✅ Review and approve this spec
✅ Initialize monorepo structure
✅ Setup development environment (Bun + pnpm)

### This Week (Days 1-5)

1. **Day 1**: Setup infrastructure
2. **Day 2**: Build plugin
3. **Day 3**: Build API + database
4. **Day 4**: Build analyzer + web UI
5. **Day 5**: Integration testing + demo

### Next Week

- Deploy to first pilot team
- Gather feedback
- Iterate on analysis heuristics
- Plan Phase 2 features

---

**Document Status**: ✅ Updated to match v2 simplified implementation
**Last Updated**: 2025-10-10
**Ready to Build**: Yes - all technical decisions made
