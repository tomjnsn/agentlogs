import { createFileRoute } from "@tanstack/react-router";

const SENTRY_HOST = "o4510717166682112.ingest.de.sentry.io";
const SENTRY_PROJECT_ID = "4510717169631312";

export const Route = createFileRoute("/api/tunnel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const envelope = await request.text();
          const pieces = envelope.split("\n");

          // Parse the envelope header to get the DSN
          const header = JSON.parse(pieces[0]);
          const dsn = new URL(header.dsn);

          // Validate the DSN matches our expected Sentry project
          if (dsn.host !== SENTRY_HOST) {
            return new Response("Invalid Sentry host", { status: 400 });
          }

          const projectId = dsn.pathname.replace("/", "");
          if (projectId !== SENTRY_PROJECT_ID) {
            return new Response("Invalid Sentry project", { status: 400 });
          }

          // Forward to Sentry
          const sentryUrl = `https://${SENTRY_HOST}/api/${projectId}/envelope/`;
          const response = await fetch(sentryUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-sentry-envelope",
            },
            body: envelope,
          });

          return new Response(response.body, {
            status: response.status,
            headers: {
              "Content-Type": "application/json",
            },
          });
        } catch {
          return new Response("Failed to tunnel event", { status: 500 });
        }
      },
    },
  },
});
