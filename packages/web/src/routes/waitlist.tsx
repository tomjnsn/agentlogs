import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "../lib/server-functions";

export const Route = createFileRoute("/waitlist")({
  beforeLoad: async () => {
    const session = await getSession();
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
      <main className="mx-auto max-w-4xl dark scheme-dark">
        <div className="flex min-h-screen flex-col items-center justify-center border-x border-white/10 bg-dot-pattern">
          <h1 className="mb-4 text-center font-serif text-4xl text-white/95">Join the Waitlist</h1>
          <p className="mb-8 font-mono text-white/60">Sign in with GitHub to join the waitlist.</p>
          <a
            href="/auth/github"
            className="inline-block border border-white/20 bg-white/80 px-6 py-3 font-mono text-lg text-neutral-950 shadow-[4px_4px_0_var(--color-neutral-600)] hover:bg-white/90 active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
          >
            Sign in with GitHub
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl dark scheme-dark">
      <div className="flex min-h-screen flex-col border-x border-white/10">
        {/* Header */}
        <header className="flex h-16 items-center justify-between line-b">
          <div className="flex items-center gap-2 p-4">
            <span className="text-lg font-mono text-white/90">AgentLogs</span>
          </div>
          <div className="flex h-full items-center font-mono text-white/90">
            <span className="px-6 text-sm text-white/60">{session.user.email}</span>
          </div>
        </header>

        {/* Main content */}
        <section className="flex flex-1 flex-col items-center justify-center bg-dot-pattern px-6 py-24">
          <div className="mb-8 flex size-20 items-center justify-center border border-green-500/30 bg-green-500/10">
            <svg className="size-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="mb-4 text-center font-serif text-4xl text-white/95 md:text-5xl">You're on the waitlist</h1>

          <p className="max-w-md text-center font-mono text-lg text-white/60">
            Thanks for signing up, {session.user.name || "there"}! We'll notify you at{" "}
            <span className="text-white/80">{session.user.email}</span> when your account is ready.
          </p>

          <div className="mt-12 border border-white/10 bg-white/5 px-6 py-4">
            <p className="text-center font-mono text-sm text-white/50">
              In the meantime, check out the{" "}
              <a
                href="https://github.com/agentlogs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/80 underline hover:text-white"
              >
                documentation
              </a>{" "}
              to learn how AgentLogs works.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex min-h-16 items-center justify-center line-t">
          <p className="font-mono text-sm text-white/50">© 2025 AgentLogs. All rights reserved.</p>
        </footer>
      </div>
    </main>
  );
}
