import { createFileRoute, redirect } from "@tanstack/react-router";
import { ButtonLink } from "../components/oatmeal/elements/button";
import { Container } from "../components/oatmeal/elements/container";
import { Main } from "../components/oatmeal/elements/main";
import { FooterLink, FooterSimple, SocialLink } from "../components/oatmeal/sections/footer-simple";
import { DiscordIcon, Logo, XIcon } from "../components/icons/source-icons";

export const Route = createFileRoute("/waitlist")({
  beforeLoad: ({ context }) => {
    // Use session from parent __root layout (already fetched)
    const session = context.session;
    // If user is already approved, redirect to app
    if (session?.user.role === "user" || session?.user.role === "admin") {
      throw redirect({ to: "/app" });
    }
    // Don't redirect to "/" if no session - this prevents redirect loops
    // Instead, we'll show a sign-in prompt in the component
    return { session };
  },
  component: WaitlistPage,
});

function WaitlistPage() {
  const { session } = Route.useRouteContext();

  // If no session, show sign-in prompt instead of redirecting
  if (!session) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <Header />
        <Main>
          <section className="flex min-h-[calc(100vh-200px)] flex-col items-center justify-center py-16">
            <Container className="flex flex-col items-center gap-6 text-center">
              <h1 className="font-serif text-4xl tracking-tight text-white sm:text-5xl">Join the Waitlist</h1>
              <p className="max-w-md text-lg text-neutral-400">Sign in with GitHub to join the waitlist.</p>
              <ButtonLink href="/auth/github" size="lg">
                Sign in with GitHub
              </ButtonLink>
            </Container>
          </section>
        </Main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <Header email={session.user.email} />
      <Main>
        <section className="flex min-h-[calc(100vh-200px)] flex-col items-center justify-center py-16">
          <Container className="flex flex-col items-center gap-6 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-green-500/10">
              <svg className="size-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="font-serif text-4xl tracking-tight text-white sm:text-5xl">You're on the waitlist</h1>
            <p className="max-w-md text-lg text-neutral-400">
              Thanks for signing up, {session.user.name || "there"}! We'll notify you at{" "}
              <span className="text-white">{session.user.email}</span> when your account is ready.
            </p>
          </Container>
        </section>
      </Main>
      <Footer />
    </div>
  );
}

function Header({ email }: { email?: string }) {
  return (
    <header className="sticky top-0 z-10 bg-neutral-950">
      <nav className="mx-auto flex h-20 max-w-7xl items-center gap-4 px-6 lg:px-10">
        <div className="flex flex-1 items-center gap-6">
          <a href="/" className="flex items-center gap-2">
            <Logo className="size-6 text-white" />
            <span className="font-medium text-white">AgentLogs</span>
          </a>
        </div>
        {email && <span className="text-sm text-neutral-400">{email}</span>}
      </nav>
    </header>
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
        <>
          <SocialLink href="https://x.com/agentlogs" name="X">
            <XIcon />
          </SocialLink>
          <SocialLink href="https://discord.gg/yG4TNv3mjG" name="Discord">
            <DiscordIcon />
          </SocialLink>
        </>
      }
      fineprint={<p>&copy; {new Date().getFullYear()} AgentLogs</p>}
    />
  );
}
