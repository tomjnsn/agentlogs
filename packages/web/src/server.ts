import * as Sentry from "@sentry/cloudflare";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

const SENTRY_DSN = "https://29ad86aa7e3802d0b0838f4d7ab55311@o4510717166682112.ingest.de.sentry.io/4510717169631312";

export default Sentry.withSentry(
  () => ({
    dsn: SENTRY_DSN,
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
  }),
  createServerEntry({
    fetch(request: Request) {
      return handler.fetch(request);
    },
  }) as ExportedHandler,
);
