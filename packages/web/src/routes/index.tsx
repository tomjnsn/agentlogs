import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { getSession } from "../lib/server-functions";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (session) {
      throw redirect({ to: "/app" });
    }
  },
  component: LandingPage,
});

type Integration = "claude-code" | "codex" | "opencode";

const integrations: { id: Integration; name: string }[] = [
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "opencode", name: "OpenCode" },
];

const installCommands: Record<Integration, string> = {
  "claude-code": `# add plugin
/plugin marketplace add agentlogs/claude-code
/plugin install agentlogs

# authenticate
agentlogs login`,
  codex: `# install cli
npm install -g @agentlogs/cli

# authenticate
agentlogs login

# add to ~/.codex/config.yaml
hooks:
  session_end:
    - agentlogs codex upload`,
  opencode: `# install cli
npm install -g @agentlogs/cli

# authenticate
agentlogs login

# add to ~/.opencode/config.yaml
hooks:
  session_end:
    - agentlogs opencode upload`,
};

function LandingPage() {
  const [activeTab, setActiveTab] = useState<Integration>("claude-code");

  return (
    <>
      {/* Geist font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400&display=swap"
        rel="stylesheet"
      />

      <div
        className="min-h-screen bg-neutral-950 text-neutral-100"
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        {/* Dot grid background */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, rgb(38 38 38 / 0.5) 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative">
          {/* Header */}
          <header className="border-b border-neutral-900">
            <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
              <span className="text-lg font-medium tracking-tight">agentlogs</span>
              <a href="/auth/github" className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors">
                Sign in
              </a>
            </div>
          </header>

          {/* Hero */}
          <section className="border-b border-neutral-900">
            <div className="mx-auto max-w-5xl px-6 py-24 md:py-32">
              <div className="max-w-2xl">
                <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1] mb-6">
                  See how your best
                  <br />
                  engineers prompt
                </h1>
                <p className="text-lg md:text-xl text-neutral-400 mb-10 leading-relaxed">
                  Prompt history for teams. Learn what works. Ship faster together.
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <Link
                    to="/app"
                    className="inline-flex items-center px-5 py-2.5 bg-neutral-100 text-neutral-950 text-sm font-medium hover:bg-neutral-200 transition-colors"
                  >
                    View Demo
                  </Link>
                  <span className="text-xs text-neutral-600 border border-neutral-800 px-3 py-1.5">
                    Free for open source
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Features */}
          <section className="border-b border-neutral-900">
            <div className="mx-auto max-w-5xl px-6 py-20">
              <p className="text-neutral-500 text-sm mb-12 tracking-wide uppercase">How it works</p>
              <div className="grid md:grid-cols-3 gap-12 md:gap-8">
                <div className="space-y-4">
                  <div className="w-8 h-8 border border-neutral-800 flex items-center justify-center text-neutral-500 text-sm">
                    1
                  </div>
                  <h3 className="text-lg font-medium">Every session, captured</h3>
                  <p className="text-neutral-500 leading-relaxed">
                    AI sessions automatically uploaded when they end. No manual exports.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="w-8 h-8 border border-neutral-800 flex items-center justify-center text-neutral-500 text-sm">
                    2
                  </div>
                  <h3 className="text-lg font-medium">See what actually works</h3>
                  <p className="text-neutral-500 leading-relaxed">
                    Browse your team's prompts. Learn the patterns that ship features.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="w-8 h-8 border border-neutral-800 flex items-center justify-center text-neutral-500 text-sm">
                    3
                  </div>
                  <h3 className="text-lg font-medium">Link to the code</h3>
                  <p className="text-neutral-500 leading-relaxed">
                    Sessions linked to git commits. See exactly what AI produced.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Key message */}
          <section className="border-b border-neutral-900">
            <div className="mx-auto max-w-5xl px-6 py-20">
              <blockquote className="text-2xl md:text-3xl text-neutral-300 font-medium leading-snug max-w-3xl">
                "Some devs 10x with AI.
                <br />
                <span className="text-neutral-500">Now everyone can see how."</span>
              </blockquote>
            </div>
          </section>

          {/* Demo placeholder */}
          <section className="border-b border-neutral-900">
            <div className="mx-auto max-w-5xl px-6 py-20">
              <p className="text-neutral-500 text-sm mb-8 tracking-wide uppercase">Preview</p>
              <div className="border border-neutral-800 bg-neutral-900/30 aspect-video flex items-center justify-center">
                <div className="text-center">
                  <p className="text-neutral-600 text-sm mb-4">Dashboard preview</p>
                  <Link to="/app" className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors">
                    View live demo →
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* Install */}
          <section className="border-b border-neutral-900">
            <div className="mx-auto max-w-5xl px-6 py-20">
              <p className="text-neutral-500 text-sm mb-8 tracking-wide uppercase">Install</p>

              {/* Tabs */}
              <div className="flex gap-1 mb-6 border-b border-neutral-800">
                {integrations.map((integration) => (
                  <button
                    key={integration.id}
                    onClick={() => setActiveTab(integration.id)}
                    className={`px-4 py-2.5 text-sm transition-colors ${
                      activeTab === integration.id
                        ? "text-neutral-100 border-b border-neutral-100 -mb-px"
                        : "text-neutral-500 hover:text-neutral-400"
                    }`}
                  >
                    {integration.name}
                  </button>
                ))}
              </div>

              {/* Code block */}
              <div className="bg-neutral-900/50 border border-neutral-800 p-6">
                <pre
                  className="text-sm text-neutral-300 leading-relaxed overflow-x-auto"
                  style={{ fontFamily: "'Geist Mono', monospace" }}
                >
                  <code>{installCommands[activeTab]}</code>
                </pre>
              </div>

              <p className="mt-6 text-sm text-neutral-600">Transcripts auto-captured on session end.</p>
            </div>
          </section>

          {/* Self-host */}
          <section className="border-b border-neutral-900">
            <div className="mx-auto max-w-5xl px-6 py-16">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div>
                  <h3 className="text-lg font-medium mb-2">Self-host</h3>
                  <p className="text-neutral-500 text-sm">Runs on Cloudflare Workers. Your data stays yours.</p>
                </div>
                <div
                  className="bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-neutral-400"
                  style={{ fontFamily: "'Geist Mono', monospace" }}
                >
                  AGENTLOGS_BASE_URL=https://your-instance.com
                </div>
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="border-b border-neutral-900">
            <div className="mx-auto max-w-5xl px-6 py-20 text-center">
              <p className="text-neutral-400 mb-8">Your best prompts shouldn't disappear into chat history.</p>
              <Link
                to="/auth/$"
                params={{ _splat: "github" }}
                className="inline-flex items-center px-6 py-3 border border-neutral-700 text-sm font-medium hover:border-neutral-500 hover:text-neutral-100 transition-colors"
              >
                Get started →
              </Link>
            </div>
          </section>

          {/* Footer */}
          <footer className="mx-auto max-w-5xl px-6 py-8 flex items-center justify-between text-sm text-neutral-600">
            <span>agentlogs</span>
            <a
              href="https://github.com/agentlogs"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-neutral-400 transition-colors"
            >
              GitHub
            </a>
          </footer>
        </div>
      </div>
    </>
  );
}
