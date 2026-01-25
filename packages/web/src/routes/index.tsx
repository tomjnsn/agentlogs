import { createFileRoute } from "@tanstack/react-router";
import { Logo } from "../components/icons/source-icons";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-neutral-950 bg-linear-to-b from-neutral-950 to-white/5">
      <div className="absolute top-0 right-0 p-6">
        <a href="/auth/github" className="text-sm text-white/50 hover:text-white/80">
          Sign in
        </a>
      </div>

      <div className="flex items-center gap-3">
        <Logo className="size-10" />
        <h1 className="font-serif text-5xl text-white/90">AgentLogs</h1>
      </div>

      <p className="mt-6 text-lg text-white/60">See what your coding agents are doing.</p>

      <a
        href="/auth/github"
        className="mt-12 inline-block border border-white/20 bg-white/80 px-6 py-3 text-center font-medium text-neutral-950 shadow-[4px_4px_0_var(--color-neutral-600)] hover:bg-white/90 active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
      >
        Join the waitlist
      </a>
    </main>
  );
}
