/// <reference types="vite/client" />
import { Button } from "@/components/ui/button";
import { createRootRoute, HeadContent, Link, Outlet, Scripts, useRouter, useRouterState } from "@tanstack/react-router";
import React, { type ReactNode } from "react";
import { authClient } from "../lib/auth-client";
import { initializeClientLogger } from "../lib/client-logger";
import { getSession } from "../lib/server-functions";
import appCss from "../styles/globals.css?url";

export const Route = createRootRoute({
  beforeLoad: async () => {
    const session = await getSession();
    return { session };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Vibe Insights" },
      { name: "theme-color", content: "#6366f1" },
    ],
    links: [
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicons/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicons/favicon-16x16.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon/apple-touch-icon-180x180.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  const { location } = useRouterState();
  const isLandingPage = location.pathname === "/";

  // Initialize client logger once on mount (dev only)
  React.useEffect(() => {
    initializeClientLogger();
  }, []);

  // Landing page renders without app shell
  if (isLandingPage) {
    return (
      <RootDocument>
        <Outlet />
      </RootDocument>
    );
  }

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
        {import.meta.env.DEV && (
          <>
            <script src="//unpkg.com/react-grab/dist/index.global.js" crossOrigin="anonymous" />
            <script src="//unpkg.com/@react-grab/claude-code/dist/client.global.js" crossOrigin="anonymous" />
          </>
        )}
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
      callbackURL: "http://localhost:3000/app", // Redirect back to dashboard after auth
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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">
            <Link to="/app" className="transition-colors hover:text-primary">
              🔮 Vibe Insights
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
                <span className="text-sm text-foreground">{session.user.email || session.user.name}</span>
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
      <main className="container mx-auto px-6 py-8">
        <div className="flex flex-col items-center justify-center py-16">
          <h1 className="mb-4 text-4xl font-bold text-foreground">404</h1>
          <p className="mb-8 text-lg text-muted-foreground">Page not found</p>
          <Link to="/" className="font-medium text-primary underline underline-offset-4">
            Go back home
          </Link>
        </div>
      </main>
    </RootDocument>
  );
}
