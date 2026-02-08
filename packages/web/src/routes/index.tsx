import { createFileRoute } from "@tanstack/react-router";
import {
  ClaudeCodeIcon,
  CodexIcon,
  DiscordIcon,
  Logo,
  OpenCodeIcon,
  PiIcon,
  XIcon,
} from "../components/icons/source-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const agents = [
  { icon: ClaudeCodeIcon, name: "Claude Code", bg: "bg-[#e87b35]", fg: "text-white" },
  { icon: CodexIcon, name: "Codex CLI (experimental)", bg: "bg-black", fg: "text-white" },
  { icon: OpenCodeIcon, name: "OpenCode", bg: "bg-white", fg: "text-black" },
  { icon: PiIcon, name: "Pi", bg: "bg-black", fg: "text-white" },
];

const features = [
  {
    title: "Team Observability",
    description:
      "Full visibility into your team's AI coding sessions. Track activity, measure productivity, and understand how your team uses AI tools.",
    image: "/features/dashboard.png",
  },
  {
    title: "Git Integration",
    description: "See which session wrote which code. Works whenever your agent is the one committing.",
    image: "/features/git.png",
  },
  {
    title: "Learn From Each Other",
    description:
      "See what prompts your teammates are using and how they're solving problems. Build shared knowledge from real sessions.",
    image: "/features/list.png",
  },
];

const faqs = [
  {
    q: "How does AgentLogs capture my sessions?",
    a: "AgentLogs uses lightweight plugins for your coding agents. Install a plugin with a single command and it captures transcripts at the end of each session, automatically linking them to your git commits. No additional configuration needed.",
  },
  {
    q: "How does AgentLogs protect my secrets and sensitive data?",
    a: "AgentLogs automatically scans all transcripts for secrets before uploading, using 1,600+ detection patterns covering API keys, tokens, passwords, and database credentials. Detected secrets are redacted entirely on your machine. They never leave your computer in plain text.",
  },
  {
    q: "Who can see my transcripts?",
    a: "You control visibility for each transcript: Private (only you), Team (you and team members), or Public (anyone with the link). By default, transcripts from public repos are public, private repos are team-visible, and sessions without a detected repo are private. You can override this per repository.",
  },
  {
    q: "Which coding agents are supported?",
    a: "AgentLogs currently supports Claude Code, Codex CLI, and OpenCode. Each has its own integration method, and we're actively adding support for more agents. Check our docs for the latest compatibility info.",
  },
  {
    q: "How does AgentLogs compare to git-ai or agent-trace?",
    a: "Tools like git-ai and agent-trace focus on tracking AI attribution at the code level, recording which lines were AI-generated. AgentLogs focuses on the session and prompt level, capturing the full context of how code was created. We see these as complementary and plan to integrate them in the future. AgentLogs is the ideal platform for surfacing this kind of attribution data.",
  },
];

function LandingPage() {
  return (
    <div className="bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <a href="/" className="flex items-center gap-2 font-medium">
            <Logo className="size-5" />
            AgentLogs
          </a>
          <div className="flex items-center gap-5 text-sm">
            <a href="https://agentlogs.ai/docs" className="text-muted-foreground hover:text-foreground">
              Docs
            </a>
            <a
              href="/auth/github"
              className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90"
            >
              Join the waitlist
            </a>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 pt-24 pb-16 text-center">
          <div className="flex justify-center gap-1">
            {agents.map((agent) => (
              <Tooltip key={agent.name}>
                <TooltipTrigger asChild>
                  <span
                    className={`inline-flex size-10 items-center justify-center rounded-full ${agent.bg} ring-2 ring-background`}
                  >
                    <agent.icon className={`size-5 ${agent.fg}`} />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{agent.name}</TooltipContent>
              </Tooltip>
            ))}
          </div>
          <h1 className="mx-auto mt-8 max-w-3xl font-display text-4xl tracking-tight text-balance sm:text-6xl">
            Coding agents, visible to your team.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            See what prompts work, learn from each other's workflows, and build institutional knowledge that compounds.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <a
              href="/waitlist"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Join the waitlist
            </a>
            <a
              href="https://agentlogs.ai/s/ijz0z090jxrmmfjsz9lkcq7j"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              See it in action →
            </a>
          </div>
        </section>

        {/* Hero image */}
        <section className="mx-auto max-w-5xl px-6 pb-24">
          <img
            src="/features/detail.png"
            alt="AgentLogs session detail view"
            className="w-full rounded-lg border border-border shadow-2xl"
          />
        </section>

        {/* Features */}
        <section className="border-t border-border py-24">
          <div className="mx-auto max-w-5xl px-6">
            <p className="text-sm font-medium text-muted-foreground">Features</p>
            <h2 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">
              Everything you need to understand what your agents are doing.
            </h2>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Track every session, share context across your team, and build a knowledge base of prompts that actually
              work.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-5xl space-y-20 px-6">
            {features.map((f, i) => (
              <div
                key={f.title}
                className={`flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-12 ${i % 2 === 1 ? "lg:flex-row-reverse" : ""}`}
              >
                <div className="lg:w-1/2">
                  <h3 className="text-xl font-semibold">{f.title}</h3>
                  <p className="mt-2 text-muted-foreground">{f.description}</p>
                </div>
                <div className="lg:w-1/2">
                  <img src={f.image} alt={f.title} className="w-full rounded-lg border border-border" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-border py-24">
          <div className="mx-auto max-w-2xl px-6">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">Questions & Answers</h2>
            <div className="mt-10 space-y-0 divide-y divide-border">
              {faqs.map((faq) => (
                <details key={faq.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-base font-medium [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <span className="ml-4 text-muted-foreground transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border py-24">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">Want to adopt AgentLogs for your team?</h2>
            <p className="mt-3 text-muted-foreground">
              Reach out to fast-track your waitlist access and get dedicated onboarding support.
            </p>
            <a
              href="mailto:hi@agentlogs.ai"
              className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Contact us
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-5 px-6 text-sm text-muted-foreground">
          <div className="flex gap-6">
            <a href="https://agentlogs.ai/docs" className="hover:text-foreground">
              Docs
            </a>
            <a href="https://agentlogs.ai/docs/changelog" className="hover:text-foreground">
              Changelog
            </a>
            <a href="https://x.com/agentlogs" target="_blank" aria-label="X" className="hover:text-foreground">
              <XIcon className="size-4" />
            </a>
            <a
              href="https://discord.gg/yG4TNv3mjG"
              target="_blank"
              aria-label="Discord"
              className="hover:text-foreground"
            >
              <DiscordIcon className="size-4" />
            </a>
          </div>
          <p className="text-muted-foreground/60">&copy; {new Date().getFullYear()} AgentLogs</p>
        </div>
      </footer>
    </div>
  );
}
