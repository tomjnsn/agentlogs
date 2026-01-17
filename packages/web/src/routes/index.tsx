import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ClaudeCodeIcon, OpenCodeIcon } from "../components/icons/source-icons";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

type Integration = "claude-code" | "opencode";

const integrations: { id: Integration; name: string }[] = [
  { id: "claude-code", name: "Claude Code" },
  { id: "opencode", name: "OpenCode" },
];

const installCommands: Record<Integration, string> = {
  "claude-code": `# add plugin
/plugin marketplace add agentlogs/claude-code
/plugin install agentlogs

# authenticate
agentlogs login`,
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
    <main className="dark mx-auto max-w-4xl overflow-hidden scheme-dark">
      <div className="min-h-screen border-x border-white/10">
        {/* Header */}
        <header className="line-b flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 p-4">
            <span className="font-mono text-lg text-white/90">AgentLogs</span>
          </div>
          <div className="flex h-full items-center font-mono text-white/90">
            <a
              href="/auth/github"
              className="flex h-full items-center border-l border-white/10 px-6 py-2 hover:bg-white/5 hover:underline"
            >
              Sign in
            </a>
          </div>
        </header>

        {/* Hero */}
        <section className="bg-dot-pattern relative flex flex-col items-center justify-center py-24">
          <h1 className="ml-4 text-center font-serif text-[60px] leading-[1.1] tracking-tight text-white/95 md:text-[80px]">
            Prompts deserve git
          </h1>

          <p className="mt-8 ml-4 max-w-xl text-center font-mono text-lg text-pretty text-white/80">
            Prompt history for teams. Learn what works. Ship faster together.
          </p>

          <a
            href="/auth/github"
            className="mt-16 ml-4 inline-block border border-white/20 bg-white/80 px-6 py-3 text-center font-mono text-lg text-neutral-950 shadow-[4px_4px_0_var(--color-neutral-600)] hover:bg-white/90 active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
          >
            Join the waitlist
          </a>

          <p className="mt-6 font-mono text-sm text-white/50">Free for open source</p>

          {/* Supported tools */}
          <div className="mt-12 flex items-center gap-6 text-white/60">
            <span className="font-mono text-sm">Works with:</span>
            <div className="flex items-center gap-2">
              <ClaudeCodeIcon className="size-4" />
              <span className="font-mono text-sm">Claude Code</span>
            </div>
            <span className="font-mono text-sm text-white/30">|</span>
            <div className="flex items-center gap-2">
              <OpenCodeIcon className="size-4" />
              <span className="font-mono text-sm">OpenCode</span>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="line-y">
          <div className="grid grid-cols-1 md:grid-cols-3">
            {/* Feature 1: Every session captured */}
            <div className="flex min-h-[280px] flex-col border-b border-white/10 bg-transparent p-6 md:border-r">
              <h3 className="mb-2 font-mono text-lg text-white/90">Every session, captured</h3>
              <p className="font-mono text-sm leading-relaxed text-white/50">
                AI sessions automatically uploaded when they end. No manual exports.
              </p>
              <div className="mt-auto flex flex-1 items-center justify-center pt-4">
                {/* Upload animation - floating documents */}
                <svg viewBox="0 0 120 80" className="h-24 w-full">
                  {/* Cloud shape */}
                  <path
                    d="M85 35c0-11-9-20-20-20-8 0-15 5-18 12-2-1-4-2-7-2-8 0-15 7-15 15s7 15 15 15h45c8 0 15-7 15-15 0-3-1-6-3-8"
                    fill="none"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="1"
                    className="animate-node-pulse"
                  />
                  {/* Floating documents */}
                  <g className="animate-float-up" style={{ animationDelay: "0s" }}>
                    <rect
                      x="40"
                      y="55"
                      width="12"
                      height="16"
                      fill="none"
                      stroke="rgba(255,255,255,0.4)"
                      strokeWidth="1"
                    />
                    <line x1="43" y1="60" x2="49" y2="60" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                    <line x1="43" y1="64" x2="49" y2="64" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                  </g>
                  <g className="animate-float-up" style={{ animationDelay: "0.5s" }}>
                    <rect
                      x="55"
                      y="58"
                      width="12"
                      height="16"
                      fill="none"
                      stroke="rgba(255,255,255,0.4)"
                      strokeWidth="1"
                    />
                    <line x1="58" y1="63" x2="64" y2="63" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                    <line x1="58" y1="67" x2="64" y2="67" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                  </g>
                  <g className="animate-float-up" style={{ animationDelay: "1s" }}>
                    <rect
                      x="70"
                      y="52"
                      width="12"
                      height="16"
                      fill="none"
                      stroke="rgba(255,255,255,0.4)"
                      strokeWidth="1"
                    />
                    <line x1="73" y1="57" x2="79" y2="57" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                    <line x1="73" y1="61" x2="79" y2="61" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                  </g>
                </svg>
              </div>
            </div>

            {/* Feature 2: See what works */}
            <div className="flex min-h-[280px] flex-col border-b border-white/10 bg-transparent p-6 md:border-r">
              <h3 className="mb-2 font-mono text-lg text-white/90">See what actually works</h3>
              <p className="font-mono text-sm leading-relaxed text-white/50">
                Browse your team's prompts. Learn the patterns that ship features.
              </p>
              <div className="mt-auto flex items-center justify-center pt-4">
                {/* Radar/search animation */}
                <div className="relative size-28">
                  {/* Radar circles */}
                  <div className="absolute inset-0 rounded-full border border-white/10" />
                  <div className="absolute inset-4 rounded-full border border-white/10" />
                  <div className="absolute inset-8 rounded-full border border-white/10" />
                  {/* Crosshairs */}
                  <div className="absolute top-1/2 right-0 left-0 h-px bg-white/10" />
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/10" />
                  {/* Sweep line */}
                  <div className="animate-radar-sweep absolute inset-0 origin-center">
                    <div className="absolute top-1/2 left-1/2 h-px w-1/2 origin-left bg-linear-to-r from-white/60 to-transparent" />
                  </div>
                  {/* Blips */}
                  <div
                    className="absolute top-[28%] right-[22%] size-2 rounded-full bg-white"
                    style={{ animation: "radar-blip 4s ease-out infinite", animationDelay: "3.5s" }}
                  />
                  <div
                    className="absolute bottom-[30%] left-[28%] size-1.5 rounded-full bg-white"
                    style={{ animation: "radar-blip 4s ease-out infinite", animationDelay: "1.5s" }}
                  />
                </div>
              </div>
            </div>

            {/* Feature 3: Link to code */}
            <div className="flex min-h-[280px] flex-col border-b border-white/10 bg-transparent p-6">
              <h3 className="mb-2 font-mono text-lg text-white/90">Link to the code</h3>
              <p className="font-mono text-sm leading-relaxed text-white/50">
                Sessions linked to git commits. See exactly what AI produced.
              </p>
              <div className="mt-auto flex flex-1 items-center justify-center pt-4">
                {/* Git connection animation */}
                <svg viewBox="0 0 140 100" className="h-28 w-full">
                  {/* Nodes */}
                  <rect
                    x="10"
                    y="38"
                    width="24"
                    height="24"
                    fill="none"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="1"
                    className="animate-node-pulse"
                    style={{ animationDelay: "0s" }}
                  />
                  <rect
                    x="58"
                    y="38"
                    width="24"
                    height="24"
                    fill="none"
                    stroke="rgba(255,255,255,0.4)"
                    strokeWidth="1"
                    className="animate-node-pulse"
                    style={{ animationDelay: "0.3s" }}
                  />
                  <rect
                    x="106"
                    y="38"
                    width="24"
                    height="24"
                    fill="none"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="1"
                    className="animate-node-pulse"
                    style={{ animationDelay: "0.6s" }}
                  />
                  {/* Connection lines */}
                  <line
                    x1="34"
                    y1="50"
                    x2="58"
                    y2="50"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="1"
                    className="animate-draw-line"
                    style={{ animationDelay: "0.2s" }}
                  />
                  <line
                    x1="82"
                    y1="50"
                    x2="106"
                    y2="50"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="1"
                    className="animate-draw-line"
                    style={{ animationDelay: "0.4s" }}
                  />
                  {/* Labels */}
                  <text x="22" y="75" className="fill-white/30 font-mono text-[8px]" textAnchor="middle">
                    session
                  </text>
                  <text x="70" y="75" className="fill-white/30 font-mono text-[8px]" textAnchor="middle">
                    commit
                  </text>
                  <text x="118" y="75" className="fill-white/30 font-mono text-[8px]" textAnchor="middle">
                    code
                  </text>
                  {/* Active dot */}
                  <circle cx="70" cy="50" r="3" fill="rgba(255,255,255,0.7)" className="animate-node-pulse" />
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* Quote */}
        <section className="bg-dot-pattern line-b py-16">
          <blockquote className="mx-auto max-w-2xl px-6 text-center font-serif text-2xl leading-snug text-white/90 md:text-3xl">
            "Some devs 10x with AI.
            <br />
            <span className="text-white/50">Now everyone can see how."</span>
          </blockquote>
        </section>

        {/* Install */}
        <section className="line-b px-6 py-16">
          <p className="mb-8 font-mono text-sm tracking-wide text-white/50 uppercase">Install</p>

          {/* Tabs */}
          <div className="mb-6 flex gap-1 border-b border-white/10">
            {integrations.map((integration) => (
              <button
                key={integration.id}
                onClick={() => setActiveTab(integration.id)}
                className={`-mb-px px-4 py-2.5 font-mono text-sm transition-colors ${
                  activeTab === integration.id
                    ? "border-b border-white/90 text-white/90"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                {integration.name}
              </button>
            ))}
          </div>

          {/* Code block */}
          <div className="border border-white/10 bg-white/5 p-6">
            <pre className="overflow-x-auto font-mono text-sm leading-relaxed text-white/80">
              <code>{installCommands[activeTab]}</code>
            </pre>
          </div>

          <p className="mt-6 font-mono text-sm text-white/50">Transcripts auto-captured on session end.</p>
        </section>

        {/* CTA */}
        <section className="bg-dot-pattern line-b py-20 text-center">
          <p className="mb-8 font-mono text-white/60">Your best prompts shouldn't disappear into chat history.</p>
          <a
            href="/auth/github"
            className="inline-block border border-white/20 px-6 py-3 font-mono text-sm text-white/90 hover:border-white/50 hover:text-white"
          >
            Get started →
          </a>
        </section>

        {/* Footer */}
        <footer className="bg-dot-pattern line-t flex min-h-20 items-center justify-center">
          <p className="font-mono text-sm text-white/50">© 2025 AgentLogs. All rights reserved.</p>
        </footer>
      </div>
    </main>
  );
}
