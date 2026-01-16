import { Button } from "@/components/ui/button";
import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import React from "react";
import { authClient } from "../lib/auth-client";
import { getSession } from "../lib/server-functions";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) {
      throw redirect({ to: "/" });
    }
    // Waitlist users can't access the app
    if (session.user.role === "waitlist") {
      throw redirect({ to: "/waitlist" });
    }
    return { session };
  },
  component: AppLayout,
});

function AppLayout() {
  const { session } = Route.useRouteContext();
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = React.useState(false);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    await authClient.signIn.social({
      provider: "github",
      callbackURL: "http://localhost:3000/app",
    });
  };

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => router.invalidate(),
      },
    });
  };

  return (
    <div className="dark min-h-screen bg-background scheme-dark">
      <header className="flex h-16 items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2 p-4">
          <Link to="/app" className="text-lg font-semibold text-white/90 transition-colors hover:text-white">
            AgentLogs
          </Link>
        </div>

        <div className="flex h-full items-center gap-4 px-4 text-white/90">
          {isSigningIn ? (
            <div className="flex items-center gap-2 text-sm">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80"></div>
              <span>Redirecting to GitHub...</span>
            </div>
          ) : session ? (
            <>
              {session.user.role === "admin" && (
                <Link to="/app/admin" className="text-sm text-white/50 transition-colors hover:text-white/90">
                  Admin
                </Link>
              )}
              <span className="text-sm">{session.user.name || session.user.email}</span>
              <Button onClick={handleSignOut} variant="outline" size="sm">
                Sign Out
              </Button>
            </>
          ) : (
            <Button onClick={handleSignIn} size="sm" disabled={isSigningIn}>
              Sign in with GitHub
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
