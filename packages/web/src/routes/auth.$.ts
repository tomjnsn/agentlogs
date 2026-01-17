import { createFileRoute, redirect } from "@tanstack/react-router";
import { createAuth } from "../lib/auth";

// Server-side OAuth redirect route: /auth/github
export const Route = createFileRoute("/auth/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const provider = params._splat;
        if (!provider) {
          throw redirect({ to: "/" });
        }

        const auth = createAuth();
        const result = await auth.api.signInSocial({
          body: { provider, callbackURL: "/app" },
          headers: request.headers,
          returnHeaders: true,
        });

        if (!result.response?.url) {
          throw redirect({ to: "/" });
        }

        return new Response(null, {
          status: 302,
          headers: {
            ...Object.fromEntries(result.headers?.entries() ?? []),
            Location: result.response.url,
          },
        });
      },
    },
  },
});
