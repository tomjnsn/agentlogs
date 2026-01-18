import { useState, useEffect } from "react";

const slides = [
  // 1. Title
  {
    content: (
      <>
        <h1>AgentLogs</h1>
        <h3>Observability for AI Coding Agents</h3>
        <p>Know where your AI spend goes — and whether it's working.</p>
      </>
    ),
  },
  // 2. Problem
  {
    content: (
      <>
        <h2>The Problem</h2>
        <p style={{ fontSize: "2rem", marginBottom: "2rem" }}>
          Engineering teams are spending $1000s/month on AI coding tools.
        </p>
        <ul>
          <li>No visibility into token spend by project, team, or developer</li>
          <li>No way to know if AI-assisted code is actually shipping</li>
          <li>Can't measure ROI or identify waste</li>
          <li>Flying blind on which repos/codebases work well with AI</li>
        </ul>
      </>
    ),
  },
  // 3. Market Size
  {
    content: (
      <>
        <h2>The Market</h2>
        <div className="stat-row">
          <div className="stat">
            <div className="stat-value">$50B+</div>
            <div className="stat-label">AI coding tools market by 2028</div>
          </div>
          <div className="stat">
            <div className="stat-value">92%</div>
            <div className="stat-label">of devs using AI assistants (GitHub)</div>
          </div>
        </div>
        <p style={{ marginTop: "3rem" }}>Every company with engineers is now an AI spend company.</p>
      </>
    ),
  },
  // 4. Solution
  {
    content: (
      <>
        <h2>AgentLogs</h2>
        <p style={{ marginBottom: "2rem" }}>The observability layer for AI coding agents.</p>
        <ul>
          <li>Capture transcripts from Claude Code, Codex, Cursor, Amp & more</li>
          <li>Track token spend, cost, and output per project/team/dev</li>
          <li>Automatic commit attribution — know which code is AI-assisted</li>
          <li>Productivity metrics: cost per merged line, waste ratio, ROI</li>
        </ul>
      </>
    ),
  },
  // 5. How it Works
  {
    content: (
      <>
        <h2>How It Works</h2>
        <ul>
          <li>
            <strong>CLI + Plugins</strong> — hooks into agent lifecycle, uploads transcripts
          </li>
          <li>
            <strong>Git Integration</strong> — correlates sessions with commits automatically
          </li>
          <li>
            <strong>Dashboard</strong> — real-time visibility for eng leaders
          </li>
          <li>
            <strong>Universal MCP Daemon</strong> — capture any agent, even without plugin APIs
          </li>
        </ul>
      </>
    ),
  },
  // 6. Traction / Status
  {
    content: (
      <>
        <h2>Status</h2>
        <ul>
          <li>Working product — CLI + web app on Cloudflare</li>
          <li>Claude Code plugin live, Codex & OpenCode support</li>
          <li>Team sharing & transcript visualization shipped</li>
          <li>Commit attribution in development</li>
        </ul>
        <p style={{ marginTop: "2rem", color: "#737373" }}>Ready for early design partners.</p>
      </>
    ),
  },
  // 7. Business Model
  {
    content: (
      <>
        <h2>Business Model</h2>
        <ul>
          <li>
            <strong>Free</strong> — unlimited open-source, 10 commits/mo private
          </li>
          <li>
            <strong>Pro ($19/mo)</strong> — unlimited private repos
          </li>
          <li>
            <strong>Enterprise</strong> — self-hosted, SSO, advanced analytics
          </li>
        </ul>
        <p style={{ marginTop: "2rem" }}>Land with individual devs, expand to teams and orgs.</p>
      </>
    ),
  },
  // 8. Competition
  {
    content: (
      <>
        <h2>Competitive Landscape</h2>
        <ul>
          <li>
            <strong>Dexicon</strong> — context injection INTO agents (complementary)
          </li>
          <li>
            <strong>Native dashboards</strong> — Anthropic/OpenAI usage pages (basic, no attribution)
          </li>
          <li>
            <strong>Nothing</strong> — no one owns cross-agent observability + commit correlation
          </li>
        </ul>
        <p style={{ marginTop: "2rem" }}>We're building the Datadog for AI coding spend.</p>
      </>
    ),
  },
  // 9. Team
  {
    content: (
      <>
        <h2>Team</h2>
        <div className="team">
          <div className="person">
            <div className="person-name">Philipp Spiess</div>
            <div className="person-role">Co-founder</div>
            <div className="person-cred">Ex-Meta (React DOM), Tailwind Labs</div>
            <div className="person-cred">Ex-Sourcegraph, PSPDFKit</div>
          </div>
          <div className="person">
            <div className="person-name">Valery Bugakov</div>
            <div className="person-role">Co-founder</div>
            <div className="person-cred">Ex-Sourcegraph (built Amp)</div>
            <div className="person-cred">Ex-Evil Martians</div>
          </div>
        </div>
        <p style={{ marginTop: "3rem", color: "#737373" }}>
          Deep in AI coding tools. Built the products, know the pain.
        </p>
      </>
    ),
  },
  // 10. Ask
  {
    content: (
      <>
        <h2>The Ask</h2>
        <div className="big-number">$1M</div>
        <h3>Pre-seed round</h3>
        <ul>
          <li>Ship universal agent capture (MCP daemon)</li>
          <li>Launch enterprise tier with advanced analytics</li>
          <li>Hire 1-2 engineers</li>
          <li>12-18 months runway</li>
        </ul>
      </>
    ),
  },
  // 11. Close
  {
    content: (
      <>
        <h1>AgentLogs</h1>
        <p style={{ fontSize: "1.8rem" }}>Observability for AI coding agents.</p>
        <p style={{ marginTop: "2rem", color: "#60a5fa" }}>agentlogs.ai</p>
        <p style={{ marginTop: "1rem", color: "#737373" }}>philipp@agentlogs.ai • valery@agentlogs.ai</p>
      </>
    ),
  },
];

export function App() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        setCurrent((c) => Math.min(c + 1, slides.length - 1));
      } else if (e.key === "ArrowLeft") {
        setCurrent((c) => Math.max(c - 1, 0));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="deck">
      <div className="logo">AgentLogs</div>
      <div className="slide">{slides[current].content}</div>
      <div className="nav">
        <button onClick={() => setCurrent((c) => Math.max(c - 1, 0))}>←</button>
        <span>
          {current + 1} / {slides.length}
        </span>
        <button onClick={() => setCurrent((c) => Math.min(c + 1, slides.length - 1))}>→</button>
      </div>
    </div>
  );
}
