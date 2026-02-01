import { createFileRoute } from "@tanstack/react-router";
import { ButtonLink, PlainButtonLink } from "../components/oatmeal/elements/button";
import { Main } from "../components/oatmeal/elements/main";
import { Screenshot } from "../components/oatmeal/elements/screenshot";
import { ArrowNarrowRightIcon } from "../components/oatmeal/icons/arrow-narrow-right-icon";
import { CallToActionSimple } from "../components/oatmeal/sections/call-to-action-simple";
import { Faq, FAQsTwoColumnAccordion } from "../components/oatmeal/sections/faqs-two-column-accordion";
import { FeatureThreeColumnWithDemos, Features } from "../components/oatmeal/sections/features-three-column-with-demos";
import { FooterLink, FooterSimple, SocialLink } from "../components/oatmeal/sections/footer-simple";
import { HeroLeftAlignedWithDemo } from "../components/oatmeal/sections/hero-left-aligned-with-demo";
import { ClaudeCodeIcon, CodexIcon, DiscordIcon, Logo, OpenCodeIcon } from "../components/icons/source-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";

export const Route = createFileRoute("/home")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <Main>
        <HeroSection />
        <FeatureSection />
        <FAQSection />
        <CTASection />
      </Main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-10 bg-neutral-950">
      <nav className="mx-auto flex h-20 max-w-7xl items-center gap-4 px-6 lg:px-10">
        <div className="flex flex-1 items-center gap-6">
          <a href="/" className="flex items-center gap-2">
            <Logo className="size-6 text-white" />
            <span className="font-medium text-white">AgentLogs</span>
          </a>
        </div>
        <div className="flex items-center gap-6">
          <a href="https://agentlogs.ai/docs" className="text-sm text-neutral-400 hover:text-white">
            Docs
          </a>
          <ButtonLink href="/auth/github">Join the waitlist</ButtonLink>
        </div>
      </nav>
    </header>
  );
}

function HeroSection() {
  return (
    <HeroLeftAlignedWithDemo
      headline={
        <>
          Coding agents, visible to your team.{" "}
          <span className="group/icons inline-flex items-center align-middle">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  data-icon="claude"
                  className="isolate inline-flex size-14 cursor-pointer items-center justify-center rounded-full border-4 border-neutral-950 bg-[#e87b35] transition-transform duration-200 group-has-[[data-icon=codex]:hover]/icons:-translate-x-1.5 group-has-[[data-icon=opencode]:hover]/icons:-translate-x-1.5"
                >
                  <ClaudeCodeIcon className="size-7 text-white" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">Claude Code</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  data-icon="codex"
                  className="isolate -ml-2 inline-flex size-14 cursor-pointer items-center justify-center rounded-full border-4 border-neutral-950 bg-black transition-transform duration-200 group-has-[[data-icon=claude]:hover]/icons:translate-x-1.5 group-has-[[data-icon=opencode]:hover]/icons:-translate-x-1.5"
                >
                  <CodexIcon className="size-7 text-white" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">Codex CLI</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  data-icon="opencode"
                  className="isolate -ml-2 inline-flex size-14 cursor-pointer items-center justify-center rounded-full border-4 border-neutral-950 bg-white transition-transform duration-200 group-has-[[data-icon=claude]:hover]/icons:translate-x-1.5 group-has-[[data-icon=codex]:hover]/icons:translate-x-1.5"
                >
                  <OpenCodeIcon className="size-7 text-black" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">OpenCode</TooltipContent>
            </Tooltip>
          </span>
        </>
      }
      subheadline={
        <p>
          Your team's AI coding sessions are invisible. See what prompts work, learn from each other's workflows, and
          build institutional knowledge that compounds.
        </p>
      }
      cta={
        <div className="flex flex-wrap items-center gap-4">
          <ButtonLink href="/waitlist" size="lg">
            Join the waitlist
          </ButtonLink>
          <PlainButtonLink href="https://agentlogs.ai/s/hpnyf840l453gx4ojuoygbme">
            See it in action
            <ArrowNarrowRightIcon />
          </PlainButtonLink>
        </div>
      }
      demo={
        <Screenshot wallpaper="art" placement="bottom" className="aspect-video rounded-2xl">
          <img
            src="/features/detail.png"
            alt="AgentLogs session detail"
            className="w-full shadow-2xl ring-1 ring-white/10 ring-inset"
          />
        </Screenshot>
      }
    />
  );
}

function FeatureSection() {
  return (
    <Features
      headline="Everything you need to understand what your agents are doing."
      subheadline={
        <p>
          Track every session, share context across your team, and build a knowledge base of prompts that actually work.
        </p>
      }
      features={
        <>
          <FeatureThreeColumnWithDemos
            demo={
              <Screenshot wallpaper="green" placement="bottom-right" className="h-56">
                <img src="/features/list.png" alt="Team session list" />
              </Screenshot>
            }
            headline="Team Dashboard"
            subheadline="See what your team is working on. Share sessions, learn from each other's prompts, and build institutional knowledge."
          />
          <FeatureThreeColumnWithDemos
            demo={
              <Screenshot wallpaper="blue" placement="bottom-right" className="h-56">
                <img src="/features/git.png" alt="Git integration" />
              </Screenshot>
            }
            headline="Git Integration"
            subheadline="See which session wrote which code. Works whenever your clanker is the one committing."
          />
          <FeatureThreeColumnWithDemos
            demo={
              <Screenshot wallpaper="purple" placement="bottom-left" className="h-56">
                <img src="/features/diff.png" alt="Share sessions" />
              </Screenshot>
            }
            headline="Beautiful Sharing"
            subheadline="Share sessions with a link. Clean, readable pages with syntax highlighting and rich previews that make your prompts look as good as they work."
          />
        </>
      }
    />
  );
}

function FAQSection() {
  return (
    <FAQsTwoColumnAccordion headline="Questions & Answers">
      <Faq
        question="How does AgentLogs capture my sessions?"
        answer={
          <p>
            AgentLogs uses lightweight plugins for your coding agents. Install a plugin with a single command and it
            captures transcripts at the end of each session, automatically linking them to your git commits. No
            additional configuration needed.
          </p>
        }
      />
      <Faq
        question="How does AgentLogs protect my secrets and sensitive data?"
        answer={
          <p>
            AgentLogs automatically scans all transcripts for secrets before uploading, using 1,600+ detection patterns
            covering API keys, tokens, passwords, and database credentials. Detected secrets are redacted entirely on
            your machine. They never leave your computer in plain text.
          </p>
        }
      />
      <Faq
        question="Who can see my transcripts?"
        answer={
          <p>
            You control visibility for each transcript: Private (only you), Team (you and team members), or Public
            (anyone with the link). By default, transcripts from public repos are public, private repos are
            team-visible, and sessions without a detected repo are private. You can override this per repository.
          </p>
        }
      />
      <Faq
        question="Which coding agents are supported?"
        answer={
          <p>
            AgentLogs currently supports Claude Code, Codex CLI, and OpenCode. Each has its own integration method, and
            we're actively adding support for more agents. Check our docs for the latest compatibility info.
          </p>
        }
      />
      <Faq
        question="How does AgentLogs compare to git-ai or agent-trace?"
        answer={
          <p>
            Tools like git-ai and agent-trace focus on tracking AI attribution at the code level, recording which lines
            were AI-generated. AgentLogs focuses on the session and prompt level, capturing the full context of how code
            was created. We see these as complementary and plan to integrate them in the future. AgentLogs is the ideal
            platform for surfacing this kind of attribution data.
          </p>
        }
      />
    </FAQsTwoColumnAccordion>
  );
}

function CTASection() {
  return (
    <CallToActionSimple
      headline="Want to adopt AgentLogs for your team?"
      subheadline={
        <p>
          If you're working in a team that wants to adopt AgentLogs, reach out to fast-track your waitlist access and
          get dedicated onboarding support.
        </p>
      }
      cta={
        <div className="flex">
          <ButtonLink href="mailto:hi@agentlogs.ai" size="lg">
            Contact us
          </ButtonLink>
        </div>
      }
    />
  );
}

function Footer() {
  return (
    <FooterSimple
      links={
        <>
          <FooterLink href="https://agentlogs.ai/docs">Docs</FooterLink>
          <FooterLink href="https://agentlogs.ai/docs/changelog">Changelog</FooterLink>
        </>
      }
      socialLinks={
        <SocialLink href="https://discord.gg/yG4TNv3mjG" name="Discord">
          <DiscordIcon />
        </SocialLink>
      }
      fineprint={<p>&copy; {new Date().getFullYear()} AgentLogs</p>}
    />
  );
}
