/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import React, { type ReactNode } from "react";
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
      { title: "AgentLogs" },
      { name: "theme-color", content: "#6366f1" },
    ],
    links: [
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicons/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicons/favicon-16x16.png",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon/apple-touch-icon-180x180.png",
      },
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
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className="dark:scheme-dark">
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

function NotFoundComponent() {
  return (
    <main className="container mx-auto px-6 py-8">
      <div className="flex flex-col items-center justify-center py-16">
        <h1 className="mb-4 text-4xl font-bold text-foreground">404</h1>
        <p className="mb-8 text-lg text-muted-foreground">Page not found</p>
        <a href="/" className="font-medium text-primary underline underline-offset-4">
          Go back home
        </a>
      </div>
    </main>
  );
}
