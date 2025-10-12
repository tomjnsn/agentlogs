/// <reference types="vite/client" />
import React, { type ReactNode } from "react";
import {
  createRootRoute,
  Link,
  Outlet,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";
import { Button } from "@/components/ui/button";
import appCss from "../styles/globals.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Vibe Insights" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <AppContent />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AppContent() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = React.useState(false);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    // Note: The redirect will happen before this completes, but setting state
    // ensures we show the loading state immediately
    await authClient.signIn.social({
      provider: "github",
      callbackURL: "http://localhost:3000/", // Redirect back to web app after auth
    });
  };

  const handleSignOut = async () => {
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            router.invalidate(); // Invalidate router to clear cached data
          },
          onError: (ctx) => {
            console.error("Sign out error:", ctx.error);
            const error = ctx.error as any;

            // Check if it's a CORS or origin error
            if (error?.status === 403) {
              const currentPort = window.location.port;
              const expectedPort = "3000";

              if (currentPort !== expectedPort) {
                alert(
                  `Port mismatch detected!\n\n` +
                    `You're accessing the app on port ${currentPort}, but it should be on port ${expectedPort}.\n\n` +
                    `Please access the app at: http://localhost:${expectedPort}\n\n` +
                    `This is configured in WEB_PORT in your .env file and WEB_URL in packages/server/.dev.vars`
                );
              } else {
                alert(
                  `Authentication error (403 Forbidden)\n\n` +
                    `This might be a CORS or trusted origins issue.\n\n` +
                    `Check that:\n` +
                    `1. The API server is running on http://localhost:8787\n` +
                    `2. WEB_URL in packages/server/.dev.vars matches your current URL\n` +
                    `3. Both servers were restarted after configuration changes`
                );
              }
            }
          },
        },
      });
    } catch (error) {
      console.error("Unexpected sign out error:", error);
      alert(
        `Failed to sign out: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">
            <Link to="/" className="hover:text-blue-600">
              Vibe Insights
            </Link>
          </h1>

          <div className="flex items-center gap-4">
            {isSigningIn ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full"></div>
                <span>Redirecting to GitHub...</span>
              </div>
            ) : isPending ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full"></div>
                <span>Loading session...</span>
              </div>
            ) : session ? (
              <>
                <span className="text-sm text-gray-700">
                  {session.user.email || session.user.name}
                </span>
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
