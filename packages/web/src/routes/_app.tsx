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
    <div className="min-h-screen bg-background dark scheme-dark">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">
            <Link to="/app" className="transition-colors hover:text-primary">
              AgentLogs
            </Link>
          </h1>

          <div className="flex items-center gap-4">
            {isSigningIn ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary"></div>
                <span>Redirecting to GitHub...</span>
              </div>
            ) : session ? (
              <>
                <span className="text-sm text-foreground">{session.user.name || session.user.email}</span>
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
        </div>
      </header>
      <main className="container mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
