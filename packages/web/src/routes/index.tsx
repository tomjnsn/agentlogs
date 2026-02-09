import { createFileRoute } from "@tanstack/react-router";
import {
  ClaudeCodeIcon,
  CodexIcon,
  DiscordIcon,
  GitHubIcon,
  Logo,
  OpenCodeIcon,
  PiIcon,
  XIcon,
} from "../components/icons/source-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const features = [
  {
    title: "Team Observability",
    description:
      "Full visibility into your team's AI coding sessions. Track activity, costs, agent & model usage, and per-member breakdowns — all in one dashboard.",
    image: "/features/dashboard.png",
  },
  {
    title: "Git Integration",
    description:
      "See which session wrote which code. Commits are automatically linked to the transcript that produced them.",
    image: "/features/git.png",
  },
  {
    title: "Learn From Each Other",
    description:
      "Browse your team's sessions to discover effective prompts and workflows. Build shared knowledge from real sessions.",
    image: "/features/list.png",
  },
];

const faqs = [
  {
    q: "Is AgentLogs really open-source?",
    a: "Yes. The entire codebase — CLI, web app, plugins — is MIT-licensed and on GitHub. You can self-host it on Cloudflare Workers with a single deploy command, or use our hosted version at agentlogs.ai.",
  },
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
    a: "AgentLogs supports Claude Code, Codex CLI, OpenCode, and Pi. Each has its own lightweight plugin, and we're actively adding support for more agents. Check our docs for the latest compatibility info.",
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
              href="https://github.com/agentlogs/agentlogs"
              target="_blank"
              className="text-muted-foreground hover:text-foreground"
              aria-label="GitHub"
            >
              <GitHubIcon className="size-5" />
            </a>
            <a
              href="/auth/github"
              className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90"
            >
              Get started
            </a>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 pt-24 pb-24">
          <h1 className="max-w-5xl font-display text-4xl tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Open-source observability for coding agents.{" "}
            <span className="group/icons inline-flex items-center align-middle">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    data-icon="claude"
                    className="isolate inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-[#e87b35] ring-3 ring-background transition-transform duration-200 group-has-[[data-icon=codex]:hover]/icons:-translate-x-1.5 group-has-[[data-icon=opencode]:hover]/icons:-translate-x-1.5 group-has-[[data-icon=pi]:hover]/icons:-translate-x-1.5 sm:size-14"
                  >
                    <ClaudeCodeIcon className="size-5 text-white sm:size-7" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Claude Code</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    data-icon="codex"
                    className="isolate -ml-1.5 inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-black ring-3 ring-background transition-transform duration-200 group-has-[[data-icon=claude]:hover]/icons:translate-x-1.5 group-has-[[data-icon=opencode]:hover]/icons:-translate-x-1.5 group-has-[[data-icon=pi]:hover]/icons:-translate-x-1.5 sm:size-14"
                  >
                    <CodexIcon className="size-5 text-white sm:size-7" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Codex CLI (experimental)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    data-icon="opencode"
                    className="isolate -ml-1.5 inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-white ring-3 ring-background transition-transform duration-200 group-has-[[data-icon=claude]:hover]/icons:translate-x-1.5 group-has-[[data-icon=codex]:hover]/icons:translate-x-1.5 group-has-[[data-icon=pi]:hover]/icons:-translate-x-1.5 sm:size-14"
                  >
                    <OpenCodeIcon className="size-5 text-black sm:size-7" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>OpenCode</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    data-icon="pi"
                    className="isolate -ml-1.5 inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-black ring-3 ring-background transition-transform duration-200 group-has-[[data-icon=claude]:hover]/icons:translate-x-1.5 group-has-[[data-icon=codex]:hover]/icons:translate-x-1.5 group-has-[[data-icon=opencode]:hover]/icons:translate-x-1.5 sm:size-14"
                  >
                    <PiIcon className="size-5 text-white sm:size-7" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Pi</TooltipContent>
              </Tooltip>
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Capture transcripts, track costs, link sessions to commits, and build shared knowledge across your team.
            Self-host or use our cloud.
          </p>
          <div className="mt-8 flex gap-3">
            <a
              href="https://agentlogs.ai/docs/introduction/getting-started"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Get started
            </a>
            <a
              href="https://github.com/agentlogs/agentlogs"
              target="_blank"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Star on GitHub →
            </a>
          </div>
        </section>

        {/* Hero image */}
        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="relative aspect-video overflow-hidden rounded-xl">
            <img
              src="/The_Fighting_Temeraire.jpg"
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover opacity-60"
            />
            <div className="relative px-[5%] pt-[5%]">
              <img
                src="/features/detail.png"
                alt="AgentLogs session detail view"
                className="w-full rounded-t-md shadow-2xl"
              />
            </div>
          </div>
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
                  <img
                    src={f.image}
                    alt={f.title}
                    className="aspect-video w-full rounded-lg border border-white/10 object-cover object-top"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Open Source */}
        <section className="border-t border-border py-24">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <p className="text-sm font-medium text-muted-foreground">Open Source</p>
            <h2 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">
              Own your data. Self-host in minutes.
            </h2>
            <p className="mt-3 text-muted-foreground">
              AgentLogs is MIT-licensed and deploys to Cloudflare Workers with a single command. Use our cloud or run it
              yourself — your transcripts, your infrastructure.
            </p>
            <pre className="mx-auto mt-8 max-w-md overflow-x-auto rounded-lg border border-border bg-zinc-950 px-6 py-4 text-left text-sm text-zinc-300">
              <code>{`git clone https://github.com/agentlogs/agentlogs
cd agentlogs && bun install
bun db:migrate && bun dev`}</code>
            </pre>
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
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
              Start capturing your team's AI sessions
            </h2>
            <p className="mt-3 text-muted-foreground">
              Set up in under a minute. Self-host or use our cloud — it's free to get started.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <a
                href="https://agentlogs.ai/docs/introduction/getting-started"
                className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Get started
              </a>
              <a
                href="https://github.com/agentlogs/agentlogs"
                target="_blank"
                className="inline-block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                View on GitHub
              </a>
            </div>
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
            <a
              href="https://github.com/agentlogs/agentlogs"
              target="_blank"
              aria-label="GitHub"
              className="hover:text-foreground"
            >
              <GitHubIcon className="size-4" />
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
