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

type Integration = "claude-code" | "codex" | "cursor" | "windsurf" | "other";

const integrations: { id: Integration; name: string; available: boolean }[] = [
  { id: "claude-code", name: "Claude Code", available: true },
  { id: "codex", name: "Codex", available: true },
  { id: "cursor", name: "Cursor", available: false },
  { id: "windsurf", name: "Windsurf", available: false },
  { id: "other", name: "Other", available: false },
];

function LandingPage() {
  const [activeTab, setActiveTab] = useState<Integration>("claude-code");

  return (
    <div className="min-h-screen bg-neutral-900 px-6 py-12 font-mono text-neutral-300 md:px-12 md:py-20">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <header className="mb-16">
          <div className="mb-8 flex items-center justify-between">
            <span className="text-xl">🔮</span>
            <Link to="/sign-in" className="text-sm text-neutral-500 hover:text-neutral-300">
              sign in
            </Link>
          </div>

          <h1 className="mb-4 text-2xl text-neutral-100">vibeinsights</h1>
          <p className="text-neutral-400">
            observability for ai coding agents. capture transcripts. see what your ai actually does.
          </p>
        </header>

        {/* Install */}
        <section className="mb-16">
          <h2 className="mb-6 text-neutral-500">## install</h2>

          {/* Tabs */}
          <div className="mb-4 flex gap-1 border-b border-neutral-800">
            {integrations.map((integration) => (
              <button
                key={integration.id}
                onClick={() => setActiveTab(integration.id)}
                className={`px-3 py-2 text-sm ${
                  activeTab === integration.id
                    ? "border-b border-neutral-300 text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-400"
                } ${!integration.available ? "opacity-50" : ""}`}
              >
                {integration.name}
                {!integration.available && " *"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="bg-neutral-950 p-4">
            {activeTab === "claude-code" && (
              <pre className="text-sm leading-loose">
                <code>
                  {`# add plugin
$ /plugin marketplace add vibeinsights/claude-code
$ /plugin install vibeinsights

# login
$ vibeinsights login

# done. transcripts auto-captured.`}
                </code>
              </pre>
            )}

            {activeTab === "codex" && (
              <pre className="text-sm leading-loose">
                <code>
                  {`# install cli
$ npm install -g @vibeinsights/cli

# login
$ vibeinsights login

# add to ~/.codex/config.yaml
hooks:
  session_end:
    - vibeinsights codex upload`}
                </code>
              </pre>
            )}

            {(activeTab === "cursor" || activeTab === "windsurf" || activeTab === "other") && (
              <pre className="text-sm leading-loose text-neutral-500">
                <code>{`# coming soon`}</code>
              </pre>
            )}
          </div>

          <p className="mt-2 text-xs text-neutral-600">* coming soon</p>
        </section>

        {/* How it works */}
        <section className="mb-16">
          <h2 className="mb-6 text-neutral-500">## how it works</h2>
          <pre className="text-sm leading-loose">
            <code>
              {`1. plugin hooks into your coding agent
2. transcripts uploaded on session end
3. browse/search sessions in dashboard
4. (soon) analyze patterns, spot issues`}
            </code>
          </pre>
        </section>

        {/* Self host */}
        <section className="mb-16">
          <h2 className="mb-6 text-neutral-500">## self-host</h2>
          <div className="bg-neutral-950 p-4">
            <pre className="text-sm leading-loose">
              <code>
                {`$ export VIBEINSIGHTS_BASE_URL=https://your-instance.com
$ vibeinsights login`}
              </code>
            </pre>
          </div>
          <p className="mt-2 text-sm text-neutral-500">runs on cloudflare workers. your data.</p>
        </section>

        {/* CTA */}
        <section className="mb-16 border-t border-neutral-800 pt-12">
          <Link
            to="/sign-in"
            className="inline-block border border-neutral-700 px-6 py-3 text-sm hover:border-neutral-500 hover:text-neutral-100"
          >
            get started →
          </Link>
        </section>

        {/* Footer */}
        <footer className="text-xs text-neutral-600">
          <a
            href="https://github.com/vibeinsights"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-neutral-400"
          >
            github
          </a>
        </footer>
      </div>
    </div>
  );
}
