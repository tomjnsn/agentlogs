import { createFileRoute } from "@tanstack/react-router";
import { ButtonLink, PlainButtonLink } from "../components/oatmeal/elements/button";
import { Container } from "../components/oatmeal/elements/container";
import { InstallCommand } from "../components/oatmeal/elements/install-command";
import { Main } from "../components/oatmeal/elements/main";
import { Screenshot } from "../components/oatmeal/elements/screenshot";
import { ArrowNarrowRightIcon } from "../components/oatmeal/icons/arrow-narrow-right-icon";
import { FeatureThreeColumnWithDemos, Features } from "../components/oatmeal/sections/features-three-column-with-demos";
import { FooterLink, FooterSimple, SocialLink } from "../components/oatmeal/sections/footer-simple";
import { ClaudeCodeIcon, CodexIcon, DiscordIcon, Logo, OpenCodeIcon } from "../components/icons/source-icons";

export const Route = createFileRoute("/home")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <Main>
        <Hero />
        <HeroScreenshot />
        <FeatureSection />
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

function Hero() {
  return (
    <section className="py-16">
      <Container className="flex flex-col gap-16">
        <div className="flex flex-col items-start gap-6">
          <h1 className="max-w-2xl font-serif text-5xl/12 tracking-tight text-white sm:text-[5rem]/20">
            Coding agents, visible to your team.{" "}
            <span className="group/icons inline-flex items-center align-middle">
              <span className="inline-flex size-14 items-center justify-center rounded-full border-4 border-neutral-950 bg-[#e87b35] transition-transform duration-200 [.group\\/icons:has(:nth-child(2):hover)_&]:-translate-x-2 [.group\\/icons:has(:nth-child(3):hover)_&]:-translate-x-3">
                <ClaudeCodeIcon className="size-7 text-white" />
              </span>
              <span className="-ml-2 inline-flex size-14 items-center justify-center rounded-full border-4 border-neutral-950 bg-black transition-transform duration-200">
                <CodexIcon className="size-7 text-white" />
              </span>
              <span className="-ml-2 inline-flex size-14 items-center justify-center rounded-full border-4 border-neutral-950 bg-white transition-transform duration-200 [.group\\/icons:has(:nth-child(1):hover)_&]:translate-x-3 [.group\\/icons:has(:nth-child(2):hover)_&]:translate-x-2">
                <OpenCodeIcon className="size-7 text-black" />
              </span>
            </span>
          </h1>
          <p className="max-w-xl text-lg/8 text-neutral-400">
            Prompts deserve version control too. Capture every coding agent session, automatically link them to your git
            commits, and help your team learn from each other.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <InstallCommand snippet="npx agentlogs login" />
            <PlainButtonLink href="https://agentlogs.ai/docs">
              Read the docs
              <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}

function HeroScreenshot() {
  return (
    <section className="pb-16">
      <Container>
        <Screenshot wallpaper="art" placement="bottom" className="aspect-video rounded-2xl">
          <img
            src="/features/detail.png"
            alt="AgentLogs session detail"
            className="w-full shadow-2xl ring-1 ring-white/10 ring-inset"
          />
        </Screenshot>
      </Container>
    </section>
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
            subheadline="Every session automatically linked to the commits it produced."
          />
          <FeatureThreeColumnWithDemos
            demo={
              <Screenshot wallpaper="purple" placement="bottom-left" className="h-56">
                <img src="/features/diff.png" alt="Code diffs" />
              </Screenshot>
            }
            headline="Code Diffs"
            subheadline="Review the exact changes your agents made, line by line."
          />
        </>
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
