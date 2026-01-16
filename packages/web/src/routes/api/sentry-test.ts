import * as Sentry from "@sentry/cloudflare";
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { createDrizzle } from "../../db";
import { getUserRole } from "../../db/queries";
import { createAuth } from "../../lib/auth";

export const Route = createFileRoute("/api/sentry-test")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = createAuth();
        const session = await auth.api.getSession({ headers: request.headers });

        if (!session?.user) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        const db = createDrizzle(env.DB);
        const role = await getUserRole(db, session.user.id);

        if (role !== "admin") {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          throw new Error("Sentry Test Error from API Route");
        } catch (error) {
          Sentry.captureException(error);
          return json({ error: "Test error captured by Sentry" }, { status: 500 });
        }
      },
    },
  },
});
