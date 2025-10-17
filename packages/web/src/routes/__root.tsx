/// <reference types="vite/client" />
import { Button } from "@/components/ui/button";
// TEMPORARILY DISABLED: Sentry wrapper might be causing issues
// import { wrapCreateRootRouteWithSentry } from "@sentry/tanstackstart-react";
import { createRootRoute, HeadContent, Link, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import React, { type ReactNode } from "react";
import { authClient } from "../lib/auth-client";
import { initializeClientLogger } from "../lib/client-logger";
import { logger } from "../lib/logger";
import { getSession } from "../lib/server-functions";
import appCss from "../styles/globals.css?url";

console.log("🟡 __ROOT.TSX: Module loading");

export const Route = createRootRoute({
  beforeLoad: async () => {
    try {
      const session = await getSession();
      return { session };
    } catch (error) {
      logger.error("Failed to get session in beforeLoad", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Return null session on error to prevent 500s
      return { session: null };
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Vibe Insights" },
      { name: "theme-color", content: "#6366f1" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/android-chrome-192x192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/android-chrome-512x512.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  // Initialize client logger once on mount (dev only)
  React.useEffect(() => {
    initializeClientLogger();
  }, []);

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
  const { session } = Route.useRouteContext();
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
                    `This is configured in WEB_PORT in your .env file and WEB_URL in packages/server/.dev.vars`,
                );
              } else {
                alert(
                  `Authentication error (403 Forbidden)\n\n` +
                    `This might be a CORS or trusted origins issue.\n\n` +
                    `Check that:\n` +
                    `1. The API server is running on http://localhost:8787\n` +
                    `2. WEB_URL in packages/server/.dev.vars matches your current URL\n` +
                    `3. Both servers were restarted after configuration changes`,
                );
              }
            }
          },
        },
      });
    } catch (error) {
      console.error("Unexpected sign out error:", error);
      alert(`Failed to sign out: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">
            <Link to="/" className="hover:text-blue-600">
              Vibe Insights
            </Link>
          </h1>

          <div className="flex items-center gap-4">
            {isSigningIn ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></div>
                <span>Redirecting to GitHub...</span>
              </div>
            ) : session ? (
              <>
                <span className="text-sm text-gray-700">{session.user.email || session.user.name}</span>
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

function NotFoundComponent() {
  return (
    <RootDocument>
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">
              <Link to="/" className="hover:text-blue-600">
                Vibe Insights
              </Link>
            </h1>
          </div>
        </header>
        <main className="container mx-auto px-6 py-8">
          <div className="flex flex-col items-center justify-center py-16">
            <h1 className="mb-4 text-4xl font-bold text-gray-900">404</h1>
            <p className="mb-8 text-lg text-gray-600">Page not found</p>
            <Link to="/" className="text-blue-600 underline hover:text-blue-700">
              Go back home
            </Link>
          </div>
        </main>
      </div>
    </RootDocument>
  );
}
